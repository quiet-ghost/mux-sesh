import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './app'
import { captureInvocationCwd } from './cli/invocation-cwd'
import { ignoreUnhandledThemeFollowSignal } from './styles/theme-follow'
import {
  initializeFatalErrorHandling,
  initializeShutdown,
  requestShutdown,
} from './lifecycle/shutdown'

const invocationCwd = captureInvocationCwd()

initializeFatalErrorHandling()

ignoreUnhandledThemeFollowSignal()

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  openConsoleOnError: false,
  // The app owns process signals; a renderer-owned handler would tear down the UI and leave the process running.
  exitSignals: [],
})

initializeShutdown(renderer)

const SIGNAL_EXIT_CODES = [
  ['SIGINT', 130],
  ['SIGTERM', 0],
  ['SIGHUP', 0],
  ['SIGQUIT', 131],
] as const

for (const [signal, code] of SIGNAL_EXIT_CODES) {
  process.on(signal, () => {
    requestShutdown(code)
  })
}

createRoot(renderer).render(<App invocationCwd={invocationCwd} />)
