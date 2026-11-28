import type { SettingsEntry } from '../settings'
import { useTheme } from '../styles/theme'
import { fitDialogLabelMatches, truncateDialogText } from './dialog-layout'
import HighlightedText from './HighlightedText'
import { rowForeground, SELECTED_MATCH_ATTRIBUTES } from './row-mark'

interface Props {
  entry: Pick<SettingsEntry, 'title' | 'value' | 'control' | 'reset'>
  selected: boolean
  width: number
  // Search match positions into the title.
  matches: readonly number[]
}

// `‹ value ›` on the selected row when ←/→ change it in place, padded alike on other rows so
// nothing shifts; `value ↵` when Enter opens a picker or editor.
const CYCLE_OPEN = '‹ '
const CYCLE_CLOSE = ' ›'
const OPENS = ' ↵'
const LABEL_GAP = 2

function valueCell(entry: Props['entry'], selected: boolean, width: number): string {
  if (entry.control === 'open') {
    const value = truncateDialogText(entry.value, width - OPENS.length)

    return value ? `${value}${OPENS}` : ''
  }

  const value = truncateDialogText(entry.value, width - CYCLE_OPEN.length - CYCLE_CLOSE.length)

  if (!value) return ''

  return selected ? `${CYCLE_OPEN}${value}${CYCLE_CLOSE}` : `  ${value}  `
}

// One Settings row: the title, and the value on the right, muted while it is the default.
export default function SettingRow({ entry, selected, width, matches }: Props) {
  const theme = useTheme()
  const label = truncateDialogText(entry.title, width)
  const value = valueCell(entry, selected, width - label.length - LABEL_GAP)
  const labelColor = rowForeground(theme, selected, theme.text)

  const valueColor = rowForeground(
    theme,
    selected,
    entry.reset === 'default' ? theme.textMuted : theme.text
  )

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
        <span style={{ fg: labelColor }}>{'  '}</span>
        <HighlightedText
          text={label}
          matchIndices={fitDialogLabelMatches(entry.title, label, matches)}
          color={labelColor}
          highlightColor={selected ? theme.selectionText : undefined}
          highlightAttributes={selected ? SELECTED_MATCH_ATTRIBUTES : undefined}
        />
      </text>
      <text style={{ fg: valueColor, wrapMode: 'none' }}>{value}</text>
    </box>
  )
}
