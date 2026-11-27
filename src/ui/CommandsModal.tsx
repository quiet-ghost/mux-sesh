import type { TextareaRenderable } from '@opentui/core'
import type { CommandEntry } from '../app/action-catalog'
import { useTheme } from '../styles/theme'
import { useTextareaFocus } from './use-textarea-focus'
import {
  DIALOG_FILTER_ROWS,
  getDialogChromeRows,
  getDialogContentWidth,
  getDialogListRows,
  getDialogRowWidth,
  getDialogWidth,
  truncateDialogText,
} from './dialog-layout'
import { DialogFilter, DialogRow, DialogSectionHeader } from './DialogList'
import type { KeyHint } from './key-hints'
import { getVisibleWindow } from './list-window'
import Modal from './Modal'

const COMMANDS_HINTS: readonly KeyHint[] = [
  { label: 'navigate', key: '↑/↓' },
  { label: 'run', key: 'enter' },
  { label: 'close', key: 'esc' },
]

const COMMANDS_PREFERRED_WIDTH = 68

export type { CommandEntry, CommandId } from '../app/action-catalog'

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

// A window cut just after a section break would end on a header with none of its commands.
function dropTrailingHeadings(rows: CommandRow[]): CommandRow[] {
  const last = rows.findLastIndex(row => row.kind === 'entry')

  return last === rows.length - 1 ? rows : rows.slice(0, last + 1)
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
    getDialogChromeRows({ description: themeId }) + DIALOG_FILTER_ROWS
  )

  const commandRows = getCommandRows(entries)
  const cursorRow = commandRows.findIndex(row => row.kind === 'entry' && row.index === cursor)
  const visibleRows = dropTrailingHeadings(getVisibleWindow(commandRows, cursorRow, listRows).items)

  return (
    <Modal
      title="Commands"
      description={themeId}
      hints={COMMANDS_HINTS}
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
                <DialogSectionHeader
                  key={row.key}
                  text={truncateDialogText(row.category, getDialogContentWidth(width))}
                />
              )
            }

            return (
              <DialogRow
                key={row.key}
                label={row.entry.title}
                value={
                  row.entry.availability.kind === 'unavailable'
                    ? row.entry.availability.reason
                    : row.entry.keybind
                }
                selected={row.index === cursor}
                disabled={row.entry.availability.kind === 'unavailable'}
                width={rowWidth}
              />
            )
          })
        )}
      </box>
    </Modal>
  )
}
