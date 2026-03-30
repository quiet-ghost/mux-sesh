import type { TextareaRenderable } from '@opentui/core'
import { useEffect } from 'react'
import { useTheme } from '../styles/theme'
import { AppMode, type Item, type KeybindMode } from '../types'
import Modal from './Modal'

export type CommandId =
  | 'search'
  | 'new-session'
  | 'open-settings'
  | 'view-projects'
  | 'view-sessions'
  | 'rename-session'
  | 'kill-session'
  | 'last-session'
  | 'root-session'
  | 'edit-target'
  | 'open-opencode'
  | 'refresh'
  | 'back'

export interface CommandEntry {
  id: CommandId
  category: string
  title: string
  keybind: string
}

interface Props {
  columns: number
  themeId: string
  entries: CommandEntry[]
  cursor: number
  searchQuery: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

function prefixed(prefixKey: string | undefined, suffix: string): string {
  return `${prefixKey ?? 'ctrl+x'} ${suffix}`
}

export function getCommandEntries(
  appMode: AppMode,
  keybindMode: KeybindMode = 'vim',
  prefixKey: string | undefined,
  selectedItem?: Item
): CommandEntry[] {
  const commandKey = (suffix: string, fallback: string) => (prefixKey ? prefixed(prefixKey, suffix) : fallback)

  if (appMode === AppMode.OpencodeManage) {
    return [
      { id: 'back', category: 'Suggested', title: 'Back', keybind: 'esc' },
      { id: 'rename-session', category: 'Session', title: 'Rename session', keybind: commandKey('r', 'r') },
      { id: 'kill-session', category: 'Session', title: 'Kill session', keybind: commandKey('d', 'd') },
      { id: 'open-settings', category: 'Settings', title: 'Open settings', keybind: commandKey('s', ',') },
    ]
  }

  return [
    { id: 'search', category: 'Suggested', title: 'Search', keybind: 'i' },
    { id: 'new-session', category: 'Suggested', title: 'New session', keybind: 'n' },
    { id: 'open-opencode', category: 'Suggested', title: 'Open OpenCode sessions', keybind: 'o' },
    { id: 'open-settings', category: 'Suggested', title: 'Open settings', keybind: 'ctrl+p' },
    { id: 'view-projects', category: 'View', title: 'Show projects', keybind: commandKey('p', 'p') },
    { id: 'view-sessions', category: 'View', title: 'Show sessions', keybind: commandKey('s', 's') },
    { id: 'rename-session', category: 'Session', title: 'Rename session', keybind: commandKey('r', 'r') },
    { id: 'kill-session', category: 'Session', title: 'Kill session', keybind: commandKey('d', 'd') },
    { id: 'last-session', category: 'Session', title: 'Last session', keybind: commandKey('l', 'l') },
    { id: 'root-session', category: 'Session', title: 'Root session', keybind: commandKey('g', 'g') },
    ...(selectedItem?.itemKind === 'configured'
      ? [{ id: 'edit-target' as const, category: 'Project', title: 'Edit target', keybind: commandKey('e', 'e') }]
      : []),
    { id: 'refresh', category: 'App', title: 'Refresh', keybind: commandKey('shift+r', 'R') },
  ]
}

export function filterCommandEntries(entries: CommandEntry[], query: string): CommandEntry[] {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return entries
  }

  return entries.filter(entry => {
    const haystack = `${entry.category} ${entry.title} ${entry.keybind}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })
}

export default function CommandsModal({
  columns,
  themeId,
  entries,
  cursor,
  searchQuery,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()

  useEffect(() => {
    queueMicrotask(() => {
      textareaRef.current?.focus()
    })
  }, [textareaRef])

  return (
    <Modal title='Commands' description={themeId} footer='↑/↓ navigate  enter run  esc close' columns={columns} preferredWidth={68}>
      <box style={{ backgroundColor: theme.surfaceAlt, paddingLeft: 1, paddingRight: 1, marginBottom: 1 }}>
        <textarea ref={textareaRef} initialValue={searchQuery} onContentChange={onContentChange} focused placeholder='Search' />
      </box>

      <box style={{ flexDirection: 'column' }}>
        {entries.length === 0 ? (
          <text style={{ fg: theme.textMuted }}>No commands found</text>
        ) : (
          entries.map((row, index) => {
            const showCategory = index === 0 || entries[index - 1]?.category !== row.category
            const selected = index === cursor

            return (
              <box key={`${row.category}:${row.id}`} style={{ flexDirection: 'column' }}>
                {showCategory && <text style={{ fg: theme.accent, marginTop: index === 0 ? 0 : 1 }}>{row.category}</text>}
                <box
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    backgroundColor: selected ? theme.selection : 'transparent',
                    paddingLeft: 1,
                    paddingRight: 1,
                  }}
                >
                  <text style={{ fg: selected ? theme.selectionText : theme.text }}>{row.title}</text>
                  <text style={{ fg: selected ? theme.selectionText : theme.textMuted }}>{row.keybind}</text>
                </box>
              </box>
            )
          })
        )}
      </box>
    </Modal>
  )
}
