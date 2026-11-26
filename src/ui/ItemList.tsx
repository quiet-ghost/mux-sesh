import { useTheme } from '../styles/theme'
import { AppMode, type IconConfig } from '../types'
import HighlightedText from './HighlightedText'
import { getItemIconPresentation } from './item-icon'
import { getVisibleWindow } from './list-window'
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
  icons?: IconConfig
  pendingKillSessionName?: string | null
}

const SESSION_ROW_PREFIX_COLUMNS = 4

export default function ItemList({
  items,
  cursor,
  appMode,
  maxItems,
  width,
  searchQuery = '',
  icons,
  pendingKillSessionName,
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

        const sessionStatusLabel = item.linkedSessionName
          ? 'attach'
          : item.itemKind === 'file'
            ? 'open'
            : 'create'

        const linkedSessionLabel = item.linkedSessionName ? ` -> ${item.linkedSessionName}` : ''
        const pendingKill = item.isSession && getItemKey(item) === pendingKillSessionName
        const selected = absoluteIndex === cursor

        const meta = item.isSession
          ? pendingKill
            ? 'press d again to kill'
            : `(${item.windowCount})`
          : appMode === AppMode.NewSession
            ? `${sessionStatusLabel}${linkedSessionLabel}`
            : ''

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
              backgroundColor: pendingKill
                ? theme.dangerSurface
                : selected
                  ? theme.surfaceAlt
                  : 'transparent',
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text style={{ wrapMode: 'none' }}>
              <span style={{ fg: selected ? theme.primary : theme.textSubtle }}>
                {selected ? '› ' : '  '}
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

            <text style={{ fg: pendingKill ? theme.danger : theme.textSubtle, wrapMode: 'none' }}>
              {meta}
            </text>
          </box>
        )
      })}
    </>
  )
}
