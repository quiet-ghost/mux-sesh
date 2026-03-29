import { colors } from '../styles/theme'
import { formatSessionAge } from '../util/time'
import HighlightedText from './HighlightedText'
import { getItemIconPresentation } from './item-icon'
import { getVisibleWindow } from './list-window'
import type { Item } from '../types'

interface Props {
  items: Item[]
  cursor: number
  maxItems?: number
  searchQuery?: string
}

export default function SessionList({ items, cursor, maxItems = 20, searchQuery = '' }: Props) {
  const isSearching = searchQuery.trim().length > 0
  const visibleWindow = getVisibleWindow(items, cursor, maxItems)

  return (
    <>
      {visibleWindow.items.map((item, i) => {
        const absoluteIndex = visibleWindow.startIndex + i
        const matchIndices = item.searchMatch?.titleIndices
        const titlePadded = item.title.padEnd(20)
        const itemMeta = item.isSession
          ? item.createdAt
            ? formatSessionAge(item.createdAt)
            : ''
          : item.desc
        const icon = getItemIconPresentation(item)

        return (
          <box
            key={i}
            style={{
              backgroundColor: absoluteIndex === cursor ? colors.backgroundAlt : 'transparent',
              height: 1,
              paddingLeft: 2,
            }}
          >
            {absoluteIndex === cursor && <text> </text>}
            <text>
              {absoluteIndex + 1}{' '}
              {item.isSession ? (
                <>
                  <span style={{ fg: item.isAttached ? colors.active : colors.inactive }}>
                    {item.isAttached ? '●' : '○'}
                  </span>{' '}
                  {isSearching && matchIndices && matchIndices.length > 0 ? (
                    <>
                      <HighlightedText text={item.title} matchIndices={matchIndices} />
                      {' '.repeat(20 - item.title.length)}
                    </>
                  ) : (
                    titlePadded
                  )}{' '}
                </>
              ) : (
                <>
                  <span style={{ fg: icon.color }}>{icon.glyph}</span>{' '}
                  {isSearching && matchIndices && matchIndices.length > 0 ? (
                    <>
                      <HighlightedText text={item.title} matchIndices={matchIndices} />
                      {' '.repeat(20 - item.title.length)}
                    </>
                  ) : (
                    titlePadded
                  )}{' '}
                </>
              )}
              <span style={{ fg: colors.inactive }}>{itemMeta}</span>
            </text>
          </box>
        )
      })}
    </>
  )
}
