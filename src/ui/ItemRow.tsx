import { memo } from 'react'
import { useTheme } from '../styles/theme'
import type { IconConfig, Item, ThemeColors } from '../types'
import HighlightedText from './HighlightedText'
import { getItemIconPresentation } from './item-icon'
import {
  markedMeta,
  rowBackground,
  rowForeground,
  rowGutter,
  rowMarker,
  SELECTED_MATCH_ATTRIBUTES,
} from './row-mark'
import { fitListRowWithMatches } from './session-viewport'

interface Props {
  item: Item
  selected: boolean
  marked: boolean
  width: number
  titleColumn: number
  context: string
  meta: string
  // Highlights the item's search match positions; off when the query is blank.
  searching: boolean
  icons?: IconConfig
}

// The gutter, the mark cell and its space, and the status cell.
const ROW_PREFIX_COLUMNS = 4

type RowStatus = { kind: 'live'; attached: boolean } | { kind: 'none' }

// Sessions and configured rows always show whether they are live; a project or file shows its
// linked session's state, and nothing when it has none.
function getRowStatus(item: Item): RowStatus {
  if (item.isSession || item.itemKind === 'configured') {
    return { kind: 'live', attached: item.isAttached === true }
  }

  if (item.linkedSessionName) {
    return { kind: 'live', attached: item.linkedSessionAttached === true }
  }

  return { kind: 'none' }
}

function metaColor(theme: ThemeColors, item: Item, marked: boolean): string {
  if (marked || item.agentStatus === 'blocked') return theme.danger

  return item.agentStatus === 'working' ? theme.active : theme.textSubtle
}

function ItemRow({
  item,
  selected,
  marked,
  width,
  titleColumn,
  context,
  meta: baseMeta,
  searching,
  icons,
}: Props) {
  const theme = useTheme()
  const icon = getItemIconPresentation(theme, item, icons)
  const status = getRowStatus(item)
  const meta = markedMeta(marked, baseMeta)

  const iconText = icon.glyph ? ` ${icon.glyph}` : ''
  const prefixWidth = ROW_PREFIX_COLUMNS + iconText.length
  const metaWidth = meta ? meta.length + 1 : 0

  const row = fitListRowWithMatches(
    item.title,
    context,
    width - prefixWidth - metaWidth,
    titleColumn,
    searching ? item.searchMatch : undefined
  )

  const titleColor = rowForeground(theme, selected, theme.text)
  const contextColor = rowForeground(theme, selected, theme.textSubtle)
  const highlightColor = selected ? theme.selectionText : undefined
  const highlightAttributes = selected ? SELECTED_MATCH_ATTRIBUTES : undefined

  return (
    <box
      style={{
        flexDirection: 'row',
        flexShrink: 0,
        justifyContent: 'space-between',
        backgroundColor: rowBackground(theme, selected, marked),
        paddingRight: 1,
      }}
    >
      <text style={{ wrapMode: 'none' }}>
        <span style={{ fg: theme.primary, bg: theme.surface }}>{rowGutter(selected)}</span>
        <span style={{ fg: rowForeground(theme, selected, theme.danger) }}>
          {rowMarker(marked)}
        </span>
        {status.kind === 'live' ? (
          <span
            style={{
              fg: rowForeground(theme, selected, status.attached ? theme.active : theme.inactive),
            }}
          >
            {status.attached ? '●' : '○'}
          </span>
        ) : (
          ' '
        )}
        <span style={{ fg: rowForeground(theme, selected, icon.color) }}>{iconText}</span>{' '}
        {row.titleMatches.length > 0 ? (
          <HighlightedText
            text={row.title}
            matchIndices={row.titleMatches}
            color={titleColor}
            highlightColor={highlightColor}
            highlightAttributes={highlightAttributes}
          />
        ) : (
          <span style={{ fg: titleColor }}>{row.title}</span>
        )}
        {row.context && row.contextMatches.length > 0 ? (
          <>
            <span style={{ fg: contextColor }}>{row.spacer}</span>
            <HighlightedText
              text={row.context}
              matchIndices={row.contextMatches}
              color={contextColor}
              highlightColor={highlightColor}
              highlightAttributes={highlightAttributes}
            />
          </>
        ) : row.context ? (
          <span style={{ fg: contextColor }}>{`${row.spacer}${row.context}`}</span>
        ) : null}
      </text>

      <text
        style={{
          wrapMode: 'none',
          fg: rowForeground(theme, selected, metaColor(theme, item, marked)),
        }}
      >
        {meta}
      </text>
    </box>
  )
}

// Rows keep their item's identity across a cursor move, so only the rows whose selection changed re-render.
export default memo(ItemRow)
