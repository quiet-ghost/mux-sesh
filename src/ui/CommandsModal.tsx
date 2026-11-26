import type { TextareaRenderable } from '@opentui/core'
import { isHerdrAgentItem } from '../multiplexer/items'
import { useTheme } from '../styles/theme'
import { useTextareaFocus } from './use-textarea-focus'
import { AppMode, type Item, type KeybindMode } from '../types'
import {
  DIALOG_FILTER_ROWS,
  getDialogChromeRows,
  getDialogContentWidth,
  getDialogListRows,
  getDialogRowWidth,
  getDialogWidth,
  truncateDialogText,
} from './dialog-layout'
import { DialogFilter, DialogRow } from './DialogList'
import { getVisibleWindow } from './list-window'
import Modal from './Modal'

const COMMANDS_FOOTER = '↑/↓ navigate  enter run  esc close'
const COMMANDS_PREFERRED_WIDTH = 68

export type CommandId =
  | 'search'
  | 'new-session'
  | 'open-settings'
  | 'open-themes'
  | 'view-projects'
  | 'view-sessions'
  | 'rename-session'
  | 'kill-session'
  | 'toggle-pin-session'
  | 'last-session'
  | 'root-session'
  | 'edit-target'
  | 'open-agents'
  | 'refresh'
  | 'back'

export interface CommandEntry {
  id: CommandId
  category: string
  title: string
  keybind: string
  keywords?: string
}

type CommandRow =
  | { kind: 'gap'; key: string }
  | { kind: 'heading'; key: string; category: string }
  | { kind: 'entry'; key: string; entry: CommandEntry; index: number }

interface Props {
  columns: number
  rows: number
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
  const commandKey = (suffix: string, fallback: string) =>
    prefixKey ? prefixed(prefixKey, suffix) : fallback

  const prefixCategory = prefixKey ? `Prefix ${prefixKey}` : 'Prefix'

  if (appMode === AppMode.AgentsManage) {
    const canManageSession = !isHerdrAgentItem(selectedItem)

    return [
      { id: 'back', category: 'Direct', title: 'Back', keybind: 'esc' },
      ...(canManageSession
        ? [{ id: 'kill-session' as const, category: 'Direct', title: 'Kill session', keybind: 'd' }]
        : []),
      { id: 'open-settings', category: 'Direct', title: 'Settings', keybind: 'ctrl+p' },
      {
        id: 'open-themes',
        category: 'Direct',
        title: 'Themes',
        keybind: 'ctrl+p',
        keywords: 'theme color scheme appearance',
      },
      ...(canManageSession
        ? [
            {
              id: 'rename-session' as const,
              category: prefixCategory,
              title: 'Rename session',
              keybind: commandKey('r', 'r'),
            },
          ]
        : []),
    ]
  }

  return [
    { id: 'search', category: 'Direct', title: 'Search', keybind: 'i' },
    { id: 'new-session', category: 'Direct', title: 'New session', keybind: 'n' },
    { id: 'open-agents', category: 'Direct', title: 'Open agent sessions', keybind: 'o' },
    { id: 'kill-session', category: 'Direct', title: 'Kill session', keybind: 'd' },
    ...(selectedItem && (selectedItem.isSession || selectedItem.itemKind === 'configured')
      ? [
          {
            id: 'toggle-pin-session' as const,
            category: 'Direct',
            title: selectedItem.isPinned ? 'Unpin session' : 'Pin session',
            keybind: 'ctrl+f',
          },
        ]
      : []),
    { id: 'open-settings', category: 'Direct', title: 'Open settings', keybind: 'ctrl+p' },
    {
      id: 'open-themes',
      category: 'Direct',
      title: 'Themes',
      keybind: 'ctrl+p',
      keywords: 'theme color scheme appearance',
    },
    {
      id: 'view-projects',
      category: prefixCategory,
      title: 'Show projects',
      keybind: commandKey('p', 'p'),
    },
    {
      id: 'view-sessions',
      category: prefixCategory,
      title: 'Show sessions',
      keybind: commandKey('s', 's'),
    },
    {
      id: 'rename-session',
      category: prefixCategory,
      title: 'Rename session',
      keybind: commandKey('r', 'r'),
    },
    {
      id: 'last-session',
      category: prefixCategory,
      title: 'Last session',
      keybind: commandKey('l', 'l'),
    },
    {
      id: 'root-session',
      category: prefixCategory,
      title: 'Root session',
      keybind: commandKey('g', 'g'),
    },
    ...(selectedItem?.itemKind === 'configured'
      ? [
          {
            id: 'edit-target' as const,
            category: prefixCategory,
            title: 'Edit target',
            keybind: commandKey('e', 'e'),
          },
        ]
      : []),
    {
      id: 'refresh',
      category: prefixCategory,
      title: 'Refresh',
      keybind: commandKey('shift+r', 'R'),
    },
  ]
}

export function filterCommandEntries(entries: CommandEntry[], query: string): CommandEntry[] {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return entries
  }

  return entries.filter(entry => {
    const haystack =
      `${entry.category} ${entry.title} ${entry.keybind} ${entry.keywords ?? ''}`.toLowerCase()

    return haystack.includes(normalizedQuery)
  })
}

export function getCommandEntryKey(entry: CommandEntry): string {
  return `${entry.category}:${entry.id}`
}

function getCommandRows(entries: CommandEntry[]): CommandRow[] {
  return entries.flatMap((entry, index): CommandRow[] => {
    const key = getCommandEntryKey(entry)
    const row: CommandRow = { kind: 'entry', key, entry, index }

    if (index > 0 && entries[index - 1]?.category === entry.category) {
      return [row]
    }

    const heading: CommandRow = { kind: 'heading', key: `heading:${key}`, category: entry.category }

    return index === 0 ? [heading, row] : [{ kind: 'gap', key: `gap:${key}` }, heading, row]
  })
}

export default function CommandsModal({
  columns,
  rows,
  themeId,
  entries,
  cursor,
  searchQuery,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  useTextareaFocus(textareaRef, [])

  const width = getDialogWidth(columns, COMMANDS_PREFERRED_WIDTH)
  const rowWidth = getDialogRowWidth(width)

  const listRows = getDialogListRows(
    rows,
    getDialogChromeRows({ description: themeId, footer: COMMANDS_FOOTER }) + DIALOG_FILTER_ROWS
  )

  const commandRows = getCommandRows(entries)
  const cursorRow = commandRows.findIndex(row => row.kind === 'entry' && row.index === cursor)
  const visibleRows = getVisibleWindow(commandRows, cursorRow, listRows).items

  return (
    <Modal
      title="Commands"
      description={themeId}
      footer={COMMANDS_FOOTER}
      columns={columns}
      preferredWidth={COMMANDS_PREFERRED_WIDTH}
    >
      <DialogFilter
        placeholder="Search"
        searchQuery={searchQuery}
        textareaRef={textareaRef}
        onContentChange={onContentChange}
      />

      <box style={{ flexDirection: 'column' }}>
        {entries.length === 0 ? (
          <text style={{ fg: theme.textMuted }}>No commands found</text>
        ) : (
          visibleRows.map((row, index) => {
            if (row.kind === 'gap') {
              return index === 0 ? null : <box key={row.key} style={{ height: 1 }} />
            }

            if (row.kind === 'heading') {
              return (
                <text key={row.key} style={{ fg: theme.accent }}>
                  {truncateDialogText(row.category, getDialogContentWidth(width))}
                </text>
              )
            }

            return (
              <DialogRow
                key={row.key}
                label={row.entry.title}
                value={row.entry.keybind}
                selected={row.index === cursor}
                width={rowWidth}
              />
            )
          })
        )}
      </box>
    </Modal>
  )
}
