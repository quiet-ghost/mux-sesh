import { Component, type ReactNode } from 'react'
import { useAppController } from './app/controller'
import { AppModalsLayer } from './app/modals-layer'
import { AppScreen } from './app/screen'
import { ThemeProvider } from './styles/theme'
import { ErrorScreen } from './ui/ErrorScreen'
import { StartupErrorScreen } from './ui/StartupErrorScreen'
import { requestShutdown } from './util/shutdown'
import { DiagnosticReport } from './util/errors'

interface ErrorBoundaryState {
  report: DiagnosticReport | null
  retryKey: number
}

interface AppProps {
  invocationCwd: string
}

class RootErrorBoundary extends Component<
  { children: (retryKey: number) => ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { report: null, retryKey: 0 }

  static getDerivedStateFromError(cause: unknown): Partial<ErrorBoundaryState> {
    return { report: DiagnosticReport.capture(cause) }
  }

  private retry = () => {
    this.setState(state => ({ report: null, retryKey: state.retryKey + 1 }))
  }

  render() {
    if (this.state.report) {
      return <ErrorScreen report={this.state.report} onRetry={this.retry} />
    }

    return this.props.children(this.state.retryKey)
  }
}

function quitAfterStartupFailure(): void {
  requestShutdown(1)
}

function AppTree({ invocationCwd }: AppProps) {
  const { startup, retryStartup, theme, screenProps, modalProps } = useAppController(invocationCwd)

  return (
    <ThemeProvider theme={theme}>
      {startup.kind === 'failed' || startup.kind === 'retrying' ? (
        <StartupErrorScreen
          startup={startup}
          onRetry={retryStartup}
          onQuit={quitAfterStartupFailure}
        />
      ) : (
        <>
          <AppScreen {...screenProps} />
          <AppModalsLayer {...modalProps} />
        </>
      )}
    </ThemeProvider>
  )
}

export function App({ invocationCwd }: AppProps) {
  return (
    <RootErrorBoundary>
      {retryKey => <AppTree key={retryKey} invocationCwd={invocationCwd} />}
    </RootErrorBoundary>
  )
}
