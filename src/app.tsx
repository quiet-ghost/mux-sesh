import { Component, type ReactNode } from 'react'
import { useAppController } from './app/controller'
import { AppModalsLayer } from './app/modals-layer'
import { AppScreen } from './app/screen'
import { ThemeProvider } from './styles/theme'
import { ErrorScreen } from './ui/ErrorScreen'

interface ErrorBoundaryState {
  error?: unknown
  hasError: boolean
  retryKey: number
}

class RootErrorBoundary extends Component<
  { children: (retryKey: number) => ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, retryKey: 0 }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error, hasError: true }
  }

  private retry = () => {
    this.setState(state => ({ error: undefined, hasError: false, retryKey: state.retryKey + 1 }))
  }

  render() {
    if (this.state.hasError) {
      return <ErrorScreen error={this.state.error} onRetry={this.retry} />
    }

    return this.props.children(this.state.retryKey)
  }
}

function AppTree() {
  const { theme, screenProps, modalProps } = useAppController()

  return (
    <ThemeProvider theme={theme}>
      <AppScreen {...screenProps} />
      <AppModalsLayer {...modalProps} />
    </ThemeProvider>
  )
}

export function App() {
  return <RootErrorBoundary>{retryKey => <AppTree key={retryKey} />}</RootErrorBoundary>
}
