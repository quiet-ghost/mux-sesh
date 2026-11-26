import type { ScrollBoxRenderable } from '@opentui/core'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { useRef, useState } from 'react'
import { openBrowser } from '../util/browser'
import { type ClipboardResult, writeClipboard } from '../util/clipboard'
import type { DiagnosticReport } from '../util/errors'
import { requestShutdown } from '../util/shutdown'

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

interface Notice {
  readonly text: string
  readonly color: string
}

const DEFAULT_ACTIONS: ErrorScreenActions = { copy: writeClipboard, open: openBrowser }
const IDLE: ShareState = { kind: 'idle' }
const SUCCESS = '#7fd88f'
const CAUTION = '#e5c07b'
const FAILURE = '#e06c75'

const quitApp = () => {
  requestShutdown(1)
}

function reportCopyNotice(result: ClipboardResult): Notice {
  if (result.kind === 'copied')
    return { text: 'Diagnostics copied to the clipboard', color: SUCCESS }

  if (result.kind === 'sent-unconfirmed')
    return {
      text: 'Diagnostics sent to the terminal clipboard; the terminal may not support it',
      color: CAUTION,
    }

  return { text: 'Clipboard unavailable; select the report text in your terminal', color: FAILURE }
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
        color: CAUTION,
      }
    case 'cancelled':
      return { text: 'Sharing cancelled; nothing was sent', color: SUCCESS }
    case 'opening':
      return { text: 'Opening the prefilled GitHub issue in your browser...', color: CAUTION }
    case 'opened':
      return {
        text: 'Sent the prefilled issue to your browser; submit it there to file it',
        color: SUCCESS,
      }
    case 'open-failed':
      return { text: openFailedNotice(state.urlCopy, report), color: FAILURE }
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

  const contentWidth = Math.max(24, Math.min(100, width - 4))
  const notice = shareNotice(share, report)

  return (
    <box
      style={{
        width,
        height,
        backgroundColor: '#0a0a0a',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 1,
        paddingBottom: 1,
      }}
    >
      <box
        style={{
          width: contentWidth,
          flexDirection: 'column',
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minHeight: 0,
          gap: height < 24 ? 0 : 1,
        }}
      >
        <text style={{ fg: '#e06c75' }}>mux-sesh crashed</text>
        <text style={{ fg: '#eeeeee' }}>{report.summary}</text>
        <text style={{ fg: '#808080' }}>
          {share.kind === 'confirming'
            ? 'y/enter open · n/esc cancel · ↑/↓ review · q quit'
            : 'c copy diagnostics · o review & share on GitHub · r retry · q/esc/ctrl+c quit'}
        </text>
        {notice ? <text style={{ fg: notice.color, flexShrink: 0 }}>{notice.text}</text> : null}
        <box
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minHeight: 3,
            border: true,
            borderStyle: 'rounded',
            borderColor: '#3c3c3c',
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <scrollbox
            ref={scrollRef}
            style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 }}
            verticalScrollbarOptions={{ visible: true }}
          >
            <text style={{ fg: '#b0b0b0' }}>{report.text}</text>
          </scrollbox>
        </box>
        {report.issueUrlTruncated && share.kind !== 'confirming' && (
          <text style={{ fg: '#808080' }}>
            Browser report shortened; c copies the full captured report.
          </text>
        )}
        <text style={{ fg: '#808080' }}>
          ↑/↓, j/k, PgUp/PgDn scroll · o shares diagnostics with GitHub
        </text>
      </box>
    </box>
  )
}
