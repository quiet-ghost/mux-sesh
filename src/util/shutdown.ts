import type { CliRenderer } from '@opentui/core'

const TERMINAL_RESET_SEQUENCE = [
  '\u001b[?1000l',
  '\u001b[?1002l',
  '\u001b[?1003l',
  '\u001b[?1005l',
  '\u001b[?1006l',
  '\u001b[?1015l',
  '\u001b[?1049l',
  '\u001b[?2004l',
  '\u001b[?25h',
].join('')

const state: {
  renderer?: CliRenderer
  exiting?: Promise<void>
  listenersInstalled?: boolean
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
  if (!renderer || renderer.isDestroyed) {
    return
  }

  try {
    renderer.useMouse = false
    renderer.disableKittyKeyboard()
    renderer.setTerminalTitle('')
    renderer.destroy()
  } catch (error) {
    console.error('Failed during renderer shutdown:', error)
  }
}

export function initializeShutdown(renderer: CliRenderer): void {
  state.renderer = renderer

  if (state.listenersInstalled) {
    return
  }

  process.once('exit', () => {
    resetTerminalModes()
  })

  state.listenersInstalled = true
}

export function requestShutdown(code = 0): Promise<void> {
  if (state.exiting) {
    return state.exiting
  }

  state.exiting = (async () => {
    process.exitCode = code
    destroyRenderer()
    resetTerminalModes()
  })()

  return state.exiting
}
