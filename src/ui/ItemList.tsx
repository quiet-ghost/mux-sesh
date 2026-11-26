import { useTheme } from '../styles/theme'
import { AppMode, type IconConfig } from '../types'
import HighlightedText from './HighlightedText'
import { getItemIconPresentation } from './item-icon'
import { getVisibleWindow } from './list-window'
import { markedMeta, rowMarker } from './row-mark'
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

        return (
          <box
            key={`${getItemKey(item)}:${item.path}`}
            style={{
              flexDirection: 'row',
              flexShrink: 0,
              justifyContent: 'space-between',
              backgroundColor: isMarked
                ? theme.dangerSurface
                : selected
                  ? theme.surfaceAlt
                  : 'transparent',
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text style={{ wrapMode: 'none' }}>
              <span style={{ fg: selected ? theme.primary : theme.danger }}>
                {rowMarker(selected, isMarked)}
              </span>
              {item.isSession ? (
                <>
                  <span style={{ fg: item.isAttached ? theme.active : theme.inactive }}>
                    {item.isAttached ? '●' : '○'}
                  </span>{' '}
                  {isSearching && hasTitleMatch ? (
                    <HighlightedText text={row.title} matchIndices={titleMatchIndices} />
                  ) : (
                    <span style={{ fg: theme.text }}>{row.title}</span>
                  )}
                  {row.context ? (
                    <span style={{ fg: theme.textSubtle }}>{`${row.spacer}${row.context}`}</span>
                  ) : null}
                </>
              ) : (
                <>
                  <span style={{ fg: icon.color }}>{icon.glyph}</span>{' '}
                  {isSearching && hasTitleMatch ? (
                    <HighlightedText text={row.title} matchIndices={titleMatchIndices} />
                  ) : (
                    <span style={{ fg: theme.text }}>{row.title}</span>
                  )}
                  {row.context ? (
                    <>
                      <span style={{ fg: theme.textSubtle }}>{row.spacer}</span>
                      {isSearching && hasDescMatch ? (
                        <HighlightedText text={row.context} matchIndices={descMatchIndices} />
                      ) : (
                        <span style={{ fg: theme.textSubtle }}>{row.context}</span>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </text>

            <text style={{ fg: isMarked ? theme.danger : theme.textSubtle, wrapMode: 'none' }}>
              {meta}
            </text>
          </box>
        )
      })}
    </>
  )
}
