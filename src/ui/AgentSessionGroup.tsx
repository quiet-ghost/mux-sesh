import { useTheme } from '../styles/theme'
import { formatSessionAge } from '../util/time'
import type { IconConfig, Item, AppMode } from '../types'
import { AppMode as AppModeEnum } from '../types'
import { formatSectionHeader } from './item-icon'

interface Props {
  sessions: Item[]
  appMode: AppMode
  cursor: number
  icons?: IconConfig
  pendingKillSessionName?: string | null
}

export default function AgentSessionGroup({
  sessions,
  appMode,
  cursor,
  icons,
  pendingKillSessionName,
}: Props) {
  const theme = useTheme()
  if (sessions.length === 0) return null

  const header = formatSectionHeader(theme, 'agents', icons)

  return (
    <>
      <text style={{ fg: theme.textSubtle, marginTop: 2, marginBottom: 1 }}>
        <span style={{ fg: header.color }}>{header.text}</span>
      </text>
      {sessions.map((item, i) => {
        const pendingKill = item.title === pendingKillSessionName
        const selected = appMode === AppModeEnum.AgentsManage && i === cursor

        return (
          <box
            key={`agent-${i}`}
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

            <text style={{ fg: pendingKill ? theme.danger : theme.textSubtle }}>
              {pendingKill
                ? 'press d again to kill'
                : item.createdAt
                  ? formatSessionAge(item.createdAt)
                  : ''}
            </text>
          </box>
        )
      })}
      <box style={{ marginBottom: 1 }} />
    </>
  )
}
