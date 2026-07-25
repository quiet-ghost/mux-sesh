import type { CliRenderer } from '@opentui/core'
import { buildIssueUrl, formatDiagnostics } from './errors'

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

const state: {
  renderer?: CliRenderer
  exiting?: Promise<never>
  exitListenerInstalled?: boolean
  fatalListenersInstalled?: boolean
  fatalStarted?: boolean
} = {}

function resetTerminalModes(): void {
  if (process.stdout.isTTY) {
    process.stdout.write(TERMINAL_RESET_SEQUENCE)
  }

  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(false)
  }

  process.stdin.pause()
}

function destroyRenderer(): void {
  const renderer = state.renderer
  if (!renderer || renderer.isDestroyed) return

  try {
    renderer.useMouse = false
    renderer.disableKittyKeyboard()
    renderer.setTerminalTitle('')
    renderer.destroy()
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

export function requestFatalShutdown(error: unknown, source = 'fatal error'): void {
  if (state.fatalStarted) return
  state.fatalStarted = true

  let diagnostics: string
  let reportUrl: string
  try {
    diagnostics = formatDiagnostics(error)
    reportUrl = buildIssueUrl(error, diagnostics).toString()
  } catch {
    diagnostics = `mux-sesh crashed\n\nMessage:\n${String(error)}`
    reportUrl = 'https://github.com/quiet-ghost/mux-sesh/issues/new'
  }

  restoreTerminal()

  try {
    process.stderr.write(
      `\nFatal ${source}:\n\n${diagnostics}\n\nReport this crash (review before submitting):\n${reportUrl}\n`
    )
  } finally {
    process.exit(1)
  }
}

export function requestShutdown(code = 0): Promise<never> {
  if (state.exiting) return state.exiting

  state.exiting = (async () => {
    restoreTerminal()
    process.exit(code)
  })()

  return state.exiting
}
