import { colors } from '../styles/theme'
import { formatSessionAge } from '../util/time'
import type { IconConfig, Item, AppMode } from '../types'
import { AppMode as AppModeEnum } from '../types'
import { formatSectionHeader } from './item-icon'

interface Props {
  sessions: Item[]
  appMode: AppMode
  cursor: number
  icons?: IconConfig
}

export default function OpencodeSessionGroup({ sessions, appMode, cursor, icons }: Props) {
  if (sessions.length === 0) return null

  const header = formatSectionHeader('opencode', icons)

  return (
    <>
      <text style={{ fg: colors.separator, marginTop: 2, marginBottom: 1 }}>
        <span style={{ fg: header.color }}>{header.text}</span>
      </text>
      {sessions.map((item, i) => {
        return (
          <box
            key={`opencode-${i}`}
            style={{
              height: 1,
              paddingLeft: 2,
              backgroundColor:
                appMode === AppModeEnum.OpencodeManage && i === cursor
                  ? colors.backgroundAlt
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
                        ? colors.active
                        : colors.inactive
                      : colors.inactive,
                }}
              >
                {item.isAttached ? '●' : '○'}
              </span>{' '}
              <span
                style={{
                  fg: appMode === AppModeEnum.OpencodeManage ? colors.text : colors.inactive,
                }}
              >
                {item.title.padEnd(20)}
              </span>{' '}
              <span style={{ fg: colors.inactive }}>
                {item.createdAt ? formatSessionAge(item.createdAt) : ''}
              </span>
            </text>
          </box>
        )
      })}
      <box style={{ marginBottom: 2 }} />
    </>
  )
}
