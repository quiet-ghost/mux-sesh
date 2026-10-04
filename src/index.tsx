import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './app'
import { captureInvocationCwd } from './cli/invocation-cwd'
import { ignoreUnhandledThemeFollowSignal } from './styles/theme-follow'
import { initializeFatalErrorHandling, initializeShutdown, requestShutdown } from './util/shutdown'

const invocationCwd = captureInvocationCwd()

initializeFatalErrorHandling()
ignoreUnhandledThemeFollowSignal()

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  openConsoleOnError: false,
})

initializeShutdown(renderer)

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    void requestShutdown(signal === 'SIGINT' ? 130 : 0)
  })
}

createRoot(renderer).render(<App invocationCwd={invocationCwd} />)
