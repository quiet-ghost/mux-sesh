import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './app'
import { initializeShutdown, requestShutdown } from './util/shutdown'

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
})

initializeShutdown(renderer)

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    void requestShutdown(signal === 'SIGINT' ? 130 : 0)
  })
}

createRoot(renderer).render(<App />)
