import type { TextareaRenderable } from '@opentui/core'
import { useTheme } from '../styles/theme'
import { fitDialogRow } from './dialog-layout'

interface DialogFilterProps {
  placeholder: string
  searchQuery: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

interface DialogRowProps {
  label: string
  value: string
  selected: boolean
  width: number
  disabled?: boolean
}

export function DialogFilter({
  placeholder,
  searchQuery,
  textareaRef,
  onContentChange,
}: DialogFilterProps) {
  const theme = useTheme()

  return (
    <box
      style={{
        height: 1,
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
        wrapMode="none"
        placeholder={placeholder}
      />
    </box>
  )
}

export function DialogRow({ label, value, selected, width, disabled = false }: DialogRowProps) {
  const theme = useTheme()
  const text = fitDialogRow(label, value, width)

  return (
    <box
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: selected ? theme.selection : 'transparent',
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text
        style={{ fg: selected ? theme.selectionText : disabled ? theme.textMuted : theme.text }}
      >
        {text.label}
      </text>
      <text style={{ fg: selected ? theme.selectionText : theme.textMuted }}>{text.value}</text>
    </box>
  )
}
