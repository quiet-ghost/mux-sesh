import { existsSync } from 'fs'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseArgs } from 'util'
import * as Schema from 'effect/Schema'
import { parseBuildArgs, readPackageVersion, singleTarget } from './build'
import { APP_ENTRYPOINT, REPO_ROOT, binaryPath, compileBinary } from './compile'
import { BuildTarget } from './targets'

const PROBE_ENTRYPOINT = join(import.meta.dir, 'smoke/probe.tsx')
const FAILURE_SCREEN = 'mux-sesh could not start'
const ENTER_ALTERNATE_SCREEN = '\x1b[?1049h'
const LEAVE_ALTERNATE_SCREEN = '\x1b[?1049l'
const FRAME_START = '\x1b[?2026h'
const RUN_TIMEOUT_MS = 20_000

// Quitting the startup failure screen reports the failure to the caller.
const STARTUP_FAILURE_EXIT_CODE = 1

const decodeProbeReport = Schema.decodeUnknownSync(
  Schema.Struct({
    importMs: Schema.Number,
    version: Schema.String,
    compiled: Schema.Boolean,
    runtimePathIsExecutable: Schema.Boolean,
    appLoaded: Schema.Boolean,
    rendered: Schema.Boolean,
    fileSearch: Schema.String,
  })
)

type ProbeReport = ReturnType<typeof decodeProbeReport>

export interface Sandbox {
  readonly root: string
  readonly home: string
  readonly env: Readonly<Record<string, string>>
}

export interface TerminalRun {
  readonly exitCode: number
  readonly firstFrameMs: number | undefined
  readonly failureScreenMs: number | undefined
  readonly restored: boolean
}

export interface StartupTimings {
  readonly importMs: number
  readonly firstFrameMs: number | undefined
  readonly failureScreenMs: number | undefined
}

export interface SmokeResult {
  readonly target: string
  readonly failures: readonly string[]
  readonly binary: StartupTimings | undefined
  readonly source: StartupTimings | undefined
}

export interface SmokeOptions {
  readonly target: BuildTarget
  readonly runs: number
  readonly compareSource: boolean
}

// No tmux, Herdr, or user config is reachable, so the app can only show its startup failure screen.
async function createSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), 'mux-sesh-smoke-'))
  const home = join(root, 'home')
  const emptyPath = join(root, 'empty-path')
  await Promise.all([mkdir(home), mkdir(emptyPath)])

  return {
    root,
    home,
    env: {
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_CACHE_HOME: join(home, '.cache'),
      XDG_DATA_HOME: join(home, '.local/share'),
      XDG_STATE_HOME: join(home, '.local/state'),
      PATH: emptyPath,
      TERM: 'xterm-256color',
      LANG: 'C.UTF-8',
      MUX_SESH_DISABLE_AUTOUPDATE: '1',
    },
  }
}

function median(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((left, right) => left - right)

  return sorted[Math.floor((sorted.length - 1) / 2)]
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function requireTool(name: string): string {
  const path = Bun.which(name)

  if (!path)
    throw new Error(
      `The smoke test needs \`${name}\` on PATH to run mux-sesh in a pseudo-terminal.`
    )

  return path
}

function terminalCommand(command: readonly string[], sandbox: Sandbox): string[] {
  const isolated = [
    requireTool('env'),
    '-i',
    ...Object.entries(sandbox.env).map(([key, value]) => `${key}=${value}`),
    ...command,
  ]

  const script = requireTool('script')

  if (process.platform === 'darwin') return [script, '-q', '/dev/null', ...isolated]

  return [script, '-q', '-e', '-c', isolated.map(shellQuote).join(' '), '/dev/null']
}

async function runProbe(
  command: readonly string[],
  sandbox: Sandbox,
  cwd: string
): Promise<ProbeReport> {
  const proc = Bun.spawn([...command], {
    cwd,
    env: { ...sandbox.env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: RUN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  if (exitCode !== 0) {
    throw new Error(`The probe ${command.join(' ')} exited with ${exitCode}.\n${stderr}`)
  }

  return decodeProbeReport(JSON.parse(stdout.trim().split('\n').at(-1) ?? ''))
}

// Starts mux-sesh in a pseudo-terminal, waits for the failure screen, and quits with `q`.
export async function runInTerminal(
  command: readonly string[],
  sandbox: Sandbox,
  cwd: string
): Promise<TerminalRun> {
  const started = performance.now()

  const proc = Bun.spawn(terminalCommand(command, sandbox), {
    cwd,
    env: { PATH: process.env.PATH ?? '', SHELL: '/bin/sh', TERM: 'xterm-256color' },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: RUN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })

  const decoder = new TextDecoder()
  let output = ''
  let firstFrameMs: number | undefined
  let failureScreenMs: number | undefined

  const reader = proc.stdout.getReader()

  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    output += decoder.decode(read.value, { stream: true })
    const elapsed = performance.now() - started
    const alternateScreen = output.indexOf(ENTER_ALTERNATE_SCREEN)

    if (
      firstFrameMs === undefined &&
      alternateScreen !== -1 &&
      output.includes(FRAME_START, alternateScreen)
    ) {
      firstFrameMs = elapsed
    }

    if (failureScreenMs === undefined && output.includes(FAILURE_SCREEN)) {
      failureScreenMs = elapsed
      await proc.stdin.write('q')
      await proc.stdin.flush()
    }
  }

  const exitCode = await proc.exited
  await proc.stdin.end()

  return {
    exitCode,
    firstFrameMs,
    failureScreenMs,
    restored:
      output.lastIndexOf(LEAVE_ALTERNATE_SCREEN) > output.lastIndexOf(ENTER_ALTERNATE_SCREEN),
  }
}

export function terminalFailures(label: string, run: TerminalRun): string[] {
  const failures: string[] = []

  if (run.failureScreenMs === undefined) failures.push(`${label} never showed "${FAILURE_SCREEN}".`)

  if (run.exitCode !== STARTUP_FAILURE_EXIT_CODE) {
    failures.push(
      `${label} exited with ${run.exitCode} after \`q\`; expected ${STARTUP_FAILURE_EXIT_CODE}.`
    )
  }

  if (!run.restored) failures.push(`${label} did not leave the alternate screen on exit.`)

  return failures
}

function probeFailures(
  label: string,
  report: ProbeReport,
  expected: { compiled: boolean; version: string }
): string[] {
  const failures: string[] = []

  if (report.compiled !== expected.compiled)
    failures.push(`${label} reported compiled=${report.compiled}.`)

  if (report.version !== expected.version)
    failures.push(`${label} reported version ${report.version}, expected ${expected.version}.`)

  if (expected.compiled && !report.runtimePathIsExecutable) {
    failures.push(`${label} did not resolve its install location from process.execPath.`)
  }

  if (!report.appLoaded) failures.push(`${label} did not load the app module graph.`)

  if (!report.rendered)
    failures.push(`${label} could not render a frame with the OpenTUI native library.`)

  if (report.fileSearch !== 'matched') failures.push(`${label} file search: ${report.fileSearch}.`)

  return failures
}

async function measure(
  label: string,
  runs: number,
  probe: () => Promise<ProbeReport>,
  terminal: () => Promise<TerminalRun>,
  expected: { compiled: boolean; version: string }
): Promise<{ timings: StartupTimings; failures: string[] }> {
  const reports: ProbeReport[] = []
  const terminalRuns: TerminalRun[] = []

  for (let run = 0; run < runs; run++) {
    reports.push(await probe())
    terminalRuns.push(await terminal())
  }

  const failures = [
    ...reports.flatMap(report => probeFailures(`${label} probe`, report, expected)),
    ...terminalRuns.flatMap(run => terminalFailures(label, run)),
  ]

  const defined = (values: readonly (number | undefined)[]) =>
    values.flatMap(value => (value === undefined ? [] : [value]))

  return {
    failures: [...new Set(failures)],
    timings: {
      importMs: median(reports.map(report => report.importMs)) ?? Number.NaN,
      firstFrameMs: median(defined(terminalRuns.map(run => run.firstFrameMs))),
      failureScreenMs: median(defined(terminalRuns.map(run => run.failureScreenMs))),
    },
  }
}

export async function runSmoke(options: SmokeOptions): Promise<SmokeResult> {
  const { target } = options
  const name = BuildTarget.packageName(target)
  const appBinary = binaryPath(target)

  if (!existsSync(appBinary)) {
    return {
      target: name,
      failures: [
        `${appBinary} does not exist. Build it first (\`bun run build\`, or \`bun tools/build/build.ts --target ${name}\`), then rerun the smoke test.`,
      ],
      binary: undefined,
      source: undefined,
    }
  }

  const version = await readPackageVersion()
  const sandbox = await createSandbox()

  try {
    const probeBinary = join(sandbox.root, 'probe/bin/mux-sesh-probe')

    const compiled = await compileBinary({
      entrypoint: PROBE_ENTRYPOINT,
      target,
      version,
      outfile: probeBinary,
    })

    if (!compiled.ok)
      return { target: name, failures: [compiled.message], binary: undefined, source: undefined }

    const binary = await measure(
      'compiled binary',
      options.runs,
      () => runProbe([probeBinary], sandbox, sandbox.home),
      () => runInTerminal([appBinary], sandbox, sandbox.home),
      { compiled: true, version }
    )

    const source = options.compareSource
      ? await measure(
          'source',
          options.runs,
          () => runProbe([process.execPath, PROBE_ENTRYPOINT], sandbox, REPO_ROOT),
          () => runInTerminal([process.execPath, APP_ENTRYPOINT], sandbox, REPO_ROOT),
          { compiled: false, version }
        )
      : undefined

    return {
      target: name,
      failures: [...binary.failures, ...(source?.failures ?? [])],
      binary: binary.timings,
      source: source?.timings,
    }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)

    return {
      target: name,
      failures: [`${name} could not be run on this machine: ${reason}`],
      binary: undefined,
      source: undefined,
    }
  } finally {
    await rm(sandbox.root, { recursive: true, force: true })
  }
}

function formatTimings(label: string, timings: StartupTimings): string {
  const ms = (value: number | undefined) => (value === undefined ? 'n/a' : `${value.toFixed(1)} ms`)

  return `${label}: import ${ms(timings.importMs)}, first frame ${ms(timings.firstFrameMs)}, failure screen ${ms(timings.failureScreenMs)}`
}

async function main(args: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      runs: { type: 'string', default: '3' },
      source: { type: 'boolean', default: false },
      target: { type: 'string' },
    },
    strict: true,
  })

  const runs = Number.parseInt(values.runs, 10)

  if (!Number.isInteger(runs) || runs < 1) {
    console.error(`--runs must be a positive integer, got ${JSON.stringify(values.runs)}.`)

    return 2
  }

  const selection =
    values.target === undefined ? singleTarget() : parseBuildArgs(['--target', values.target])

  const [target] = selection.ok ? selection.targets : []

  if (!target) {
    console.error(selection.ok ? 'No build target was selected.' : selection.message)

    return 1
  }

  const result = await runSmoke({ target, runs, compareSource: values.source })

  if (result.binary)
    console.log(formatTimings(`${result.target} binary (median of ${runs})`, result.binary))

  if (result.source) console.log(formatTimings(`source (median of ${runs})`, result.source))

  for (const failure of result.failures) console.error(`FAIL ${failure}`)

  return result.failures.length === 0 ? 0 : 1
}

if (import.meta.main) process.exitCode = await main(Bun.argv.slice(2))
