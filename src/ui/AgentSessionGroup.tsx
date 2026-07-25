import { useTheme } from '../styles/theme'
import type { IconConfig, Item, AppMode } from '../types'
import { AppMode as AppModeEnum } from '../types'
import { formatSectionHeader } from './item-icon'
import { getItemKey } from '../multiplexer/items'
import { getSessionMeta } from './session-meta'
import { getVisibleWindow } from './list-window'

interface Props {
  sessions: Item[]
  appMode: AppMode
  cursor: number
  maxItems?: number
  icons?: IconConfig
  pendingKillSessionName?: string | null
}

export default function AgentSessionGroup({
  sessions,
  appMode,
  cursor,
  maxItems = 20,
  icons,
  pendingKillSessionName,
}: Props) {
  const theme = useTheme()
  if (sessions.length === 0) return null

  const header = formatSectionHeader(theme, 'agents', icons)
  const visibleWindow = getVisibleWindow(sessions, cursor, maxItems)

  return (
    <>
      <text style={{ fg: theme.textSubtle, marginTop: 2, marginBottom: 1 }}>
        <span style={{ fg: header.color }}>{header.text}</span>
      </text>
      {visibleWindow.items.map((item, i) => {
        const absoluteIndex = visibleWindow.startIndex + i
        const pendingKill = getItemKey(item) === pendingKillSessionName
        const selected = appMode === AppModeEnum.AgentsManage && absoluteIndex === cursor
        const itemMeta = getSessionMeta(item)

        return (
          <box
            key={getItemKey(item)}
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
              <span
                style={{
                  fg: item.isAttached ? theme.active : theme.inactive,
                }}
              >
                {item.isAttached ? '●' : '○'}
              </span>{' '}
              <span style={{ fg: theme.text }}>{item.title}</span>
            </text>

            <text
              style={{
                fg: pendingKill
                  ? theme.danger
                  : item.agentStatus === 'blocked'
                    ? theme.danger
                    : item.agentStatus === 'working'
                      ? theme.active
                      : theme.textSubtle,
              }}
            >
              {pendingKill
                ? `press d again to ${item.itemKind === 'herdr' ? 'close' : 'kill'}`
                : itemMeta}
            </text>
          </box>
        )
      })}
      <box style={{ marginBottom: 1 }} />
    </>
  )
}
