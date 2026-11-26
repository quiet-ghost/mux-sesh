import { useTheme } from '../styles/theme'
import type { IconConfig, Item } from '../types'
import { getSessionSection } from '../items/order'
import { getItemKey } from '../multiplexer/items'
import HighlightedText from './HighlightedText'
import { formatSectionHeader, getItemIconPresentation } from './item-icon'
import type { VisibleWindow } from './list-window'
import { fitListRow, getTitleColumnWidth } from './session-viewport'
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
  pendingKillSessionName?: string | null
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
  pendingKillSessionName,
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
        const pendingKill = getItemKey(item) === pendingKillSessionName
        const selected = active && absoluteIndex === cursor

        const meta = pendingKill
          ? `press d again to ${item.itemKind === 'herdr' ? 'close' : 'kill'}`
          : getSessionMeta(item)

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
                <span style={{ fg: item.isAttached ? theme.active : theme.inactive }}>
                  {item.isAttached ? '●' : '○'}
                </span>
                <span style={{ fg: icon.color }}>{iconText}</span>{' '}
                {isSearching && matchIndices && matchIndices.length > 0 ? (
                  <HighlightedText text={row.title} matchIndices={matchIndices} />
                ) : (
                  <span style={{ fg: theme.text }}>{row.title}</span>
                )}
                {row.context ? (
                  <span style={{ fg: theme.textSubtle }}>{`${row.spacer}${row.context}`}</span>
                ) : null}
              </text>

              <text
                style={{
                  wrapMode: 'none',
                  fg: pendingKill
                    ? theme.danger
                    : item.agentStatus === 'blocked'
                      ? theme.danger
                      : item.agentStatus === 'working'
                        ? theme.active
                        : theme.textSubtle,
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
