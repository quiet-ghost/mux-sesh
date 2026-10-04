import type { ScrollBoxRenderable } from '@opentui/core'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { useRef, useState } from 'react'
import { openBrowser } from '../util/browser'
import { writeClipboard } from '../util/clipboard'
import type { DiagnosticReport } from '../util/errors'
import { requestShutdown } from '../util/shutdown'

interface Props {
  report: DiagnosticReport
  onRetry: () => void
  actions?: {
    copy: (text: string) => boolean
    open: (url: string) => Promise<boolean>
  }
}

const DEFAULT_ACTIONS = { copy: writeClipboard, open: openBrowser }

export function ErrorScreen({ report, onRetry, actions = DEFAULT_ACTIONS }: Props) {
  const { width, height } = useTerminalDimensions()
  const [status, setStatus] = useState('')
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  const copy = () => {
    setStatus(
      actions.copy(report.text)
        ? 'Diagnostics copied'
        : 'Clipboard unavailable; use terminal selection'
    )
  }

  const openIssue = () => {
    setStatus('Opening prefilled GitHub issue...')
    void actions.open(report.issueUrl).then(opened => {
      setStatus(
        opened
          ? 'Opened prefilled issue in your browser'
          : 'Could not open browser; report URL copied'
      )
      if (!opened) actions.copy(report.issueUrl)
    })
  }

  useKeyboard(key => {
    if ((key.ctrl && key.name === 'c') || key.name === 'q' || key.name === 'escape') {
      void requestShutdown(1)
      return
    }
    if (key.name === 'c') copy()
    else if (key.name === 'o') openIssue()
    else if (key.name === 'r') onRetry()
    else if (key.name === 'up' || key.name === 'k') scrollRef.current?.scrollBy(-1)
    else if (key.name === 'down' || key.name === 'j') scrollRef.current?.scrollBy(1)
    else if (key.name === 'pageup') scrollRef.current?.scrollBy(-Math.max(1, height - 12))
    else if (key.name === 'pagedown') scrollRef.current?.scrollBy(Math.max(1, height - 12))
    else if (key.name === 'home') scrollRef.current?.scrollTo(0)
    else if (key.name === 'end') scrollRef.current?.scrollTo(scrollRef.current.scrollHeight)
  })

  const contentWidth = Math.max(24, Math.min(100, width - 4))

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
          gap: 1,
        }}
      >
        <text style={{ fg: '#e06c75' }}>mux-sesh crashed</text>
        <text style={{ fg: '#eeeeee' }}>{report.summary}</text>
        <text style={{ fg: '#808080' }}>
          c copy diagnostics · o open GitHub issue · r retry · q/esc/ctrl+c quit
        </text>
        {status ? <text style={{ fg: '#7fd88f' }}>{status}</text> : null}
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
        {report.issueUrlTruncated && (
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
