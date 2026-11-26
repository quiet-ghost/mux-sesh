import type { CliRenderer } from '@opentui/core'
import { flushSync } from '@opentui/react'
import type { TerminalHandoff } from '../multiplexer/types'
import { DiagnosticReport } from './errors'
import { runTeardownSteps, type TeardownStep } from './teardown'

const TERMINAL_RESET_SEQUENCE = [
  '\u001b[?1000l',
  '\u001b[?1002l',
  '\u001b[?1003l',
  '\u001b[?1005l',
  '\u001b[?1006l',
  '\u001b[?1015l',
  '\u001b[?1049l',
  '\u001b[?2004l',
  '\u001b[<u',
  '\u001b[?25h',
].join('')

interface ShutdownState {
  renderer?: CliRenderer
  exiting?: Promise<never>
  exitListenerInstalled?: boolean
  fatalListenersInstalled?: boolean
  fatalStarted?: boolean
}

const state: ShutdownState = {}

function liveRenderer(): CliRenderer | undefined {
  const renderer = state.renderer

  return renderer && !renderer.isDestroyed ? renderer : undefined
}

// Each step is isolated, so one failing step cannot skip the terminal resets after it.
const RENDERER_STEPS: readonly TeardownStep[] = [
  {
    name: 'mouse reporting',
    run: () => {
      const renderer = liveRenderer()

      if (renderer) renderer.useMouse = false
    },
  },
  { name: 'keyboard protocol', run: () => liveRenderer()?.disableKittyKeyboard() },
  { name: 'terminal title', run: () => liveRenderer()?.setTerminalTitle('') },
  {
    name: 'renderer',
    run: () => {
      const renderer = liveRenderer()

      if (renderer) flushSync(() => renderer.destroy())
    },
  },
]

const TERMINAL_STEPS: readonly TeardownStep[] = [
  {
    name: 'terminal modes',
    run: () => {
      if (process.stdout.isTTY) process.stdout.write(TERMINAL_RESET_SEQUENCE)
    },
  },
  {
    name: 'raw input mode',
    run: () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
    },
  },
  { name: 'input stream', run: () => process.stdin.pause() },
]

function resetTerminalModes(): void {
  runTeardownSteps(TERMINAL_STEPS)
}

function restoreTerminal(): readonly string[] {
  return [...runTeardownSteps(RENDERER_STEPS), ...runTeardownSteps(TERMINAL_STEPS)]
}

// Last-resort output: if stderr itself is gone there is nowhere left to report, so exit proceeds.
function writeStderr(text: string): void {
  try {
    process.stderr.write(text)
  } catch {
    return
  }
}

function reportRestoreFailures(failed: readonly string[]): void {
  if (failed.length === 0) return

  writeStderr(
    `\nmux-sesh could not fully restore the terminal (${failed.join(', ')} failed). ` +
      'If the terminal misbehaves, run `reset`.\n'
  )
}

export function initializeFatalErrorHandling(): void {
  if (state.fatalListenersInstalled) return

  process.on('uncaughtException', error => {
    requestFatalShutdown(error, 'uncaught exception')
  })
  process.on('unhandledRejection', reason => {
    requestFatalShutdown(reason, 'unhandled rejection')
  })
  state.fatalListenersInstalled = true
}

export function initializeShutdown(renderer: CliRenderer): void {
  state.renderer = renderer

  if (!state.exitListenerInstalled) {
    process.once('exit', resetTerminalModes)
    state.exitListenerInstalled = true
  }
}

type FatalSource = 'fatal error' | 'uncaught exception' | 'unhandled rejection'

export function requestFatalShutdown(cause: unknown, source: FatalSource = 'fatal error'): void {
  if (state.fatalStarted) return
  state.fatalStarted = true

  try {
    // The terminal is restored before any report formatting, which may fail on its own.
    reportRestoreFailures(restoreTerminal())
    writeStderr(fatalReport(cause, source))
  } finally {
    process.exit(1)
  }
}

function fatalReport(cause: unknown, source: FatalSource): string {
  try {
    const report = DiagnosticReport.capture(cause)

    return `\nFatal ${source}:\n\n${report.text}\n\nReport this crash (opening this URL shares diagnostics):\n${report.issueUrl}\n`
  } catch {
    return `\nFatal ${source}: mux-sesh stopped, and its diagnostics could not be formatted, so all details were omitted. Report the steps that led here on the mux-sesh issue tracker.\n`
  }
}

// The terminal belongs to the handoff only after the UI is unmounted and terminal modes reset.
async function runHandoff(handoff: TerminalHandoff, code: number): Promise<number> {
  const manual = `The session is still running; to retry, run: ${handoff.command.join(' ')}`

  try {
    const proc = Bun.spawn([...handoff.command], {
      cwd: handoff.cwd,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })

    const exitCode = await proc.exited

    if (exitCode === 0) return code

    process.stderr.write(
      `\nmux-sesh could not ${handoff.description} (exit status ${exitCode}). ${manual}\n`
    )

    return exitCode
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'it could not be started'
    process.stderr.write(`\nmux-sesh could not ${handoff.description}: ${reason}. ${manual}\n`)

    return 1
  }
}

export function requestShutdown(code = 0, handoff?: TerminalHandoff): Promise<never> {
  if (state.exiting) return state.exiting

  state.exiting = (async () => {
    let exitCode = code

    try {
      reportRestoreFailures(restoreTerminal())

      if (handoff) exitCode = await runHandoff(handoff, code)
    } finally {
      process.exit(exitCode)
    }
  })()

  return state.exiting
}
