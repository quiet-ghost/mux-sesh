import { colors } from '../styles/theme'
import { AppMode } from '../types'
import HighlightedText from './HighlightedText'
import { getItemIconPresentation } from './item-icon'
import { getVisibleWindow } from './list-window'
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
  const visibleWindow = getVisibleWindow(items, cursor, maxItems)

  return (
    <>
      {visibleWindow.items.map((item, i) => {
        const absoluteIndex = visibleWindow.startIndex + i
        const titleMatchIndices = item.searchMatch?.titleIndices
        const descMatchIndices = item.searchMatch?.descIndices
        const hasTitleMatch = titleMatchIndices && titleMatchIndices.length > 0
        const hasDescMatch = descMatchIndices && descMatchIndices.length > 0
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
                  {isSearching && hasTitleMatch ? (
                    <HighlightedText text={item.title} matchIndices={titleMatchIndices} />
                  ) : (
                    item.title
                  )}{' '}
                  <span style={{ fg: colors.inactive }}>({item.windowCount})</span>
                </>
              ) : (
                <>
                  <span style={{ fg: icon.color }}>{icon.glyph}</span>{' '}
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
