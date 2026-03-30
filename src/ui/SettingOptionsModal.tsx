import type { TextareaRenderable } from '@opentui/core'
import { useEffect } from 'react'
import { useTheme } from '../styles/theme'
import type { SettingsOption } from '../settings'
import Modal from './Modal'

interface Props {
  title: string
  description: string
  columns: number
  options: SettingsOption[]
  cursor: number
  searchQuery: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

export default function SettingOptionsModal({
  title,
  description,
  columns,
  options,
  cursor,
  searchQuery,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  const selected = options[cursor]

  useEffect(() => {
    queueMicrotask(() => {
      textareaRef.current?.focus()
    })
  }, [textareaRef])

  return (
    <Modal title={title} description={description} footer='↑/↓ navigate  enter apply  esc back' columns={columns} preferredWidth={68}>
      <box style={{ backgroundColor: theme.surfaceAlt, paddingLeft: 1, paddingRight: 1, marginBottom: 1 }}>
        <textarea ref={textareaRef} initialValue={searchQuery} onContentChange={onContentChange} focused placeholder='Filter options' />
      </box>

      <box style={{ flexDirection: 'column' }}>
        {options.length === 0 ? (
          <text style={{ fg: theme.textMuted }}>No options found</text>
        ) : (
          options.map((option, index) => {
            const active = index === cursor

            return (
              <box
                key={option.value}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  backgroundColor: active ? theme.selection : 'transparent',
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
              >
                <text style={{ fg: active ? theme.selectionText : theme.text }}>{option.label}</text>
                <text style={{ fg: active ? theme.selectionText : theme.textMuted }}>{option.value}</text>
              </box>
            )
          })
        )}
      </box>

      {selected && selected.description && (
        <box style={{ flexDirection: 'column', marginTop: 1 }}>
          <text style={{ fg: theme.accent }}>{selected.label}</text>
          <text style={{ fg: theme.textMuted }}>{selected.description}</text>
        </box>
      )}
    </Modal>
  )
}
