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

        return (
          <box
            key={i}
            style={{
              backgroundColor: pendingKill
                ? theme.dangerSurface
                : absoluteIndex === cursor
                  ? theme.surfaceAlt
                  : 'transparent',
              height: 1,
              paddingLeft: 2,
            }}
          >
            {absoluteIndex === cursor && <text> </text>}
            <text>
              {absoluteIndex + 1}{' '}
              {item.isSession ? (
                <>
                  <span style={{ fg: item.isAttached ? theme.active : theme.inactive }}>
                    {item.isAttached ? '●' : '○'}
                  </span>{' '}
                  {isSearching && hasTitleMatch ? (
                    <HighlightedText text={item.title} matchIndices={titleMatchIndices} />
                  ) : (
                    item.title
                  )}{' '}
                  <span style={{ fg: pendingKill ? theme.danger : theme.inactive }}>
                    {pendingKill ? 'press d again to kill' : `(${item.windowCount})`}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fg: icon.color }}>{icon.glyph}</span>{' '}
                  {appMode === AppMode.NewSession ? (
                    <>
                      {isSearching && hasDescMatch ? (
                        <HighlightedText text={item.desc} matchIndices={descMatchIndices} />
                      ) : (
                        item.desc
                      )}{' '}
                      <span style={{ fg: theme.inactive }}>{sessionStatusLabel}</span>
                      {linkedSessionLabel && <span style={{ fg: theme.separator }}>{linkedSessionLabel}</span>}
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
                          <span style={{ fg: theme.inactive }}>{item.desc}</span>
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
