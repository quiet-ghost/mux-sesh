import { useTheme } from '../styles/theme'
import type { IconConfig, Item } from '../types'
import { formatSectionHeader } from './item-icon'
import { getItemKey } from '../multiplexer/items'
import {
  CLOSING_META,
  markedMeta,
  rowBackground,
  rowForeground,
  rowHighlight,
  rowMarker,
} from './row-mark'
import { getSessionMeta } from './session-meta'
import type { VisibleWindow } from './list-window'
import { fitListRow, getTitleColumnWidth } from './session-viewport'

interface Props {
  sessions: Item[]
  window: VisibleWindow<Item>
  cursor: number
  active: boolean
  width: number
  icons?: IconConfig
  marked?: ReadonlyMap<string, Item>
  // The item key whose close waits for a second key, if any.
  closingKey: string | undefined
}

const AGENT_ROW_PREFIX_COLUMNS = 3

function getAgentContext(item: Item): string {
  return item.workspaceTitle ?? item.desc
}

export default function AgentSessionGroup({
  sessions,
  window,
  cursor,
  active,
  width,
  icons,
  marked,
  closingKey,
}: Props) {
  const theme = useTheme()
  const header = formatSectionHeader(theme, 'agents', icons)
  const titleColumn = getTitleColumnWidth(sessions, getAgentContext)

  return (
    <>
      <text style={{ fg: theme.textSubtle, marginTop: 1, flexShrink: 0, wrapMode: 'none' }}>
        <span style={{ fg: header.color }}>{header.text}</span>
      </text>
      {sessions.length === 0 ? (
        <text style={{ fg: theme.textMuted, wrapMode: 'none' }}>No agent sessions</text>
      ) : null}
      {window.items.map((item, i) => {
        const absoluteIndex = window.startIndex + i
        const isMarked = marked?.has(getItemKey(item)) ?? false
        const closing = getItemKey(item) === closingKey
        const highlight = rowHighlight(active && absoluteIndex === cursor, closing)
        const selected = highlight === 'selected'
        const meta = closing ? CLOSING_META : markedMeta(isMarked, getSessionMeta(item))

        const metaWidth = meta ? meta.length + 1 : 0

        const row = fitListRow(
          item.title,
          getAgentContext(item),
          width - AGENT_ROW_PREFIX_COLUMNS - metaWidth,
          titleColumn
        )

        return (
          <box
            key={getItemKey(item)}
            style={{
              flexDirection: 'row',
              flexShrink: 0,
              justifyContent: 'space-between',
              backgroundColor: rowBackground(theme, highlight, isMarked),
              paddingRight: 1,
            }}
          >
            <text style={{ wrapMode: 'none' }}>
              <span style={{ fg: rowForeground(theme, selected, theme.danger) }}>
                {rowMarker(isMarked)}
              </span>
              <span
                style={{
                  fg: rowForeground(
                    theme,
                    selected,
                    item.isAttached ? theme.active : theme.inactive
                  ),
                }}
              >
                {item.isAttached ? '●' : '○'}
              </span>{' '}
              <span style={{ fg: rowForeground(theme, selected, theme.text) }}>{row.title}</span>
              {row.context ? (
                <span style={{ fg: rowForeground(theme, selected, theme.textSubtle) }}>
                  {`${row.spacer}${row.context}`}
                </span>
              ) : null}
            </text>

            <text
              style={{
                wrapMode: 'none',
                fg: rowForeground(
                  theme,
                  selected,
                  closing || isMarked
                    ? theme.danger
                    : item.agentStatus === 'blocked'
                      ? theme.danger
                      : item.agentStatus === 'working'
                        ? theme.active
                        : theme.textSubtle
                ),
              }}
            >
              {meta}
            </text>
          </box>
        )
      })}
    </>
  )
}
