import { writeSync } from 'fs'
import { testRender } from '@opentui/react/test-utils'
import { act, useEffect } from 'react'
import { initializeShutdown, requestShutdown } from '../../src/util/shutdown'

const lifecycle: string[] = []

function ShutdownProbe() {
  useEffect(() => {
    lifecycle.push('mounted')
    return () => {
      lifecycle.push('unmounted')
    }
  }, [])

  return <text>Shutdown probe</text>
}

const setup = await testRender(<ShutdownProbe />, { width: 20, height: 4, consoleMode: 'disabled' })
initializeShutdown(setup.renderer)
process.once('exit', () => {
  writeSync(1, JSON.stringify({ destroyed: setup.renderer.isDestroyed, lifecycle }))
})

await act(async () => {
  await requestShutdown(0)
})
