import { existsSync, rmSync } from 'fs'
import { lstat, mkdir, mkdtemp, readdir, readlink, realpath, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { parseArgs } from 'util'
import * as Schema from 'effect/Schema'
import { isSemVer } from './build'
import { APP_ENTRYPOINT, binaryPath, compileBinary } from './compile'
import { detectHost } from './host'
import { pack } from './pack'
import { type Sandbox, runInTerminal, terminalFailures } from './smoke'
import { BUILD_TARGETS, BuildTarget, Host, PACKAGE_NAME } from './targets'

// Proves that a published 1.10 install reaches the compiled 2.0 packages, without publishing anything:
// the test version is served by a registry on 127.0.0.1 that proxies every other request to npm.

const PUBLISHED_VERSION = '1.10.0'
const DEFAULT_TEST_VERSION = '2.0.0-upgradecheck.0'
const UPSTREAM_REGISTRY = 'https://registry.npmjs.org'
const INSTALL_TIMEOUT_MS = 240_000
const COMMAND_TIMEOUT_MS = 60_000
const PLACEHOLDER_EXIT_CODE = 97

// The launcher and bin/platform.sh need only these; tmux, Herdr, Bun, and Node stay unreachable.
const LAUNCHER_TOOLS = ['sh', 'dirname', 'readlink', 'uname', 'grep', 'head', 'ldd'] as const
const SYSTEM_PATH = '/usr/local/bin:/usr/bin:/bin'

// Runs 1.10's own updater from inside the installed package, so it detects the install the way 1.10 does.
// Only the registry lookup is replaced: 1.10 hardcodes registry.npmjs.org, which has no test version.
const DRIVER_FILE = 'upgrade-check-driver.ts'

const DRIVER_SOURCE = `import { checkAndUpdate, updateEvents } from './src/update/index.ts'

const version = process.env.MUX_SESH_UPGRADE_CHECK_VERSION ?? null
const events = []
updateEvents.on(event => events.push(event))
await checkAndUpdate({ autoUpdate: true }, { getLatestVersion: async () => version })
console.log(JSON.stringify({ runtimePath: process.argv[1], events }))
`

const USAGE = [
  'Usage: bun tools/build/upgrade-check.ts [--version <semver>] [--keep]',
  `  --version <semver>  the version to build and serve (default ${DEFAULT_TEST_VERSION})`,
  '  --keep              keep the temporary directory for inspection',
].join('\n')

const decodeManifest = Schema.decodeUnknownSync(
  Schema.Struct({ name: Schema.String, version: Schema.String })
)

const JsonObject = Schema.Record(Schema.String, Schema.Json)
const decodeJsonObject = Schema.decodeUnknownSync(JsonObject)
const isJsonObject = Schema.is(JsonObject)

const decodePackOutput = Schema.decodeUnknownSync(
  Schema.Array(Schema.Struct({ filename: Schema.String }))
)

const decodeDriverReport = Schema.decodeUnknownSync(
  Schema.Struct({
    runtimePath: Schema.String,
    events: Schema.Array(
      Schema.Struct({
        kind: Schema.String,
        currentVersion: Schema.String,
        version: Schema.String,
        installMethod: Schema.String,
      })
    ),
  })
)

type JsonObject = typeof JsonObject.Type

interface Check {
  readonly scenario: string
  readonly name: string
  readonly ok: boolean
  readonly detail: string
}

interface CommandResult {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly stdout: string
  readonly stderr: string
}

interface Workspace {
  readonly root: string
  readonly installPath: string
  readonly terminalPath: string
  readonly npmCache: string
  readonly bunCache: string
}

interface LocalPackage {
  readonly name: string
  readonly version: string
  readonly manifest: JsonObject
  readonly tarball: Uint8Array<ArrayBuffer>
}

interface Registry {
  readonly url: string
  readonly clients: ReadonlySet<string>
  readonly proxied: () => number
  readonly stop: () => Promise<void>
}

interface ScenarioEnv {
  readonly home: string
  readonly npmPrefix: string
  readonly bunInstall: string
  readonly env: Readonly<Record<string, string>>
}

// Where a scenario's package manager put mux-sesh, and how the user would run it.
interface InstallLayout {
  readonly packageRoot: string
  readonly command: string
  readonly expectPostinstallLink: boolean
}

interface Build {
  readonly host: BuildTarget
  readonly hostCompatible: readonly string[]
  readonly binarySha256: string
  readonly packages: readonly LocalPackage[]
}

class Checks {
  readonly all: Check[] = []

  constructor(private readonly scenario: string) {}

  record(name: string, ok: boolean, detail: string): boolean {
    this.all.push({ scenario: this.scenario, name, ok, detail })

    return ok
  }
}

function tail(text: string, lines = 12): string {
  return text.trim().split('\n').slice(-lines).join('\n')
}

function describeFailure(result: CommandResult): string {
  const status = result.signal ? `killed by ${result.signal}` : `exit ${result.exitCode}`
  const output = tail(`${result.stdout}\n${result.stderr}`)

  return output ? `${status}: ${output}` : status
}

async function run(
  command: readonly string[],
  options: {
    readonly cwd: string
    readonly env: Readonly<Record<string, string>>
    readonly timeoutMs: number
  }
): Promise<CommandResult> {
  const proc = Bun.spawn([...command], {
    cwd: options.cwd,
    env: { ...options.env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: options.timeoutMs,
    killSignal: 'SIGKILL',
  })

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  await proc.exited

  return { exitCode: proc.exitCode, signal: proc.signalCode, stdout, stderr }
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)

    return true
  } catch {
    return false
  }
}

async function readVersion(packageRoot: string): Promise<string | undefined> {
  try {
    return decodeManifest(await Bun.file(join(packageRoot, 'package.json')).json()).version
  } catch {
    return undefined
  }
}

function hostCompatibleTargets(host: Host): readonly BuildTarget[] {
  return BUILD_TARGETS.filter(
    target =>
      target.os === host.os &&
      target.arch === host.arch &&
      (target.os === 'darwin' || host.os === 'darwin' || target.libc === host.libc)
  )
}

function placeholderScript(name: string, host: string): string {
  return `#!/bin/sh\necho "upgrade check placeholder: ran ${name} instead of ${host}" >&2\nexit ${PLACEHOLDER_EXIT_CODE}\n`
}

async function createWorkspace(): Promise<Workspace> {
  const root = await mkdtemp(join(tmpdir(), 'mux-sesh-upgrade-check-'))
  const node = Bun.which('node')
  const npm = Bun.which('npm')

  if (!node || !npm) throw new Error('The upgrade check needs node and npm on PATH.')

  // npm's own directory, not its resolved script, keeps the wrapper npm installs beside node.
  const toolDirs = [dirname(await realpath(node)), dirname(npm), dirname(process.execPath)]

  const terminalPath = join(root, 'terminal-path')
  await mkdir(terminalPath)

  for (const tool of LAUNCHER_TOOLS) {
    const path = Bun.which(tool, { PATH: SYSTEM_PATH })

    if (path) await symlink(path, join(terminalPath, tool))
    else if (tool !== 'ldd')
      throw new Error(`The upgrade check needs \`${tool}\` in ${SYSTEM_PATH}.`)
  }

  return {
    root,
    installPath: [...new Set(toolDirs), SYSTEM_PATH].join(':'),
    terminalPath,
    npmCache: join(root, 'npm-cache'),
    bunCache: join(root, 'bun-cache'),
  }
}

async function scenarioEnv(
  workspace: Workspace,
  scenario: string,
  registry: string
): Promise<ScenarioEnv> {
  const dir = join(workspace.root, 'scenarios', scenario)
  const home = join(dir, 'home')
  const npmPrefix = join(dir, 'npm-prefix')
  const bunInstall = join(home, '.bun')
  await Promise.all(
    [home, npmPrefix, join(dir, 'tmp')].map(path => mkdir(path, { recursive: true }))
  )

  // npm reads npm_config_*; Bun reads ~/.npmrc and BUN_CONFIG_REGISTRY. Both point only at the local registry.
  const npmrc = join(home, '.npmrc')
  const globalNpmrc = join(dir, 'npmrc-global')
  await Bun.write(npmrc, `registry=${registry}/\n`)
  await Bun.write(globalNpmrc, '')

  return {
    home,
    npmPrefix,
    bunInstall,
    env: {
      PATH: workspace.installPath,
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_CACHE_HOME: join(home, '.cache'),
      XDG_DATA_HOME: join(home, '.local/share'),
      XDG_STATE_HOME: join(home, '.local/state'),
      TMPDIR: join(dir, 'tmp'),
      LANG: 'C.UTF-8',
      npm_config_prefix: npmPrefix,
      npm_config_cache: workspace.npmCache,
      npm_config_userconfig: npmrc,
      npm_config_globalconfig: globalNpmrc,
      npm_config_registry: `${registry}/`,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
      BUN_INSTALL: bunInstall,
      BUN_INSTALL_CACHE_DIR: workspace.bunCache,
      BUN_CONFIG_REGISTRY: `${registry}/`,
    },
  }
}

async function build(workspace: Workspace, version: string): Promise<Build> {
  const host = detectHost()
  const target = host ? Host.candidates(host)[0] : undefined

  if (!host || !target) {
    throw new Error(`mux-sesh has no binary target for ${process.platform}-${process.arch}.`)
  }

  const npmRoot = join(workspace.root, 'npm')
  const hostName = BuildTarget.packageName(target)

  const compiled = await compileBinary({
    entrypoint: APP_ENTRYPOINT,
    target,
    version,
    outfile: binaryPath(target, npmRoot),
  })

  if (!compiled.ok) throw new Error(compiled.message)

  // Every platform package is served, as on npm; only this machine's carries a real binary.
  for (const other of BUILD_TARGETS.filter(candidate => candidate !== target)) {
    await Bun.write(
      binaryPath(other, npmRoot),
      placeholderScript(BuildTarget.packageName(other), hostName)
    )
  }

  const packed = await pack(BUILD_TARGETS, { version, npmRoot })

  if (!packed.ok) throw new Error(packed.message)

  const tarballs = join(workspace.root, 'tarballs')
  await mkdir(tarballs)
  const env = await scenarioEnv(workspace, 'pack', 'http://127.0.0.1:9')
  const packages: LocalPackage[] = []

  for (const directory of packed.directories) {
    const result = await run(['npm', 'pack', directory, '--pack-destination', tarballs, '--json'], {
      cwd: env.home,
      env: env.env,
      timeoutMs: COMMAND_TIMEOUT_MS,
    })

    if (result.exitCode !== 0)
      throw new Error(`npm pack ${directory} failed: ${describeFailure(result)}`)

    const [entry] = decodePackOutput(JSON.parse(result.stdout))

    if (!entry) throw new Error(`npm pack ${directory} reported no tarball.`)

    const manifestJson: unknown = await Bun.file(join(directory, 'package.json')).json()
    const manifest = decodeManifest(manifestJson)

    packages.push({
      ...manifest,
      manifest: decodeJsonObject(manifestJson),
      tarball: await Bun.file(join(tarballs, entry.filename)).bytes(),
    })
  }

  return {
    host: target,
    hostCompatible: hostCompatibleTargets(host).map(candidate =>
      BuildTarget.packageName(candidate)
    ),
    binarySha256: sha256(await Bun.file(binaryPath(target, npmRoot)).bytes()),
    packages,
  }
}

function objectField(document: JsonObject, key: string): JsonObject {
  const value = document[key]

  return isJsonObject(value) ? value : {}
}

function startRegistry(packages: readonly LocalPackage[]): Registry {
  const published = new Date().toISOString()
  const byName = new Map(packages.map(entry => [entry.name, entry]))

  const tarballs = new Map(
    packages.map(entry => [`/${entry.name}/-/${entry.name}-${entry.version}.tgz`, entry])
  )

  const upstreamPackuments = new Map<string, Promise<JsonObject>>()
  const clients = new Set<string>()
  let proxied = 0

  const upstreamPackument = (name: string): Promise<JsonObject> => {
    const cached = upstreamPackuments.get(name)

    if (cached) return cached

    const loaded = fetch(`${UPSTREAM_REGISTRY}/${name}`, {
      headers: { accept: 'application/json' },
    }).then(async response => {
      if (response.status === 404) return {}

      if (!response.ok) throw new Error(`${UPSTREAM_REGISTRY}/${name} answered ${response.status}`)

      return decodeJsonObject(await response.json())
    })

    upstreamPackuments.set(name, loaded)

    return loaded
  }

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request, self): Promise<Response> {
      const url = new URL(request.url)
      const base = `http://127.0.0.1:${self.port}`

      const versionDocument = (entry: LocalPackage) => {
        const tarball = new Bun.CryptoHasher('sha512').update(entry.tarball).digest('base64')

        return {
          ...entry.manifest,
          _id: `${entry.name}@${entry.version}`,
          dist: {
            tarball: `${base}/${entry.name}/-/${entry.name}-${entry.version}.tgz`,
            shasum: new Bun.CryptoHasher('sha1').update(entry.tarball).digest('hex'),
            integrity: `sha512-${tarball}`,
          },
        }
      }

      const tarball = tarballs.get(url.pathname)

      if (tarball) {
        clients.add(request.headers.get('user-agent')?.split(' ')[0] ?? 'unknown')

        return new Response(tarball.tarball, {
          headers: { 'content-type': 'application/octet-stream' },
        })
      }

      const [name = '', rest] = url.pathname.slice(1).split('/', 2)
      const local = byName.get(decodeURIComponent(name))

      if (local && rest === undefined) {
        clients.add(request.headers.get('user-agent')?.split(' ')[0] ?? 'unknown')

        try {
          const upstream = await upstreamPackument(name)

          return Response.json({
            ...upstream,
            _id: local.name,
            name: local.name,
            'dist-tags': { ...objectField(upstream, 'dist-tags'), latest: local.version },
            versions: {
              ...objectField(upstream, 'versions'),
              [local.version]: versionDocument(local),
            },
            time: {
              ...objectField(upstream, 'time'),
              modified: published,
              [local.version]: published,
            },
          })
        } catch (cause) {
          return new Response(`upgrade check registry: ${String(cause)}`, { status: 502 })
        }
      }

      if (local && (rest === 'latest' || rest === local.version)) {
        return Response.json(versionDocument(local))
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('upgrade check registry: only reads are proxied', { status: 405 })
      }

      proxied += 1

      try {
        const response = await fetch(`${UPSTREAM_REGISTRY}${url.pathname}${url.search}`, {
          method: request.method,
          headers: { accept: request.headers.get('accept') ?? '*/*' },
        })

        const headers = new Headers()
        const contentType = response.headers.get('content-type')

        if (contentType) headers.set('content-type', contentType)

        return new Response(await response.arrayBuffer(), { status: response.status, headers })
      } catch (cause) {
        return new Response(`upgrade check registry: ${String(cause)}`, { status: 502 })
      }
    },
  })

  return {
    url: `http://127.0.0.1:${server.port}`,
    clients,
    proxied: () => proxied,
    stop: () => server.stop(true),
  }
}

async function install(
  checks: Checks,
  label: string,
  command: readonly string[],
  env: ScenarioEnv
): Promise<boolean> {
  const result = await run(command, { cwd: env.home, env: env.env, timeoutMs: INSTALL_TIMEOUT_MS })

  return checks.record(
    label,
    result.exitCode === 0,
    result.exitCode === 0 ? command.join(' ') : describeFailure(result)
  )
}

async function checkPublishedInstall(checks: Checks, layout: InstallLayout): Promise<boolean> {
  const version = await readVersion(layout.packageRoot)
  const runsFromSource = existsSync(join(layout.packageRoot, 'src/index.tsx'))
  const command = await exists(layout.command)

  return checks.record(
    `${PUBLISHED_VERSION} installed from source`,
    version === PUBLISHED_VERSION && runsFromSource && command,
    `version ${version ?? 'missing'}, src/index.tsx ${runsFromSource ? 'present' : 'missing'}, ${layout.command} ${command ? 'present' : 'missing'}`
  )
}

// 1.10's updater, unchanged, from inside the installed package; the event is what its UI would show.
async function runPublishedUpdater(
  checks: Checks,
  layout: InstallLayout,
  env: ScenarioEnv,
  testVersion: string,
  method: 'npm' | 'bun'
): Promise<boolean> {
  const driver = join(layout.packageRoot, DRIVER_FILE)
  await Bun.write(driver, DRIVER_SOURCE)

  const result = await run([process.execPath, driver], {
    cwd: layout.packageRoot,
    env: { ...env.env, MUX_SESH_UPGRADE_CHECK_VERSION: testVersion },
    timeoutMs: INSTALL_TIMEOUT_MS,
  })

  if (result.exitCode !== 0) {
    return checks.record(`${PUBLISHED_VERSION} updater`, false, describeFailure(result))
  }

  const report = decodeDriverReport(JSON.parse(result.stdout.trim().split('\n').at(-1) ?? ''))

  const expected = {
    kind: 'updated',
    currentVersion: PUBLISHED_VERSION,
    version: testVersion,
    installMethod: method,
  }

  const [event, ...extra] = report.events

  const ok =
    extra.length === 0 &&
    event !== undefined &&
    event.kind === expected.kind &&
    event.currentVersion === expected.currentVersion &&
    event.version === expected.version &&
    event.installMethod === expected.installMethod

  return checks.record(
    `${PUBLISHED_VERSION} updater emits updated`,
    ok,
    `${JSON.stringify(report.events)} (expected ${JSON.stringify([expected])})`
  )
}

async function installedPlatformPackages(packageRoot: string): Promise<Record<string, string>> {
  const locations = {
    nested: join(packageRoot, 'node_modules'),
    hoisted: dirname(packageRoot),
  }

  const found: Record<string, string> = {}

  for (const [kind, directory] of Object.entries(locations)) {
    const entries = existsSync(directory) ? await readdir(directory) : []

    for (const entry of entries.filter(name => name.startsWith(`${PACKAGE_NAME}-`))) {
      found[entry] = `${kind} ${(await readVersion(join(directory, entry))) ?? 'no version'}`
    }
  }

  return found
}

async function checkUpgradedInstall(
  checks: Checks,
  layout: InstallLayout,
  env: ScenarioEnv,
  workspace: Workspace,
  built: Build,
  testVersion: string
): Promise<void> {
  const { packageRoot } = layout
  const version = await readVersion(packageRoot)
  checks.record(
    'package version',
    version === testVersion,
    `${packageRoot}: ${version ?? 'missing'}`
  )

  const leftovers = ['src', 'tsconfig.json'].filter(entry => existsSync(join(packageRoot, entry)))
  checks.record(
    'no source files',
    leftovers.length === 0,
    leftovers.length === 0 ? 'no src/ or tsconfig.json' : `still present: ${leftovers.join(', ')}`
  )

  const platforms = await installedPlatformPackages(packageRoot)
  const names = Object.keys(platforms).sort()
  const expected = [...built.hostCompatible].sort()
  const versionsMatch = Object.values(platforms).every(found => found.endsWith(` ${testVersion}`))
  checks.record(
    'platform packages',
    JSON.stringify(names) === JSON.stringify(expected) && versionsMatch,
    `${
      Object.entries(platforms)
        .map(([name, found]) => `${name} (${found})`)
        .join(', ') || 'none'
    }; expected ${expected.join(', ')}`
  )

  const hostName = BuildTarget.packageName(built.host)

  const hostBinary = Object.keys(platforms).includes(hostName)
    ? [join(packageRoot, 'node_modules'), dirname(packageRoot)]
        .map(directory => join(directory, hostName, 'bin', PACKAGE_NAME))
        .find(path => existsSync(path))
    : undefined

  const link = join(packageRoot, 'bin/.platform-binary')
  const linked = (await exists(link)) ? await readlink(link) : undefined

  const linkOk =
    linked !== undefined &&
    hostBinary !== undefined &&
    (await realpath(link).catch(() => link)) === (await realpath(hostBinary))

  checks.record(
    'postinstall link',
    layout.expectPostinstallLink ? linkOk : true,
    linked === undefined
      ? `no bin/.platform-binary${layout.expectPostinstallLink ? '' : ' (expected: lifecycle scripts are blocked)'}`
      : `bin/.platform-binary -> ${linked}`
  )

  const search = await run(
    [
      'sh',
      '-c',
      '. "$0"; mux_sesh_find_binary "$1"',
      join(packageRoot, 'bin/platform.sh'),
      packageRoot,
    ],
    { cwd: env.home, env: { PATH: workspace.terminalPath }, timeoutMs: COMMAND_TIMEOUT_MS }
  )

  const searched = search.stdout.trim()
  checks.record(
    'launcher search finds binary',
    search.exitCode === 0 &&
      hostBinary !== undefined &&
      (await realpath(searched).catch(() => searched)) === (await realpath(hostBinary)),
    search.exitCode === 0 ? searched : describeFailure(search)
  )

  const bytes = hostBinary ? await Bun.file(hostBinary).bytes() : undefined
  const stamped = bytes ? Buffer.from(bytes).includes(Buffer.from(testVersion)) : false
  checks.record(
    'binary is this build',
    bytes !== undefined && sha256(bytes) === built.binarySha256 && stamped,
    bytes === undefined
      ? `${hostName} binary not installed`
      : `sha256 ${sha256(bytes) === built.binarySha256 ? 'matches' : 'differs'}, ${stamped ? 'stamped' : 'not stamped'} ${testVersion}`
  )

  const sandbox: Sandbox = {
    root: env.home,
    home: env.home,
    env: {
      HOME: env.home,
      XDG_CONFIG_HOME: join(env.home, '.config'),
      XDG_CACHE_HOME: join(env.home, '.cache'),
      XDG_DATA_HOME: join(env.home, '.local/share'),
      XDG_STATE_HOME: join(env.home, '.local/state'),
      PATH: workspace.terminalPath,
      TERM: 'xterm-256color',
      LANG: 'C.UTF-8',
      MUX_SESH_DISABLE_AUTOUPDATE: '1',
    },
  }

  const terminal = await runInTerminal([layout.command], sandbox, env.home)
  const failures = terminalFailures(layout.command, terminal)
  checks.record(
    'command starts the binary',
    failures.length === 0,
    failures.length === 0
      ? `startup failure screen (no tmux/Herdr/Bun on PATH), exit ${terminal.exitCode}`
      : failures.join(' ')
  )
}

interface ScenarioContext {
  readonly workspace: Workspace
  readonly registry: Registry
  readonly built: Build
  readonly testVersion: string
}

function npmLayout(env: ScenarioEnv): InstallLayout {
  return {
    packageRoot: join(env.npmPrefix, 'lib/node_modules', PACKAGE_NAME),
    command: join(env.npmPrefix, 'bin', PACKAGE_NAME),
    expectPostinstallLink: true,
  }
}

function bunLayout(env: ScenarioEnv): InstallLayout {
  return {
    packageRoot: join(env.bunInstall, 'install/global/node_modules', PACKAGE_NAME),
    command: join(env.bunInstall, 'bin', PACKAGE_NAME),
    expectPostinstallLink: false,
  }
}

async function npmUpdater(context: ScenarioContext): Promise<readonly Check[]> {
  const checks = new Checks('npm: 1.10 updater')
  const env = await scenarioEnv(context.workspace, 'npm-updater', context.registry.url)
  const layout = npmLayout(env)

  if (
    (await install(
      checks,
      `install ${PUBLISHED_VERSION}`,
      ['npm', 'install', '-g', `${PACKAGE_NAME}@${PUBLISHED_VERSION}`],
      env
    )) &&
    (await checkPublishedInstall(checks, layout)) &&
    (await runPublishedUpdater(checks, layout, env, context.testVersion, 'npm'))
  ) {
    await checkUpgradedInstall(
      checks,
      layout,
      env,
      context.workspace,
      context.built,
      context.testVersion
    )
  }

  return checks.all
}

async function bunUpdater(context: ScenarioContext): Promise<readonly Check[]> {
  const checks = new Checks('bun: 1.10 updater')
  const env = await scenarioEnv(context.workspace, 'bun-updater', context.registry.url)
  const layout = bunLayout(env)

  if (
    (await install(
      checks,
      `install ${PUBLISHED_VERSION}`,
      ['bun', 'add', '-g', `${PACKAGE_NAME}@${PUBLISHED_VERSION}`],
      env
    )) &&
    (await checkPublishedInstall(checks, layout)) &&
    (await runPublishedUpdater(checks, layout, env, context.testVersion, 'bun'))
  ) {
    await checkUpgradedInstall(
      checks,
      layout,
      env,
      context.workspace,
      context.built,
      context.testVersion
    )
  }

  return checks.all
}

async function npmFresh(context: ScenarioContext): Promise<readonly Check[]> {
  const checks = new Checks('npm: fresh install')
  const env = await scenarioEnv(context.workspace, 'npm-fresh', context.registry.url)
  const layout = npmLayout(env)

  if (
    await install(
      checks,
      `install ${context.testVersion}`,
      ['npm', 'install', '-g', `${PACKAGE_NAME}@${context.testVersion}`],
      env
    )
  ) {
    await checkUpgradedInstall(
      checks,
      layout,
      env,
      context.workspace,
      context.built,
      context.testVersion
    )
  }

  return checks.all
}

async function npmOverPublished(context: ScenarioContext): Promise<readonly Check[]> {
  const checks = new Checks('npm: install over 1.10')
  const env = await scenarioEnv(context.workspace, 'npm-over', context.registry.url)
  const layout = npmLayout(env)

  if (
    (await install(
      checks,
      `install ${PUBLISHED_VERSION}`,
      ['npm', 'install', '-g', `${PACKAGE_NAME}@${PUBLISHED_VERSION}`],
      env
    )) &&
    (await checkPublishedInstall(checks, layout)) &&
    (await install(
      checks,
      'npm install -g mux-sesh (latest)',
      ['npm', 'install', '-g', PACKAGE_NAME],
      env
    ))
  ) {
    await checkUpgradedInstall(
      checks,
      layout,
      env,
      context.workspace,
      context.built,
      context.testVersion
    )
  }

  return checks.all
}

const SCENARIOS = [npmUpdater, bunUpdater, npmFresh, npmOverPublished] as const

function formatTable(checks: readonly Check[]): string {
  const rows = checks.map(check => [
    check.scenario,
    check.name,
    check.ok ? 'PASS' : 'FAIL',
    check.detail,
  ])

  const header = ['Scenario', 'Check', 'Result', 'Detail']

  const widths = [0, 1, 2].map(column =>
    Math.max(header[column]?.length ?? 0, ...rows.map(row => row[column]?.length ?? 0))
  )

  const line = (row: readonly string[]) =>
    row
      .map((cell, column) =>
        column < 3 ? cell.padEnd(widths[column] ?? 0) : cell.replaceAll('\n', ' | ')
      )
      .join('  ')

  return [
    line(header),
    line(widths.map(width => '-'.repeat(width)).concat('------')),
    ...rows.map(line),
  ].join('\n')
}

async function main(args: readonly string[]): Promise<number> {
  let values: { version: string; keep: boolean }

  try {
    values = parseArgs({
      args: [...args],
      options: {
        version: { type: 'string', default: DEFAULT_TEST_VERSION },
        keep: { type: 'boolean', default: false },
      },
      strict: true,
    }).values
  } catch (cause) {
    console.error(`${cause instanceof Error ? cause.message : String(cause)}\n\n${USAGE}`)

    return 2
  }

  if (!isSemVer(values.version)) {
    console.error(
      `--version ${JSON.stringify(values.version)} is not a SemVer version.\n\n${USAGE}`
    )

    return 2
  }

  const testVersion = values.version
  const workspace = await createWorkspace()
  let registry: Registry | undefined

  const removeWorkspace = () => {
    if (values.keep) console.error(`Kept ${workspace.root}`)
    else rmSync(workspace.root, { recursive: true, force: true })
  }

  // Children share the terminal's process group, so they receive the same signal.
  const interrupted = () => {
    registry?.stop().catch(() => undefined)
    removeWorkspace()
    process.exit(130)
  }

  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)

  try {
    console.error(`Building ${testVersion} for this machine in ${workspace.root} …`)
    const built = await build(workspace, testVersion)
    registry = startRegistry(built.packages)
    console.error(
      `Serving ${built.packages.length} packages at ${registry.url}; everything else is proxied to ${UPSTREAM_REGISTRY}.`
    )

    const context = { workspace, registry, built, testVersion }
    const checks: Check[] = []

    for (const scenario of SCENARIOS) {
      console.error(`Running ${scenario.name} …`)
      checks.push(...(await scenario(context)))
    }

    console.log(formatTable(checks))
    console.log(
      `\nLocal registry clients: ${[...registry.clients].join(', ') || 'none'}; ${registry.proxied()} requests proxied.`
    )

    const failed = checks.filter(check => !check.ok).length
    console.log(
      failed === 0
        ? `\nPASS: all ${checks.length} checks.`
        : `\nFAIL: ${failed} of ${checks.length} checks.`
    )

    return failed === 0 ? 0 : 1
  } catch (cause) {
    console.error(
      `Upgrade check stopped: ${cause instanceof Error ? cause.message : String(cause)}`
    )

    return 1
  } finally {
    process.off('SIGINT', interrupted)
    process.off('SIGTERM', interrupted)
    await registry?.stop()
    removeWorkspace()
  }
}

if (import.meta.main) process.exitCode = await main(Bun.argv.slice(2))
