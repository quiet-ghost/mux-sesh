import { useTheme } from '../styles/theme'
import type { IconConfig, Item } from '../types'
import { getSessionSection } from '../items/order'
import { getItemKey } from '../multiplexer/items'
import HighlightedText from './HighlightedText'
import { formatSectionHeader, getItemIconPresentation } from './item-icon'
import type { VisibleWindow } from './list-window'
import { fitListRow, getTitleColumnWidth } from './session-viewport'
import {
  markedMeta,
  rowBackground,
  rowForeground,
  rowGutter,
  rowMarker,
  SELECTED_MATCH_ATTRIBUTES,
} from './row-mark'
import { getSessionMeta } from './session-meta'

interface Props {
  items: Item[]
  window: VisibleWindow<Item>
  cursor: number
  active: boolean
  width: number
  emptyLabel: string
  searchQuery?: string
  icons?: IconConfig
  marked?: ReadonlyMap<string, Item>
}

function getSessionContext(item: Item): string {
  return item.isSession && item.desc ? item.desc : ''
}

export default function SessionList({
  items,
  window,
  cursor,
  active,
  width,
  emptyLabel,
  searchQuery = '',
  icons,
  marked,
}: Props) {
  const theme = useTheme()
  const isSearching = searchQuery.trim().length > 0
  const titleColumn = getTitleColumnWidth(items, getSessionContext)

  if (items.length === 0) {
    return <text style={{ fg: theme.textMuted, wrapMode: 'none' }}>{emptyLabel}</text>
  }

  return (
    <>
      {window.items.map((item, i) => {
        const absoluteIndex = window.startIndex + i
        const matchIndices = item.searchMatch?.titleIndices
        const icon = getItemIconPresentation(theme, item, icons)
        const currentSection = getSessionSection(item)
        const previousItem = window.items[i - 1]

        const showSectionHeader =
          !previousItem || currentSection !== getSessionSection(previousItem)

        const sectionHeader = formatSectionHeader(theme, currentSection, icons, item.backend)
        const isMarked = marked?.has(getItemKey(item)) ?? false
        const selected = active && absoluteIndex === cursor
        const meta = markedMeta(isMarked, getSessionMeta(item))

        const iconText = icon.glyph ? ` ${icon.glyph}` : ''
        const prefixWidth = 4 + iconText.length
        const metaWidth = meta ? meta.length + 1 : 0

        const row = fitListRow(
          item.title,
          getSessionContext(item),
          width - prefixWidth - metaWidth,
          titleColumn
        )

        return (
          <box
            key={item.isSession ? getItemKey(item) : `${getItemKey(item)}:${item.path}`}
            style={{ flexDirection: 'column', flexShrink: 0 }}
          >
            {showSectionHeader && (
              <text style={{ fg: theme.textSubtle, marginTop: i === 0 ? 0 : 1, wrapMode: 'none' }}>
                <span style={{ fg: sectionHeader.color }}>{sectionHeader.text}</span>
              </text>
            )}

            <box
              style={{
                flexDirection: 'row',
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
                <span style={{ fg: rowForeground(theme, selected, icon.color) }}>{iconText}</span>{' '}
                {isSearching && matchIndices && matchIndices.length > 0 ? (
                  <HighlightedText
                    text={row.title}
                    matchIndices={matchIndices}
                    color={rowForeground(theme, selected, theme.text)}
                    highlightColor={selected ? theme.selectionText : undefined}
                    highlightAttributes={selected ? SELECTED_MATCH_ATTRIBUTES : undefined}
                  />
                ) : (
                  <span style={{ fg: rowForeground(theme, selected, theme.text) }}>
                    {row.title}
                  </span>
                )}
                {row.context ? (
                  <span style={{ fg: rowForeground(theme, selected, theme.textSubtle) }}>
                    {`${row.spacer}${row.context}`}
                  </span>
                ) : null}
              </text>

              <text
                style={{
                  wrapMode: 'none',
                  fg: rowForeground(
                    theme,
                    selected,
                    isMarked
                      ? theme.danger
                      : item.agentStatus === 'blocked'
                        ? theme.danger
                        : item.agentStatus === 'working'
                          ? theme.active
                          : theme.textSubtle
                  ),
                }}
              >
                {meta}
              </text>
            </box>
          </box>
        )
      })}
    </>
  )
}
