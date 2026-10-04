import { Component, type ReactNode } from 'react'
import { useAppController } from './app/controller'
import { AppModalsLayer } from './app/modals-layer'
import { AppScreen } from './app/screen'
import { ThemeProvider } from './styles/theme'
import { ErrorScreen } from './ui/ErrorScreen'
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

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { report: DiagnosticReport.capture(error) }
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

function AppTree({ invocationCwd }: AppProps) {
  const { theme, screenProps, modalProps } = useAppController(invocationCwd)

  return (
    <ThemeProvider theme={theme}>
      <AppScreen {...screenProps} />
      <AppModalsLayer {...modalProps} />
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
