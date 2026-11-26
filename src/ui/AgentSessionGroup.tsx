import { useTheme } from '../styles/theme'
import type { IconConfig, Item } from '../types'
import { formatSectionHeader } from './item-icon'
import { getItemKey } from '../multiplexer/items'
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
  pendingKillSessionName?: string | null
}

const AGENT_ROW_PREFIX_COLUMNS = 4

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
  pendingKillSessionName,
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
        const pendingKill = getItemKey(item) === pendingKillSessionName
        const selected = active && absoluteIndex === cursor

        const meta = pendingKill
          ? `press d again to ${item.itemKind === 'herdr' ? 'close' : 'kill'}`
          : getSessionMeta(item)

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
              backgroundColor: pendingKill
                ? theme.dangerSurface
                : selected
                  ? theme.surfaceAlt
                  : 'transparent',
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text style={{ wrapMode: 'none' }}>
              <span style={{ fg: selected ? theme.primary : theme.textSubtle }}>
                {selected ? '› ' : '  '}
              </span>
              <span style={{ fg: item.isAttached ? theme.active : theme.inactive }}>
                {item.isAttached ? '●' : '○'}
              </span>{' '}
              <span style={{ fg: theme.text }}>{row.title}</span>
              {row.context ? (
                <span style={{ fg: theme.textSubtle }}>{`${row.spacer}${row.context}`}</span>
              ) : null}
            </text>

            <text
              style={{
                wrapMode: 'none',
                fg: pendingKill
                  ? theme.danger
                  : item.agentStatus === 'blocked'
                    ? theme.danger
                    : item.agentStatus === 'working'
                      ? theme.active
                      : theme.textSubtle,
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
