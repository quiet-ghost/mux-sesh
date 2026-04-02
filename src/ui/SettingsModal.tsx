import type { TextareaRenderable } from '@opentui/core'
import { useTheme } from '../styles/theme'
import type { SettingsEntry } from '../settings'
import Modal from './Modal'
import { useTextareaFocus } from './use-textarea-focus'

interface Props {
  configPath: string
  themeName: string
  colorMode: string
  columns: number
  entries: SettingsEntry[]
  cursor: number
  searchQuery: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

export default function SettingsModal({
  configPath,
  themeName,
  colorMode,
  columns,
  entries,
  cursor,
  searchQuery,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  const selected = entries[cursor]
  useTextareaFocus(textareaRef, [])

  return (
    <Modal
      title="Settings"
      description="Search for a setting, then open its option or editor screen"
      footer="↑/↓ navigate  enter open  esc close"
      columns={columns}
      preferredWidth={74}
    >
      <box style={{ flexDirection: 'column', marginBottom: 1 }}>
        <text style={{ fg: theme.textMuted }}>Path: {configPath}</text>
        <text style={{ fg: theme.textMuted }}>
          {themeName} ({colorMode})
        </text>
      </box>

      <box
        style={{
          backgroundColor: theme.surfaceAlt,
          paddingLeft: 1,
          paddingRight: 1,
          marginBottom: 1,
        }}
      >
        <textarea
          ref={textareaRef}
          initialValue={searchQuery}
          onContentChange={onContentChange}
          focused
          placeholder="Search settings"
        />
      </box>

      <box style={{ flexDirection: 'column' }}>
        {entries.length === 0 ? (
          <text style={{ fg: theme.textMuted }}>No settings found</text>
        ) : (
          entries.map((entry, index) => {
            const active = index === cursor

            return (
              <box
                key={entry.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  backgroundColor: active ? theme.selection : 'transparent',
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
              >
                <text style={{ fg: active ? theme.selectionText : theme.text }}>{entry.label}</text>
                <text style={{ fg: active ? theme.selectionText : theme.textMuted }}>
                  {entry.value}
                </text>
              </box>
            )
          })
        )}
      </box>

      {selected && (
        <box style={{ flexDirection: 'column', marginTop: 1 }}>
          <text style={{ fg: theme.accent }}>{selected.label}</text>
          <text style={{ fg: theme.textMuted }}>{selected.hint}</text>
        </box>
      )}
    </Modal>
  )
}
