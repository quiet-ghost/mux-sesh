import { CliRenderEvents, type CliRenderer, type CliRendererHandlerErrorEvent } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import {
  Component,
  createContext,
  useContext,
  useLayoutEffect,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useAppController } from './app/controller'
import { AppModalsLayer } from './app/modals-layer'
import { AppScreen } from './app/screen'
import { ThemeProvider } from './styles/theme'
import type { ThemeColors } from './types'
import { BusyContext } from './ui/Spinner'
import { ErrorScreen } from './ui/ErrorScreen'
import { FailurePalette } from './ui/failure-screen'
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

type RecordRecoveryTheme = (theme: ThemeColors) => void

const RecoveryThemeContext = createContext<RecordRecoveryTheme>(() => {})

// Hands the app's resolved theme to the recovery boundary so the crash screen keeps the user's
// colors. Only a committed render records it: a theme that failed to resolve never arrives, and
// the crash screen then falls back to the built-in colors.
export function useRecoveryTheme(theme: ThemeColors): void {
  const record = useContext(RecoveryThemeContext)

  useLayoutEffect(() => record(theme), [record, theme])
}

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
  // Read only when the error screen renders, so recording it never re-renders the app.
  private lastTheme: ThemeColors | undefined

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

  private recordTheme: RecordRecoveryTheme = theme => {
    this.lastTheme = theme
  }

  private retry = () => {
    this.setState(state => ({ report: null, retryKey: state.retryKey + 1 }))
  }

  render() {
    if (this.state.report) {
      const ErrorView = this.props.ErrorView ?? ErrorScreen

      return (
        <ThemeProvider theme={this.lastTheme ?? FailurePalette.fallback}>
          <EscalateToFatal>
            <ErrorView report={this.state.report} onRetry={this.retry} />
          </EscalateToFatal>
        </ThemeProvider>
      )
    }

    return (
      <RecoveryThemeContext value={this.recordTheme}>
        {this.props.children(this.state.retryKey)}
      </RecoveryThemeContext>
    )
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

  useRecoveryTheme(theme)

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
