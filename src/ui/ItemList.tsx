import { useTheme } from '../styles/theme'
import { AppMode, type IconConfig } from '../types'
import HighlightedText from './HighlightedText'
import { getItemIconPresentation } from './item-icon'
import { getVisibleWindow } from './list-window'
import {
  markedMeta,
  rowBackground,
  rowForeground,
  rowGutter,
  rowMarker,
  SELECTED_MATCH_ATTRIBUTES,
} from './row-mark'
import { fitListRow } from './session-viewport'
import type { Item } from '../types'
import { getItemKey } from '../multiplexer/items'

interface Props {
  items: Item[]
  cursor: number
  appMode: AppMode
  maxItems: number
  width: number
  searchQuery?: string
  // New only: the frozen plan's action for the selected row; undefined falls back to the row hint.
  selectedAction?: string
  icons?: IconConfig
  marked?: ReadonlyMap<string, Item>
}

const SESSION_ROW_PREFIX_COLUMNS = 4

export default function ItemList({
  items,
  cursor,
  appMode,
  maxItems,
  width,
  searchQuery = '',
  selectedAction,
  icons,
  marked,
}: Props) {
  const theme = useTheme()
  const isSearching = searchQuery.trim().length > 0
  const visibleWindow = getVisibleWindow(items, cursor, maxItems)

  return (
    <>
      {visibleWindow.items.map((item, i) => {
        const absoluteIndex = visibleWindow.startIndex + i
        const titleMatchIndices = item.searchMatch?.titleIndices
        const descMatchIndices = item.searchMatch?.descIndices
        const hasTitleMatch = titleMatchIndices && titleMatchIndices.length > 0
        const hasDescMatch = descMatchIndices && descMatchIndices.length > 0
        const icon = getItemIconPresentation(theme, item, icons)

        const selected = absoluteIndex === cursor

        const sessionStatusLabel = item.linkedSessionName
          ? 'focus'
          : item.itemKind === 'file'
            ? 'open'
            : 'create'

        const linkedSessionLabel = item.linkedSessionName ? ` -> ${item.linkedSessionName}` : ''
        const rowAction = `${sessionStatusLabel}${linkedSessionLabel}`
        const isMarked = marked?.has(getItemKey(item)) ?? false

        const rowMeta = item.isSession
          ? `(${item.windowCount})`
          : appMode === AppMode.NewSession
            ? ((selected ? selectedAction : undefined) ?? rowAction)
            : ''

        const meta = markedMeta(isMarked, rowMeta)

        const prefixWidth = item.isSession ? SESSION_ROW_PREFIX_COLUMNS : 3 + icon.glyph.length
        const metaWidth = meta ? meta.length + 1 : 0

        const row = fitListRow(
          item.title,
          item.desc,
          width - prefixWidth - metaWidth,
          item.title.length
        )

        const titleColor = rowForeground(theme, selected, theme.text)
        const contextColor = rowForeground(theme, selected, theme.textSubtle)
        const highlightColor = selected ? theme.selectionText : undefined
        const highlightAttributes = selected ? SELECTED_MATCH_ATTRIBUTES : undefined

        return (
          <box
            key={`${getItemKey(item)}:${item.path}`}
            style={{
              flexDirection: 'row',
              flexShrink: 0,
              justifyContent: 'space-between',
              backgroundColor: rowBackground(theme, selected, isMarked),
              paddingRight: 1,
            }}
          >
            <text style={{ wrapMode: 'none' }}>
              <span style={{ fg: theme.primary, bg: theme.surface }}>{rowGutter(selected)}</span>
              <span style={{ fg: rowForeground(theme, selected, theme.danger) }}>
                {rowMarker(isMarked)}
              </span>
              {item.isSession ? (
                <span
                  style={{
                    fg: rowForeground(
                      theme,
                      selected,
                      item.isAttached ? theme.active : theme.inactive
                    ),
                  }}
                >
                  {item.isAttached ? '●' : '○'}
                </span>
              ) : (
                <span style={{ fg: rowForeground(theme, selected, icon.color) }}>{icon.glyph}</span>
              )}{' '}
              {isSearching && hasTitleMatch ? (
                <HighlightedText
                  text={row.title}
                  matchIndices={titleMatchIndices}
                  color={titleColor}
                  highlightColor={highlightColor}
                  highlightAttributes={highlightAttributes}
                />
              ) : (
                <span style={{ fg: titleColor }}>{row.title}</span>
              )}
              {row.context ? (
                <>
                  <span style={{ fg: contextColor }}>{row.spacer}</span>
                  {!item.isSession && isSearching && hasDescMatch ? (
                    <HighlightedText
                      text={row.context}
                      matchIndices={descMatchIndices}
                      color={contextColor}
                      highlightColor={highlightColor}
                      highlightAttributes={highlightAttributes}
                    />
                  ) : (
                    <span style={{ fg: contextColor }}>{row.context}</span>
                  )}
                </>
              ) : null}
            </text>

            <text
              style={{
                fg: rowForeground(theme, selected, isMarked ? theme.danger : theme.textSubtle),
                wrapMode: 'none',
              }}
            >
              {meta}
            </text>
          </box>
        )
      })}
    </>
  )
}
