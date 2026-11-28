import { writeSync } from 'fs'
import { testRender } from '@opentui/react/test-utils'
import { initializeShutdown, requestFatalShutdown } from '../../src/lifecycle/shutdown'

// Records, in order, what a fatal shutdown on a terminal writes to stdout and stderr, then prints
// the record as JSON on exit.
interface Write {
  readonly stream: 'stdout' | 'stderr'
  readonly text: string
}

const writes: Write[] = []

const setup = await testRender(<text>Output order probe</text>, {
  width: 20,
  height: 4,
  consoleMode: 'disabled',
})

initializeShutdown(setup.renderer)

Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })

for (const stream of ['stdout', 'stderr'] as const) {
  process[stream].write = (chunk: string | Uint8Array): boolean => {
    writes.push({
      stream,
      text: chunk instanceof Uint8Array ? new TextDecoder().decode(chunk) : chunk,
    })

    return true
  }
}

process.once('exit', () => {
  writeSync(1, JSON.stringify(writes))
})

requestFatalShutdown(new Error('fixture fatal failure'))
