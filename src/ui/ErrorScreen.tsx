import type { ScrollBoxRenderable } from '@opentui/core'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { useRef, useState } from 'react'
import type { ToastKind } from '../app/notifications'
import { openBrowser } from '../util/browser'
import { type ClipboardResult, writeClipboard } from '../util/clipboard'
import type { DiagnosticReport } from '../util/errors'
import { requestShutdown } from '../util/shutdown'
import { FailureScreen, isRoomyFailureScreen, useFailurePalette } from './failure-screen'
import type { KeyHint } from './key-hints'
import { toastColor } from './Toast'

interface ErrorScreenActions {
  copy: (text: string) => ClipboardResult
  open: (url: string) => Promise<boolean>
}

interface Props {
  report: DiagnosticReport
  onRetry: () => void
  onQuit?: () => void
  actions?: ErrorScreenActions
}

type ShareState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'confirming' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'opening' }
  | { readonly kind: 'opened' }
  | { readonly kind: 'open-failed'; readonly urlCopy: ClipboardResult }
  | { readonly kind: 'report-copied'; readonly result: ClipboardResult }

// Share and copy outcomes read like toasts: a card whose side border is colored by kind.
interface Notice {
  readonly text: string
  readonly kind: ToastKind
}

const DEFAULT_ACTIONS: ErrorScreenActions = { copy: writeClipboard, open: openBrowser }
const IDLE: ShareState = { kind: 'idle' }
const DESCRIPTION = 'An unexpected error stopped the picker'

const RETRY: KeyHint = { label: 'retry', key: 'r' }
const QUIT: KeyHint = { label: 'quit', key: 'q' }

const HINTS: readonly KeyHint[] = [
  { label: 'copy', key: 'c' },
  { label: 'share', key: 'o' },
  RETRY,
  QUIT,
]

// Copy and share wait while the browser opens.
const OPENING_HINTS: readonly KeyHint[] = [RETRY, QUIT]

const CONFIRM_HINTS: readonly KeyHint[] = [
  { label: 'open', key: 'y/enter' },
  { label: 'cancel', key: 'n/esc' },
  QUIT,
]

const SCROLL_HINTS: readonly KeyHint[] = [{ label: 'scroll', key: '↑/↓' }]
const REVIEW_HINTS: readonly KeyHint[] = [{ label: 'review', key: '↑/↓' }]

const quitApp = () => {
  requestShutdown(1)
}

function reportCopyNotice(result: ClipboardResult): Notice {
  if (result.kind === 'copied')
    return { text: 'Diagnostics copied to the clipboard', kind: 'success' }

  if (result.kind === 'sent-unconfirmed')
    return {
      text: 'Diagnostics sent to the terminal clipboard; the terminal may not support it',
      kind: 'warning',
    }

  return { text: 'Clipboard unavailable; select the report text in your terminal', kind: 'error' }
}

function openFailedNotice(urlCopy: ClipboardResult, report: DiagnosticReport): string {
  const fullReport = report.issueUrlTruncated
    ? ' Its report is shortened; c copies the full local report.'
    : ''

  if (urlCopy.kind === 'copied') return `Could not open the browser; issue URL copied.${fullReport}`

  if (urlCopy.kind === 'sent-unconfirmed')
    return `Could not open the browser; issue URL sent to the terminal clipboard; the terminal may not support it.${fullReport}`

  return report.issueUrlTruncated
    ? 'Could not open the browser; c copies the full local report.'
    : 'Could not open the browser; press c to copy the report.'
}

function shareNotice(state: ShareState, report: DiagnosticReport): Notice | undefined {
  switch (state.kind) {
    case 'idle':
      return undefined
    case 'confirming':
      return {
        text: [
          'Send the report below to github.com through your browser? The URL stays in browser',
          'history; nothing is filed until you submit.',
          report.issueUrlTruncated
            ? 'The browser copy is shortened to fit the URL.'
            : 'The browser copy holds the full report.',
        ].join(' '),
        kind: 'warning',
      }
    case 'cancelled':
      return { text: 'Sharing cancelled; nothing was sent', kind: 'success' }
    case 'opening':
      return { text: 'Opening the prefilled GitHub issue in your browser...', kind: 'info' }
    case 'opened':
      return {
        text: 'Sent the prefilled issue to your browser; submit it there to file it',
        kind: 'success',
      }
    case 'open-failed':
      return { text: openFailedNotice(state.urlCopy, report), kind: 'error' }
    case 'report-copied':
      return reportCopyNotice(state.result)
  }
}

export function ErrorScreen({
  report,
  onRetry,
  onQuit = quitApp,
  actions = DEFAULT_ACTIONS,
}: Props) {
  const { width, height } = useTerminalDimensions()
  const theme = useFailurePalette()
  const [share, setShare] = useState<ShareState>(IDLE)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  const openIssue = () => {
    setShare({ kind: 'opening' })

    const showOpenResult = (opened: boolean) => {
      setShare(
        opened
          ? { kind: 'opened' }
          : { kind: 'open-failed', urlCopy: actions.copy(report.issueUrl) }
      )
    }

    actions.open(report.issueUrl).then(showOpenResult, () => showOpenResult(false))
  }

  const handleShareKey = (name: string): void => {
    if (share.kind === 'confirming') {
      if (name === 'y' || name === 'return' || name === 'enter') openIssue()
      else if (name === 'n' || name === 'escape') setShare({ kind: 'cancelled' })

      return
    }

    if (name === 'escape') onQuit()
    else if (name === 'r') onRetry()
    else if (share.kind === 'opening') return
    else if (name === 'c') setShare({ kind: 'report-copied', result: actions.copy(report.text) })
    else if (name === 'o') setShare({ kind: 'confirming' })
  }

  useKeyboard(key => {
    if ((key.ctrl && key.name === 'c') || key.name === 'q') {
      onQuit()

      return
    }

    if (key.name === 'up' || key.name === 'k') scrollRef.current?.scrollBy(-1)
    else if (key.name === 'down' || key.name === 'j') scrollRef.current?.scrollBy(1)
    else if (key.name === 'pageup') scrollRef.current?.scrollBy(-Math.max(1, height - 12))
    else if (key.name === 'pagedown') scrollRef.current?.scrollBy(Math.max(1, height - 12))
    else if (key.name === 'home') scrollRef.current?.scrollTo(0)
    else if (key.name === 'end') scrollRef.current?.scrollTo(scrollRef.current.scrollHeight)
    else handleShareKey(key.name)
  })

  const notice = shareNotice(share, report)
  const confirming = share.kind === 'confirming'
  const roomy = isRoomyFailureScreen(height)

  return (
    <FailureScreen
      title="mux-sesh crashed"
      description={DESCRIPTION}
      hints={confirming ? CONFIRM_HINTS : share.kind === 'opening' ? OPENING_HINTS : HINTS}
      end={{ kind: 'hints', hints: confirming ? REVIEW_HINTS : SCROLL_HINTS }}
      columns={width}
      rows={height}
    >
      <text style={{ fg: theme.text, flexShrink: 0 }}>{report.screen.summary}</text>
      {notice ? <NoticeCard notice={notice} /> : null}
      <box
        style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 4 }}
      >
        <text style={{ fg: theme.textMuted, flexShrink: 0 }}>
          <b>Diagnostics</b>
        </text>
        <box
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minHeight: 3,
            backgroundColor: theme.surface,
            paddingLeft: 1,
            paddingTop: roomy ? 1 : 0,
            paddingBottom: roomy ? 1 : 0,
          }}
        >
          <scrollbox
            ref={scrollRef}
            style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 }}
            verticalScrollbarOptions={{
              trackOptions: { foregroundColor: theme.textSubtle, backgroundColor: theme.surface },
            }}
          >
            <text style={{ fg: theme.text, paddingRight: 1 }}>{report.screen.text}</text>
          </scrollbox>
        </box>
        {report.issueUrlTruncated && !confirming && (
          <text style={{ fg: theme.textMuted, flexShrink: 0 }}>
            Browser report shortened; c copies the full captured report.
          </text>
        )}
      </box>
    </FailureScreen>
  )
}

function NoticeCard({ notice }: { notice: Notice }) {
  const theme = useFailurePalette()

  return (
    <box
      style={{
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.surfaceAlt,
        border: ['left', 'right'],
        borderStyle: 'heavy',
        borderColor: toastColor(theme, notice.kind),
      }}
    >
      <text style={{ fg: theme.text, wrapMode: 'word', width: '100%' }}>{notice.text}</text>
    </box>
  )
}
