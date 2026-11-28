import { TextAttributes, type TextareaRenderable } from '@opentui/core'
import { useTheme } from '../styles/theme'
import { fitDialogLabelMatches, fitDialogRow } from './dialog-layout'
import HighlightedText from './HighlightedText'
import { rowForeground, SELECTED_MATCH_ATTRIBUTES } from './row-mark'
import { textFieldColors } from './text-field-colors'

interface DialogFilterProps {
  placeholder: string
  searchQuery: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

interface DialogFieldProps {
  initialValue: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
  placeholder?: string
  // One row scrolls sideways; more rows wrap words.
  height?: number
}

interface DialogRowProps {
  label: string
  value: string
  selected: boolean
  width: number
  disabled?: boolean
  // Option pickers mark the saved value; lists without one leave the cell blank.
  current?: boolean
  // Search match positions into `label`.
  matches?: readonly number[]
}

// The saved value's mark, in the row's first cell before the label.
const CURRENT_MARK = '●'

export function DialogSectionHeader({ text }: { text: string }) {
  const theme = useTheme()

  return (
    <text style={{ fg: theme.textMuted, attributes: TextAttributes.BOLD, wrapMode: 'none' }}>
      {text}
    </text>
  )
}

// The main search field's prompt, on the dialog background; the prompt sits in the rows' mark cell.
const PROMPT = '›'

export function DialogField({
  initialValue,
  textareaRef,
  onContentChange,
  placeholder,
  height = 1,
}: DialogFieldProps) {
  const theme = useTheme()

  return (
    <box style={{ flexDirection: 'row', flexShrink: 0, height }}>
      <text style={{ fg: theme.primary, flexShrink: 0, wrapMode: 'none' }}>{`${PROMPT} `}</text>
      <textarea
        ref={textareaRef}
        style={{ flexGrow: 1, flexShrink: 1, height }}
        placeholder={placeholder}
        {...textFieldColors(theme)}
        initialValue={initialValue}
        onContentChange={onContentChange}
        focused
        wrapMode={height > 1 ? 'word' : 'none'}
      />
    </box>
  )
}

export function DialogFilter({
  placeholder,
  searchQuery,
  textareaRef,
  onContentChange,
}: DialogFilterProps) {
  return (
    <box style={{ flexDirection: 'column', marginBottom: 1 }}>
      <DialogField
        initialValue={searchQuery}
        textareaRef={textareaRef}
        onContentChange={onContentChange}
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
  matches,
}: DialogRowProps) {
  const theme = useTheme()
  const text = fitDialogRow(label, value, width)
  const labelColor = rowForeground(theme, selected, disabled ? theme.textMuted : theme.text)

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
        <span style={{ fg: rowForeground(theme, selected, theme.primary) }}>
          {current ? CURRENT_MARK : ' '}
        </span>
        <span style={{ fg: labelColor }}> </span>
        <HighlightedText
          text={text.label}
          matchIndices={fitDialogLabelMatches(label, text.label, matches)}
          color={labelColor}
          highlightColor={selected ? theme.selectionText : undefined}
          highlightAttributes={selected ? SELECTED_MATCH_ATTRIBUTES : undefined}
        />
      </text>
      <text style={{ fg: rowForeground(theme, selected, theme.textMuted), wrapMode: 'none' }}>
        {text.value}
      </text>
    </box>
  )
}
