import type { ScrollBoxRenderable } from '@opentui/core'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { useMemo, useRef, useState } from 'react'
import { openBrowser } from '../util/browser'
import { writeClipboard } from '../util/clipboard'
import { buildIssueUrl, describeFailure, formatDiagnostics } from '../util/errors'
import { requestShutdown } from '../util/shutdown'

interface Props {
  error: unknown
  onRetry: () => void
}

export function ErrorScreen({ error, onRetry }: Props) {
  const { width, height } = useTerminalDimensions()
  const diagnostics = useMemo(() => formatDiagnostics(error), [error])
  const issueUrl = useMemo(() => buildIssueUrl(error, diagnostics), [error, diagnostics])
  const failure = useMemo(() => describeFailure(error), [error])
  const [status, setStatus] = useState('')
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  const copy = () => {
    setStatus(
      writeClipboard(diagnostics)
        ? 'Diagnostics copied'
        : 'Clipboard unavailable; use terminal selection'
    )
  }

  const openIssue = () => {
    setStatus('Opening prefilled GitHub issue...')
    void openBrowser(issueUrl).then(opened => {
      setStatus(
        opened
          ? 'Opened prefilled issue in your browser'
          : 'Could not open browser; report URL copied'
      )
      if (!opened) writeClipboard(issueUrl.toString())
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
      <box style={{ width: contentWidth, flexDirection: 'column', flexGrow: 1, gap: 1 }}>
        <text style={{ fg: '#e06c75' }}>mux-sesh crashed</text>
        <text style={{ fg: '#eeeeee' }}>{failure.message || 'An unexpected error occurred.'}</text>
        <text style={{ fg: '#808080' }}>
          c copy diagnostics · o open GitHub issue · r retry · q/esc/ctrl+c quit
        </text>
        {status ? <text style={{ fg: '#7fd88f' }}>{status}</text> : null}
        <box
          style={{
            flexGrow: 1,
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
            style={{ flexGrow: 1 }}
            verticalScrollbarOptions={{ visible: true }}
          >
            <text style={{ fg: '#b0b0b0' }}>{diagnostics}</text>
          </scrollbox>
        </box>
        <text style={{ fg: '#808080' }}>↑/↓, j/k, PgUp/PgDn scroll · GitHub opens unsubmitted</text>
      </box>
    </box>
  )
}
