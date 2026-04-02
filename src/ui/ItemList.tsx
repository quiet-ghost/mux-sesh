import { useTheme } from '../styles/theme'
import { AppMode, type IconConfig } from '../types'
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
  icons?: IconConfig
  pendingKillSessionName?: string | null
}

export default function ItemList({
  items,
  cursor,
  appMode,
  maxItems = 20,
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
        const sessionStatusLabel = item.linkedSessionName ? 'attach' : 'create'
        const linkedSessionLabel = item.linkedSessionName ? ` -> ${item.linkedSessionName}` : ''
        const pendingKill = item.isSession && item.title === pendingKillSessionName
        const selected = absoluteIndex === cursor

        return (
          <box
            key={i}
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
            <text>
              <span style={{ fg: selected ? theme.primary : theme.textSubtle }}>
                {selected ? '› ' : '  '}
              </span>
              {item.isSession ? (
                <>
                  <span style={{ fg: item.isAttached ? theme.active : theme.inactive }}>
                    {item.isAttached ? '●' : '○'}
                  </span>{' '}
                  {isSearching && hasTitleMatch ? (
                    <HighlightedText text={item.title} matchIndices={titleMatchIndices} />
                  ) : (
                    <span style={{ fg: theme.text }}>{item.title}</span>
                  )}
                  {item.desc ? (
                    <span style={{ fg: theme.textSubtle }}>{`  ${item.desc}`}</span>
                  ) : null}
                </>
              ) : (
                <>
                  <span style={{ fg: icon.color }}>{icon.glyph}</span>{' '}
                  {isSearching && hasTitleMatch ? (
                    <HighlightedText text={item.title} matchIndices={titleMatchIndices} />
                  ) : (
                    <span style={{ fg: theme.text }}>{item.title}</span>
                  )}
                  {item.desc ? (
                    <>
                      <span style={{ fg: theme.textSubtle }}>{'  '}</span>
                      {isSearching && hasDescMatch ? (
                        <HighlightedText text={item.desc} matchIndices={descMatchIndices} />
                      ) : (
                        <span style={{ fg: theme.textSubtle }}>{item.desc}</span>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </text>

            <text style={{ fg: pendingKill ? theme.danger : theme.textSubtle }}>
              {item.isSession
                ? pendingKill
                  ? 'press d again to kill'
                  : `(${item.windowCount})`
                : appMode === AppMode.NewSession
                  ? `${sessionStatusLabel}${linkedSessionLabel}`
                  : ''}
            </text>
          </box>
        )
      })}
    </>
  )
}
