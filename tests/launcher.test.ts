import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, copyFile, mkdir, mkdtemp, readlink, realpath, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { detectHost } from '../tools/build/host'
import { BuildTarget, Host } from '../tools/build/targets'

const repoRoot = join(import.meta.dir, '..')
const platformScript = join(repoRoot, 'bin/platform.sh')
const LAUNCHER_FILES = ['mux-sesh', 'platform.sh', 'postinstall'] as const

interface ShellResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

interface LaunchReport {
  readonly label: string
  readonly pid: number
  readonly cwd: string
  readonly handoff: string
  readonly args: readonly string[]
}

const names = (targets: readonly BuildTarget[]) =>
  targets.map(target => BuildTarget.packageName(target))

function runPlatformFunction(call: string, args: readonly string[]): ShellResult {
  const result = Bun.spawnSync(['sh', '-c', `. "$0"; ${call}`, platformScript, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

function hostMatrix(): Host[] {
  return (['x64', 'arm64'] as const).flatMap(arch =>
    [true, false].flatMap((avx2): Host[] => [
      { os: 'darwin', arch, avx2 },
      { os: 'linux', arch, libc: 'glibc', avx2 },
      { os: 'linux', arch, libc: 'musl', avx2 },
    ])
  )
}

describe('platform selection', () => {
  test.each(hostMatrix().map(host => [JSON.stringify(host), host] as const))(
    'bin/platform.sh orders candidates like Host.candidates for %s',
    (_label, host) => {
      const libc = host.os === 'linux' ? host.libc : 'none'

      const result = runPlatformFunction('mux_sesh_platform_candidates "$@"', [
        host.os,
        host.arch,
        libc,
        host.avx2 ? 'yes' : 'no',
      ])

      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim().split('\n')).toEqual(names(Host.candidates(host)))
    }
  )

  test('bin/platform.sh detects this machine like the build tooling', () => {
    const host = detectHost()

    const result = runPlatformFunction(
      'mux_sesh_detect_host; printf "%s %s %s %s" "$mux_sesh_os" "$mux_sesh_arch" "$mux_sesh_libc" "$mux_sesh_avx2"',
      []
    )

    if (!host) {
      expect(result.stdout).toContain('unsupported')

      return
    }

    expect(result.stdout).toBe(
      `${host.os} ${host.arch} ${host.os === 'linux' ? host.libc : 'none'} ${host.avx2 ? 'yes' : 'no'}`
    )
  })
})

const host = detectHost()
const candidates = host ? names(Host.candidates(host)) : []

let root: string | undefined

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'mux-sesh-launcher-')))
})

afterEach(async () => {
  const current = root
  root = undefined

  if (current) await rm(current, { recursive: true, force: true })
})

function fixtureRoot(): string {
  if (!root) throw new Error('The launcher fixture directory was not created')

  return root
}

async function installLauncher(packageRoot: string): Promise<void> {
  await mkdir(join(packageRoot, 'bin'), { recursive: true })

  for (const file of LAUNCHER_FILES) {
    await copyFile(join(repoRoot, 'bin', file), join(packageRoot, 'bin', file))
    await chmod(join(packageRoot, 'bin', file), 0o755)
  }
}

// Stands in for a binary: reports how it was started, then exits with FAKE_EXIT_CODE.
async function writeFakeProgram(path: string, label: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })

  await Bun.write(
    path,
    [
      '#!/bin/sh',
      `printf '%s\\n' '${label}' "$$" "$(pwd -P)" "\${MUX_SESH_INVOCATION_CWD-unset}"`,
      `for argument in "$@"; do printf 'arg:%s\\n' "$argument"; done`,
      'exit "${FAKE_EXIT_CODE:-0}"',
      '',
    ].join('\n')
  )
  await chmod(path, 0o755)
}

async function writePlatformBinary(modules: string, name: string): Promise<string> {
  const binary = join(modules, name, 'bin/mux-sesh')
  await writeFakeProgram(binary, name)

  return binary
}

interface Launch {
  readonly exitCode: number
  readonly pid: number
  readonly stdout: string
  readonly stderr: string
}

async function launch(
  command: string,
  cwd: string,
  args: readonly string[] = [],
  env: Readonly<Record<string, string>> = {}
): Promise<Launch> {
  const inherited = { ...process.env }
  delete inherited.MUX_SESH_DEV
  delete inherited.MUX_SESH_INVOCATION_CWD

  const proc = Bun.spawn([command, ...args], {
    cwd,
    env: { ...inherited, ...env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
    killSignal: 'SIGKILL',
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  return { exitCode, pid: proc.pid, stdout, stderr }
}

function parseReport(stdout: string): LaunchReport {
  const [label = '', pid = '', cwd = '', handoff = '', ...rest] = stdout.trimEnd().split('\n')

  return {
    label,
    pid: Number(pid),
    cwd,
    handoff,
    args: rest.map(line => line.replace(/^arg:/, '')),
  }
}

interface Install {
  readonly packageRoot: string
  readonly modules: string
  readonly command: string
  readonly caller: string
}

// npm nests optional dependencies under the package; bun hoists them beside it.
async function createInstall(layout: 'npm' | 'bun'): Promise<Install> {
  const base = fixtureRoot()

  const globalModules =
    layout === 'npm'
      ? join(base, 'lib/node_modules')
      : join(base, '.bun/install/global/node_modules')

  const packageRoot = join(globalModules, 'mux-sesh')
  const caller = join(base, "caller's project")
  const command = join(base, 'global-bin/mux-sesh')
  await installLauncher(packageRoot)
  await mkdir(caller, { recursive: true })
  await mkdir(dirname(command), { recursive: true })
  await symlink(join(packageRoot, 'bin/mux-sesh'), command)

  return {
    packageRoot,
    modules: layout === 'npm' ? join(packageRoot, 'node_modules') : globalModules,
    command,
    caller,
  }
}

const [best = 'unsupported', fallback] = candidates

describe.skipIf(!host)('launcher', () => {
  test.each(['npm', 'bun'] as const)(
    'execs the best platform binary from a %s global install',
    async layout => {
      const install = await createInstall(layout)
      await writePlatformBinary(install.modules, best)

      if (fallback) await writePlatformBinary(install.modules, fallback)

      const args = ['argument with spaces', '--literal-argument', '']
      const result = await launch(install.command, install.caller, args)

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)

      expect(parseReport(result.stdout)).toEqual({
        label: best,
        pid: result.pid,
        cwd: install.caller,
        handoff: install.caller,
        args,
      })
    }
  )

  test('falls back to the next installed candidate', async () => {
    if (!fallback) return

    const install = await createInstall('npm')
    await writePlatformBinary(install.modules, fallback)

    const result = await launch(install.command, install.caller)

    expect(parseReport(result.stdout).label).toBe(fallback)
  })

  test('forwards the binary exit status', async () => {
    const install = await createInstall('bun')
    await writePlatformBinary(install.modules, best)

    const result = await launch(install.command, install.caller, [], { FAKE_EXIT_CODE: '7' })

    expect(result.exitCode).toBe(7)
  })

  test('postinstall links the resolved binary, and the launcher runs the link', async () => {
    const install = await createInstall('npm')
    const binary = await writePlatformBinary(install.modules, best)

    const postinstall = await launch('sh', install.packageRoot, ['./bin/postinstall'])

    expect(postinstall).toMatchObject({ exitCode: 0, stderr: '' })
    expect(await readlink(join(install.packageRoot, 'bin/.platform-binary'))).toBe(binary)

    await writeFakeProgram(join(install.packageRoot, 'linked'), 'linked')
    await rm(join(install.packageRoot, 'bin/.platform-binary'))
    await symlink(
      join(install.packageRoot, 'linked'),
      join(install.packageRoot, 'bin/.platform-binary')
    )

    expect(parseReport((await launch(install.command, install.caller)).stdout).label).toBe('linked')
  })

  test('a dangling postinstall link falls back to searching', async () => {
    const install = await createInstall('npm')
    await writePlatformBinary(install.modules, best)
    await symlink(
      join(install.packageRoot, 'missing'),
      join(install.packageRoot, 'bin/.platform-binary')
    )

    expect(parseReport((await launch(install.command, install.caller)).stdout).label).toBe(best)
  })

  test('postinstall warns without failing when no platform binary was installed', async () => {
    const install = await createInstall('npm')

    const result = await launch('sh', install.packageRoot, ['./bin/postinstall'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain('mux-sesh postinstall warning')
    expect(result.stderr).toContain(best)
  })

  test('explains a missing binary and exits 1', async () => {
    const install = await createInstall('bun')

    const result = await launch(install.command, install.caller)

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain(
      `could not find its prebuilt binary for ${host?.os}-${host?.arch}`
    )
    expect(result.stderr).toContain(`optional dependency ${best}`)
    expect(result.stderr).toContain('npm install -g mux-sesh')
  })

  describe('dev checkout', () => {
    async function createCheckout(): Promise<Install & { readonly fakeBin: string }> {
      const install = await createInstall('npm')
      const fakeBin = join(fixtureRoot(), 'fake-bin')
      await Bun.write(join(install.packageRoot, 'src/index.tsx'), '')
      await writeFakeProgram(join(fakeBin, 'bun'), 'bun')

      return { ...install, fakeBin }
    }

    test('runs source with bun when no binary is installed', async () => {
      const checkout = await createCheckout()

      const result = await launch(checkout.command, checkout.caller, ['--flag'], {
        PATH: `${checkout.fakeBin}:${process.env.PATH ?? ''}`,
      })

      expect(parseReport(result.stdout)).toEqual({
        label: 'bun',
        pid: result.pid,
        cwd: checkout.packageRoot,
        handoff: checkout.caller,
        args: [join(checkout.packageRoot, 'src/index.tsx'), '--flag'],
      })
    })

    test('MUX_SESH_DEV=1 prefers source over an installed binary', async () => {
      const checkout = await createCheckout()
      await writePlatformBinary(checkout.modules, best)

      const result = await launch(checkout.command, checkout.caller, [], {
        PATH: `${checkout.fakeBin}:${process.env.PATH ?? ''}`,
        MUX_SESH_DEV: '1',
      })

      expect(parseReport(result.stdout).label).toBe('bun')
    })
  })
})
