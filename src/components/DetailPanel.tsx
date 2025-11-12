import { useEffect, useState } from 'react'
import { getSessionDetails } from '../lib/tmux'
import { colors, detailPanelStyle } from '../styles/theme'
import type { Item, SessionDetails, AppMode } from '../types'

interface Props {
  selectedItem?: Item
  appMode: AppMode
}

export default function DetailPanel({ selectedItem, appMode }: Props) {
  const [details, setDetails] = useState<SessionDetails | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (selectedItem?.isSession) {
      setLoading(true)
      getSessionDetails(selectedItem.title)
        .then(setDetails)
        .catch(() => setDetails(null))
        .finally(() => setLoading(false))
    } else {
      setDetails(null)
    }
  }, [selectedItem])

  if (!selectedItem?.isSession) {
    return (
      <box style={detailPanelStyle}>
        <text style={{ fg: colors.primary, marginBottom: 1 }}>Details</text>
        <text style={{ fg: colors.inactive }}>No session selected</text>
      </box>
    )
  }

  if (loading) {
    return (
      <box style={detailPanelStyle}>
        <text style={{ fg: colors.primary, marginBottom: 1 }}>{selectedItem.title}</text>
        <text style={{ fg: colors.inactive }}>Loading...</text>
      </box>
    )
  }

  if (!details) {
    return (
      <box style={detailPanelStyle}>
        <text style={{ fg: colors.primary, marginBottom: 1 }}>{selectedItem.title}</text>
        <text style={{ fg: colors.inactive }}>Unable to load session details</text>
      </box>
    )
  }

  return (
    <box style={detailPanelStyle}>
      <text style={{ fg: colors.primary, marginBottom: 1 }}>{details.name}</text>

      <box style={{ flexDirection: 'column', marginBottom: 1 }}>
        <text>
          Status:{' '}
          <span style={{ fg: details.isAttached ? colors.active : colors.inactive }}>
            {details.isAttached ? '● Active' : '○ Inactive'}
          </span>
        </text>
        <text>Windows: {details.windowCount}</text>
      </box>

      <text style={{ fg: colors.primary, marginBottom: 1 }}> Windows</text>

      <box style={{ flexDirection: 'column' }}>
        {details.windows.length === 0 ? (
          <text style={{ fg: colors.inactive }}>No windows found</text>
        ) : (
          details.windows.map((win, i) => (
            <box key={i} style={{ flexDirection: 'column', marginBottom: 1 }}>
              <text>
                {win.index}: {win.name}
              </text>
              {win.currentCommand && (
                <text style={{ fg: colors.program, marginLeft: 2 }}>▸ {win.currentCommand}</text>
              )}
              {win.currentPath && (
                <text style={{ fg: colors.fileTree, marginLeft: 2 }}> {win.currentPath}</text>
              )}
            </box>
          ))
        )}
      </box>
    </box>
  )
}
