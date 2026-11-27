import { CliRenderEvents, type CliRenderer, type CliRendererHandlerErrorEvent } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import { Component, type ReactElement, type ReactNode } from 'react'
import { useAppController } from './app/controller'
import { AppModalsLayer } from './app/modals-layer'
import { AppScreen } from './app/screen'
import { ThemeProvider } from './styles/theme'
import { BusyContext } from './ui/Spinner'
import { ErrorScreen } from './ui/ErrorScreen'
import { StartupErrorScreen } from './ui/StartupErrorScreen'
import { requestFatalShutdown, requestShutdown } from './util/shutdown'
import { DiagnosticReport } from './util/errors'

interface ErrorBoundaryState {
  report: DiagnosticReport | null
  retryKey: number
}

interface AppProps {
  invocationCwd: string
}

export interface ErrorViewProps {
  report: DiagnosticReport
  onRetry: () => void
}

interface RecoveryBoundaryProps {
  children: (retryKey: number) => ReactNode
  ErrorView?: (props: ErrorViewProps) => ReactElement
}

interface EscalationState {
  failed: boolean
}

// Both render-pass and mouse-handler failure events carry the thrown value in `error`.
type RendererFailureEvent = Pick<CliRendererHandlerErrorEvent, 'error'>

const RENDERER_FAILURE_EVENTS = [CliRenderEvents.RENDER_ERROR, CliRenderEvents.HANDLER_ERROR]

// If the error screen itself cannot render, the only safe recovery left is a restored terminal.
class EscalateToFatal extends Component<{ children: ReactNode }, EscalationState> {
  state: EscalationState = { failed: false }

  static getDerivedStateFromError(): EscalationState {
    return { failed: true }
  }

  componentDidCatch(cause: unknown): void {
    requestFatalShutdown(cause)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

class RecoveryBoundary extends Component<
  RecoveryBoundaryProps & { renderer: CliRenderer },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { report: null, retryKey: 0 }
  private errorScreenShown = false

  static getDerivedStateFromError(cause: unknown): Partial<ErrorBoundaryState> {
    return { report: DiagnosticReport.capture(cause) }
  }

  componentDidMount(): void {
    for (const event of RENDERER_FAILURE_EVENTS) this.props.renderer.on(event, this.recover)
  }

  componentDidUpdate(): void {
    this.errorScreenShown = this.state.report !== null
  }

  componentWillUnmount(): void {
    for (const event of RENDERER_FAILURE_EVENTS) this.props.renderer.off(event, this.recover)
  }

  // Render passes and mouse handlers fail outside React. The first failure gets the error screen;
  // one that persists once the screen is shown cannot be recovered in the UI.
  private recover = (event: RendererFailureEvent): void => {
    if (this.errorScreenShown) {
      requestFatalShutdown(event.error)

      return
    }

    this.setState(state =>
      state.report ? null : { report: DiagnosticReport.capture(event.error) }
    )
  }

  private retry = () => {
    this.setState(state => ({ report: null, retryKey: state.retryKey + 1 }))
  }

  render() {
    if (this.state.report) {
      const ErrorView = this.props.ErrorView ?? ErrorScreen

      return (
        <EscalateToFatal>
          <ErrorView report={this.state.report} onRetry={this.retry} />
        </EscalateToFatal>
      )
    }

    return this.props.children(this.state.retryKey)
  }
}

export function AppRecoveryBoundary(props: RecoveryBoundaryProps) {
  const renderer = useRenderer()

  return <RecoveryBoundary {...props} renderer={renderer} />
}

function quitAfterStartupFailure(): void {
  requestShutdown(1)
}

function AppTree({ invocationCwd }: AppProps) {
  const { startup, retryStartup, theme, busy, screenProps, modalProps } =
    useAppController(invocationCwd)

  return (
    <ThemeProvider theme={theme}>
      {startup.kind === 'failed' || startup.kind === 'retrying' ? (
        <StartupErrorScreen
          startup={startup}
          onRetry={retryStartup}
          onQuit={quitAfterStartupFailure}
        />
      ) : (
        <BusyContext value={busy}>
          <AppScreen {...screenProps} />
          <AppModalsLayer {...modalProps} />
        </BusyContext>
      )}
    </ThemeProvider>
  )
}

export function App({ invocationCwd }: AppProps) {
  return (
    <AppRecoveryBoundary>
      {retryKey => <AppTree key={retryKey} invocationCwd={invocationCwd} />}
    </AppRecoveryBoundary>
  )
}
