import { colors } from '../styles/theme'
import { formatSessionAge } from '../util/time'
import HighlightedText from './HighlightedText'
import type { Item } from '../types'

interface Props {
  items: Item[]
  cursor: number
  maxItems?: number
  searchQuery?: string
}

export default function SessionList({ items, cursor, maxItems = 20, searchQuery = '' }: Props) {
  const isSearching = searchQuery.trim().length > 0

  return (
    <>
      {items.slice(0, maxItems).map((item, i) => {
        const matchIndices = (item as any).titleMatchIndices as number[] | undefined
        const titlePadded = item.title.padEnd(20)
        const sessionAge = item.createdAt ? formatSessionAge(item.createdAt) : ''

        return (
          <box
            key={i}
            style={{
              backgroundColor: i === cursor ? colors.backgroundAlt : 'transparent',
              height: 1,
              paddingLeft: 2,
            }}
          >
            {i === cursor && <text> </text>}
            <text>
              {i + 1}{' '}
              <span
                style={{
                  fg: item.isAttached ? colors.active : colors.inactive,
                }}
              >
                {item.isAttached ? '●' : '○'}
              </span>{' '}
              {isSearching && matchIndices && matchIndices.length > 0 ? (
                <>
                  <HighlightedText text={item.title} matchIndices={matchIndices} />
                  {' '.repeat(20 - item.title.length)}
                </>
              ) : (
                titlePadded
              )}
              {' '}
              <span style={{ fg: colors.inactive }}>{sessionAge}</span>
            </text>
          </box>
        )
      })}
    </>
  )
}
