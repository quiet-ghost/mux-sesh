import { colors } from '../styles/theme'
import { AppMode } from '../types'
import HighlightedText from './HighlightedText'
import type { Item } from '../types'

interface Props {
  items: Item[]
  cursor: number
  appMode: AppMode
  maxItems?: number
  searchQuery?: string
}

export default function ItemList({
  items,
  cursor,
  appMode,
  maxItems = 20,
  searchQuery = '',
}: Props) {
  const isSearching = searchQuery.trim().length > 0

  return (
    <>
      {items.slice(0, maxItems).map((item, i) => {
        const titleMatchIndices = (item as any).titleMatchIndices as number[] | undefined
        const descMatchIndices = (item as any).descMatchIndices as number[] | undefined
        const hasTitleMatch = titleMatchIndices && titleMatchIndices.length > 0
        const hasDescMatch = descMatchIndices && descMatchIndices.length > 0

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
              {item.isSession ? (
                <>
                  <span
                    style={{
                      fg: item.isAttached ? colors.active : colors.inactive,
                    }}
                  >
                    {item.isAttached ? '●' : '○'}
                  </span>{' '}
                  {isSearching && hasTitleMatch ? (
                    <HighlightedText text={item.title} matchIndices={titleMatchIndices} />
                  ) : (
                    item.title
                  )}{' '}
                  <span style={{ fg: colors.inactive }}>({item.windowCount})</span>
                </>
              ) : (
                <>
                  {appMode === AppMode.NewSession ? (
                    <>
                      {/* Show path (desc) with highlighting if it matches */}
                      {isSearching && hasDescMatch ? (
                        <HighlightedText text={item.desc} matchIndices={descMatchIndices} />
                      ) : (
                        item.desc
                      )}
                    </>
                  ) : (
                    <>
                      {isSearching && hasTitleMatch ? (
                        <HighlightedText text={item.title} matchIndices={titleMatchIndices} />
                      ) : (
                        item.title
                      )}
                      {item.desc && (
                        <>
                          {' '}
                          <span style={{ fg: colors.inactive }}>{item.desc}</span>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </text>
          </box>
        )
      })}
    </>
  )
}
