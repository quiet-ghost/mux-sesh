import { useTheme } from '../styles/theme'
import { AppMode, type Item, type KeybindMode } from '../types'
import Modal from './Modal'

interface Props {
  appMode: AppMode
  keybindMode?: KeybindMode
  prefixKey?: string
  selectedItem?: Item
  columns: number
  themeId: string
}

interface CommandRow {
  category: string
  title: string
  keybind: string
  selected?: boolean
}

function prefixed(prefixKey: string | undefined, suffix: string): string {
  return `${prefixKey ?? 'ctrl+x'} ${suffix}`
}

function getCommandRows(appMode: AppMode, keybindMode: KeybindMode = 'vim', prefixKey: string | undefined, selectedItem?: Item): CommandRow[] {
  const commandKey = (suffix: string, fallback: string) => (prefixKey ? prefixed(prefixKey, suffix) : fallback)

  if (appMode === AppMode.OpencodeManage) {
    return [
      { category: 'Suggested', title: 'Back', keybind: 'esc', selected: true },
      { category: 'Session', title: 'Rename session', keybind: commandKey('r', 'r') },
      { category: 'Session', title: 'Kill session', keybind: commandKey('d', 'd') },
      { category: 'Settings', title: 'Open settings', keybind: commandKey('s', ',') },
    ]
  }

  return [
    { category: 'Suggested', title: 'Search', keybind: commandKey('i', 'i'), selected: true },
    { category: 'Suggested', title: 'New session', keybind: commandKey('n', 'n') },
    { category: 'Suggested', title: 'Open settings', keybind: commandKey('s', ',') },
    { category: 'Session', title: 'Rename session', keybind: commandKey('r', 'r') },
    { category: 'Session', title: 'Kill session', keybind: commandKey('d', 'd') },
    { category: 'Session', title: 'Last session', keybind: commandKey('l', 'l') },
    { category: 'Session', title: 'Root session', keybind: commandKey('g', 'g') },
    ...(selectedItem?.itemKind === 'configured'
      ? [{ category: 'Project', title: 'Edit target', keybind: commandKey('e', 'e') }]
      : []),
    { category: 'View', title: 'Open OpenCode sessions', keybind: commandKey('o', 'o') },
    { category: 'App', title: 'Refresh', keybind: commandKey('shift+r', 'R') },
  ]
}

export default function CommandsModal({ appMode, keybindMode, prefixKey, selectedItem, columns, themeId }: Props) {
  const theme = useTheme()
  const rows = getCommandRows(appMode, keybindMode, prefixKey, selectedItem)

  return (
    <Modal title='Commands' description={themeId} footer='Esc close' columns={columns} preferredWidth={68}>
      <box style={{ backgroundColor: theme.surfaceAlt, paddingLeft: 1, paddingRight: 1, marginBottom: 1 }}>
        <text style={{ fg: theme.textMuted }}>Search</text>
      </box>

      <box style={{ flexDirection: 'column' }}>
        {rows.map((row, index) => {
          const showCategory = index === 0 || rows[index - 1]?.category !== row.category

          return (
            <box key={`${row.category}:${row.title}`} style={{ flexDirection: 'column' }}>
              {showCategory && <text style={{ fg: theme.accent, marginTop: index === 0 ? 0 : 1 }}>{row.category}</text>}
              <box
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  backgroundColor: row.selected ? theme.selection : 'transparent',
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
              >
                <text style={{ fg: row.selected ? theme.selectionText : theme.text }}>{row.title}</text>
                <text style={{ fg: row.selected ? theme.selectionText : theme.textMuted }}>{row.keybind}</text>
              </box>
            </box>
          )
        })}
      </box>
    </Modal>
  )
}
