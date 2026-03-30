import { useTheme } from '../styles/theme'
import { formatSessionAge } from '../util/time'
import type { IconConfig, Item } from '../types'
import { getSessionSection } from '../items/order'
import HighlightedText from './HighlightedText'
import { formatSectionHeader, getItemIconPresentation } from './item-icon'
import { getVisibleWindow } from './list-window'

interface Props {
  items: Item[]
  cursor: number
  maxItems?: number
  searchQuery?: string
  icons?: IconConfig
  pendingKillSessionName?: string | null
}

export default function SessionList({
  items,
  cursor,
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
        const matchIndices = item.searchMatch?.titleIndices
        const titlePadded = item.title.padEnd(20)
        const itemMeta = item.isSession
          ? item.createdAt
            ? formatSessionAge(item.createdAt)
            : ''
          : item.desc
        const icon = getItemIconPresentation(theme, item, icons)
        const currentSection = getSessionSection(item)
        const previousItem = absoluteIndex > 0 ? items[absoluteIndex - 1] : undefined
        const previousSection = previousItem ? getSessionSection(previousItem) : undefined
        const showSectionHeader = i === 0 || currentSection !== previousSection
        const sectionHeader = formatSectionHeader(theme, currentSection, icons)
        const pendingKill = item.title === pendingKillSessionName

        return (
          <box key={i} style={{ flexDirection: 'column' }}>
            {showSectionHeader && (
              <text style={{ fg: theme.separator, marginTop: absoluteIndex === 0 ? 0 : 1, marginBottom: 1 }}>
                <span style={{ fg: sectionHeader.color }}>{sectionHeader.text}</span>
              </text>
            )}
            <box
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
                <span style={{ fg: pendingKill ? theme.danger : theme.inactive }}>
                  {pendingKill ? 'press d again to kill' : itemMeta}
                </span>
              </text>
            </box>
          </box>
        )
      })}
    </>
  )
}
