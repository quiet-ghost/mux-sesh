import { useTheme } from '../styles/theme'
import type { IconConfig, Item } from '../types'
import { getSessionSection } from '../items/order'
import { getItemKey } from '../multiplexer/items'
import { formatSectionHeader } from './item-icon'
import ItemRow from './ItemRow'
import type { VisibleWindow } from './list-window'
import { getTitleColumnWidth } from './session-viewport'
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
  // The item key whose close waits for a second key, if any.
  closingKey: string | undefined
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
  closingKey,
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
        const currentSection = getSessionSection(item)
        const previousItem = window.items[i - 1]

        const showSectionHeader =
          !previousItem || currentSection !== getSessionSection(previousItem)

        const sectionHeader = formatSectionHeader(theme, currentSection, icons, item.backend)

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

            <ItemRow
              item={item}
              selected={active && absoluteIndex === cursor}
              marked={marked?.has(getItemKey(item)) ?? false}
              closing={getItemKey(item) === closingKey}
              width={width}
              titleColumn={titleColumn}
              context={getSessionContext(item)}
              meta={getSessionMeta(item)}
              searching={isSearching}
              icons={icons}
            />
          </box>
        )
      })}
    </>
  )
}
