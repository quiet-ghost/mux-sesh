import { TextAttributes, type TextareaRenderable } from '@opentui/core'
import { useTheme } from '../styles/theme'
import { fitDialogRow } from './dialog-layout'
import { rowForeground, rowGutter } from './row-mark'

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
  // Option pickers mark the saved value; lists without one leave the cell blank.
  current?: boolean
}

// The saved value's mark, in the cell between the selection gutter and the label.
const CURRENT_MARK = '●'

export function DialogSectionHeader({ text }: { text: string }) {
  const theme = useTheme()

  return (
    <text style={{ fg: theme.textMuted, attributes: TextAttributes.BOLD, wrapMode: 'none' }}>
      {text}
    </text>
  )
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

export function DialogRow({
  label,
  value,
  selected,
  width,
  disabled = false,
  current = false,
}: DialogRowProps) {
  const theme = useTheme()
  const text = fitDialogRow(label, value, width)

  return (
    <box
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: selected ? theme.selection : 'transparent',
        paddingRight: 1,
      }}
    >
      <text style={{ wrapMode: 'none' }}>
        <span style={{ fg: theme.primary, bg: theme.surfaceModal }}>{rowGutter(selected)}</span>
        <span style={{ fg: rowForeground(theme, selected, theme.primary) }}>
          {current ? CURRENT_MARK : ' '}
        </span>
        <span
          style={{
            fg: rowForeground(theme, selected, disabled ? theme.textMuted : theme.text),
          }}
        >
          {` ${text.label}`}
        </span>
      </text>
      <text style={{ fg: rowForeground(theme, selected, theme.textMuted), wrapMode: 'none' }}>
        {text.value}
      </text>
    </box>
  )
}
