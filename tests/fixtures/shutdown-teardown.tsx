import { writeSync } from 'fs'
import { testRender } from '@opentui/react/test-utils'
import { act, useEffect } from 'react'
import { initializeShutdown, requestFatalShutdown, requestShutdown } from '../../src/util/shutdown'

// Usage: shutdown-teardown.tsx <renderer-step|terminal-write|fatal-terminal-write>. Injects one
// teardown fault, then reports what was still restored on exit.
const mode = process.argv[2]
const lifecycle: string[] = []
const restored = { stdinPaused: false }

function TeardownProbe() {
  useEffect(() => {
    lifecycle.push('mounted')

    return () => {
      lifecycle.push('unmounted')
    }
  }, [])

  return <text>Teardown probe</text>
}

const setup = await testRender(<TeardownProbe />, { width: 20, height: 4, consoleMode: 'disabled' })

initializeShutdown(setup.renderer)

process.once('exit', code => {
  writeSync(
    1,
    JSON.stringify({ code, destroyed: setup.renderer.isDestroyed, lifecycle, ...restored })
  )
})

function failTerminalWrites(): void {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
  process.stdout.write = () => {
    throw new Error('fixture terminal write failure token=fixture-teardown-secret')
  }

  const pause = process.stdin.pause.bind(process.stdin)
  process.stdin.pause = () => {
    restored.stdinPaused = true

    return pause()
  }
}

await act(async () => {
  switch (mode) {
    case 'renderer-step':
      setup.renderer.disableKittyKeyboard = () => {
        throw new Error('fixture kitty failure token=fixture-teardown-secret')
      }

      await requestShutdown(0)
      break
    case 'terminal-write':
      failTerminalWrites()
      await requestShutdown(6)
      break
    case 'fatal-terminal-write':
      failTerminalWrites()
      requestFatalShutdown(new Error('fixture fatal failure token=fixture-teardown-secret'))
      break
    default:
      throw new Error(`Unknown shutdown-teardown fixture mode: ${mode}`)
  }
})
