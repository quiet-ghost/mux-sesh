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

export default function OpencodeSessionGroup({ sessions, appMode, cursor, icons, pendingKillSessionName }: Props) {
  const theme = useTheme()
  if (sessions.length === 0) return null

  const header = formatSectionHeader(theme, 'opencode', icons)

  return (
    <>
      <text style={{ fg: theme.separator, marginTop: 2, marginBottom: 1 }}>
        <span style={{ fg: header.color }}>{header.text}</span>
      </text>
      {sessions.map((item, i) => {
        const pendingKill = item.title === pendingKillSessionName

        return (
          <box
            key={`opencode-${i}`}
            style={{
              height: 1,
              paddingLeft: 2,
              backgroundColor:
                pendingKill
                  ? theme.dangerSurface
                  : appMode === AppModeEnum.OpencodeManage && i === cursor
                    ? theme.surfaceAlt
                    : 'transparent',
            }}
          >
            {appMode === AppModeEnum.OpencodeManage && i === cursor && <text> </text>}
            <text>
              {appMode === AppModeEnum.OpencodeManage ? `${i + 1} ` : '  '}
              <span
                style={{
                  fg:
                    appMode === AppModeEnum.OpencodeManage
                      ? item.isAttached
                        ? theme.active
                        : theme.inactive
                      : theme.inactive,
                }}
              >
                {item.isAttached ? '●' : '○'}
              </span>{' '}
              <span
                style={{
                  fg: appMode === AppModeEnum.OpencodeManage ? theme.text : theme.inactive,
                }}
              >
                {item.title.padEnd(20)}
              </span>{' '}
              <span style={{ fg: pendingKill ? theme.danger : theme.inactive }}>
                {pendingKill ? 'press d again to kill' : item.createdAt ? formatSessionAge(item.createdAt) : ''}
              </span>
            </text>
          </box>
        )
      })}
      <box style={{ marginBottom: 2 }} />
    </>
  )
}
