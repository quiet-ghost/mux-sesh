import { writeSync } from 'fs'
import { initializeShutdown } from '../../src/util/shutdown'
import { renderSessionScreen } from './session-screen'

const key = process.argv[2]
if (key !== 'q' && key !== 'RETURN') {
  throw new Error('Session-screen exit fixture requires q or RETURN')
}

const screen = await renderSessionScreen({ width: 80, height: 24 })
initializeShutdown(screen.renderer)
let selectedBeta = false

process.once('exit', exitCode => {
  writeSync(
    1,
    JSON.stringify({
      exitCode,
      selectedBeta,
      rendererDestroyed: screen.renderer.isDestroyed,
      inputListeners: screen.renderer.stdin.listenerCount('data'),
      lifecycle: screen.lifecycle,
      opened: screen.calls.flatMap(call => (call.operation === 'open' ? [call.id] : [])),
    })
  )
})

try {
  await screen.pressKey('ARROW_DOWN')
  selectedBeta = /› .*beta/.test(await screen.frame())
  await screen.pressKey(key)
  throw new Error('Session-screen keyboard action did not exit the fixture process')
} finally {
  screen.destroy()
}
