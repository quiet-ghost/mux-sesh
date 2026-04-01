import { useTheme } from '../styles/theme'
import { formatSessionAge } from '../util/time'
import type { IconConfig, Item } from '../types'
import { getSessionSection } from '../items/order'
import HighlightedText from './HighlightedText'
import { formatSectionHeader, getItemIconPresentation } from './item-icon'
import { getVisibleWindow } from './list-window'
import { getMutedLabelColumnWidth, getMutedLabelSpacer } from './text-columns'

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
  const mutedLabelColumnWidth = getMutedLabelColumnWidth(items)

  return (
    <>
      {visibleWindow.items.map((item, i) => {
        const absoluteIndex = visibleWindow.startIndex + i
        const matchIndices = item.searchMatch?.titleIndices
        const itemMeta = item.isSession && item.createdAt ? formatSessionAge(item.createdAt) : ''
        const icon = getItemIconPresentation(theme, item, icons)
        const currentSection = getSessionSection(item)
        const previousItem = absoluteIndex > 0 ? items[absoluteIndex - 1] : undefined
        const previousSection = previousItem ? getSessionSection(previousItem) : undefined
        const showSectionHeader = i === 0 || currentSection !== previousSection
        const sectionHeader = formatSectionHeader(theme, currentSection, icons)
        const pendingKill = item.title === pendingKillSessionName
        const selected = absoluteIndex === cursor
        const mutedLabelSpacer = item.isSession && item.desc ? getMutedLabelSpacer(item.title, mutedLabelColumnWidth) : ''

        return (
          <box key={i} style={{ flexDirection: 'column' }}>
            {showSectionHeader && (
              <text style={{ fg: theme.textSubtle, marginTop: absoluteIndex === 0 ? 0 : 1, marginBottom: 1 }}>
                <span style={{ fg: sectionHeader.color }}>{sectionHeader.text}</span>
              </text>
            )}

            <box
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                backgroundColor: pendingKill ? theme.dangerSurface : selected ? theme.surfaceAlt : 'transparent',
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <text>
                <span style={{ fg: selected ? theme.primary : theme.textSubtle }}>{selected ? '› ' : '  '}</span>
                <span style={{ fg: item.isAttached ? theme.active : theme.inactive }}>{item.isAttached ? '●' : '○'}</span>
                <span style={{ fg: icon.color }}>{icon.glyph ? ` ${icon.glyph}` : ''}</span>{' '}
                {isSearching && matchIndices && matchIndices.length > 0 ? (
                  <HighlightedText text={item.title} matchIndices={matchIndices} />
                ) : (
                  <span style={{ fg: theme.text }}>{item.title}</span>
                )}
                {item.isSession && item.desc ? <span style={{ fg: theme.textSubtle }}>{`${mutedLabelSpacer}${item.desc}`}</span> : null}
              </text>

              <text style={{ fg: pendingKill ? theme.danger : theme.textSubtle }}>
                {pendingKill ? 'press d again to kill' : itemMeta}
              </text>
            </box>
          </box>
        )
      })}
    </>
  )
}
