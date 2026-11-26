import type { CliRenderer } from '@opentui/core'
import { flushSync } from '@opentui/react'
import type { TerminalHandoff } from '../multiplexer/types'
import { DiagnosticReport } from './errors'

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

function resetTerminalModes(): void {
  if (process.stdout.isTTY) {
    process.stdout.write(TERMINAL_RESET_SEQUENCE)
  }

  if (process.stdin.isTTY) process.stdin.setRawMode(false)

  process.stdin.pause()
}

function destroyRenderer(): void {
  const renderer = state.renderer

  if (!renderer || renderer.isDestroyed) return

  try {
    renderer.useMouse = false
    renderer.disableKittyKeyboard()
    renderer.setTerminalTitle('')
    flushSync(() => renderer.destroy())
  } catch {
    // Terminal mode reset below is the final fallback if renderer teardown fails.
  }
}

function restoreTerminal(): void {
  destroyRenderer()
  resetTerminalModes()
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

  const report = DiagnosticReport.capture(cause)

  restoreTerminal()

  try {
    process.stderr.write(
      `\nFatal ${source}:\n\n${report.text}\n\nReport this crash (opening this URL shares diagnostics):\n${report.issueUrl}\n`
    )
  } finally {
    process.exit(1)
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
      restoreTerminal()

      if (handoff) exitCode = await runHandoff(handoff, code)
    } finally {
      process.exit(exitCode)
    }
  })()

  return state.exiting
}
