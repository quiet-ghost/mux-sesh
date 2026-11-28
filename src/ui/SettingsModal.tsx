import type { TextareaRenderable } from '@opentui/core'
import { useLayoutEffect } from 'react'
import { getDialogHints } from '../app/action-catalog'
import type { OptionPicker } from '../app/option-picker'
import { reconcileTextareaValue } from '../app/textarea'
import { useTheme } from '../styles/theme'
import { getSettingsLabelMatches } from '../search/lists'
import type { SettingsEntry } from '../settings/settings-catalog'
import { toHomeRelativePath } from '../util/path-display'
import {
  DIALOG_FILTER_ROWS,
  fitsOptionalDialogRows,
  getDialogChromeRows,
  getDialogContentWidth,
  getDialogListRows,
  getDialogRowWidth,
  getDialogWidth,
  getNoMatchMessage,
  truncateDialogText,
} from './dialog-layout'
import { DialogFilter, DialogSectionHeader } from './DialogList'
import { getVisibleWindow } from './list-window'
import Modal from './Modal'
import SettingRow from './SettingRow'
import { useTextareaFocus } from './use-textarea-focus'

const SETTINGS_PREFERRED_WIDTH = 74

// A blank row, then the selected setting's description.
const SETTINGS_DETAIL_ROWS = 2

type SettingsRow =
  | { kind: 'heading'; key: string; category: string }
  | { kind: 'entry'; key: string; entry: SettingsEntry; index: number }

interface Props {
  configPath: string
  columns: number
  rows: number
  entries: SettingsEntry[]
  cursor: number
  searchQuery: string
  // A row change in flight or failed; its message replaces the selected row's description.
  picker: OptionPicker
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

function settingsNotice(picker: OptionPicker): string | undefined {
  switch (picker.kind) {
    case 'browsing':
      return undefined
    case 'saving':
      return `Saving ${picker.draft.label}…`
    case 'save-failed':
      return picker.reason
  }
}

// Headers group the list by category; while searching it is one ranked list.
function settingsRows(entries: readonly SettingsEntry[], searching: boolean): SettingsRow[] {
  return entries.flatMap((entry, index): SettingsRow[] => {
    const row: SettingsRow = { kind: 'entry', key: entry.id, entry, index }

    if (searching || entries[index - 1]?.category === entry.category) return [row]

    return [{ kind: 'heading', key: `heading:${entry.category}`, category: entry.category }, row]
  })
}

// A window cut just after a header would end on a header with none of its settings.
function dropTrailingHeadings(rows: SettingsRow[]): SettingsRow[] {
  const last = rows.findLastIndex(row => row.kind === 'entry')

  return last === rows.length - 1 ? rows : rows.slice(0, last + 1)
}

export default function SettingsModal({
  configPath,
  columns,
  rows,
  entries,
  cursor,
  searchQuery,
  picker,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  const selected = entries[cursor]
  const searching = searchQuery.trim().length > 0
  const description = toHomeRelativePath(configPath)
  useTextareaFocus(textareaRef, [])

  // Esc clears the query in state; the field follows.
  useLayoutEffect(() => {
    reconcileTextareaValue(textareaRef.current, searchQuery)
  }, [textareaRef, searchQuery])

  const width = getDialogWidth(columns, SETTINGS_PREFERRED_WIDTH)
  const contentWidth = getDialogContentWidth(width)
  const rowWidth = getDialogRowWidth(width)

  const reservedRows = getDialogChromeRows({ description }) + DIALOG_FILTER_ROWS
  const showDetail = fitsOptionalDialogRows(rows, reservedRows, SETTINGS_DETAIL_ROWS)
  const listRows = getDialogListRows(rows, reservedRows + (showDetail ? SETTINGS_DETAIL_ROWS : 0))

  const allRows = settingsRows(entries, searching)
  const cursorRow = allRows.findIndex(row => row.kind === 'entry' && row.index === cursor)
  const visibleRows = dropTrailingHeadings(getVisibleWindow(allRows, cursorRow, listRows).items)

  const notice = settingsNotice(picker)

  const detail =
    notice ??
    (selected &&
      (searching ? `${selected.category} · ${selected.description}` : selected.description))

  return (
    <Modal
      title="Settings"
      description={description}
      hints={getDialogHints({ kind: 'settings', entry: selected, query: searchQuery })}
      columns={columns}
      preferredWidth={SETTINGS_PREFERRED_WIDTH}
    >
      <DialogFilter
        placeholder="Search settings"
        searchQuery={searchQuery}
        textareaRef={textareaRef}
        onContentChange={onContentChange}
      />

      <box style={{ flexDirection: 'column' }}>
        {entries.length === 0 ? (
          <text style={{ fg: theme.textMuted }}>
            {getNoMatchMessage(searchQuery, 'No settings found')}
          </text>
        ) : (
          visibleRows.map(row =>
            row.kind === 'heading' ? (
              <DialogSectionHeader
                key={row.key}
                text={truncateDialogText(row.category, contentWidth)}
              />
            ) : (
              <SettingRow
                key={row.key}
                entry={row.entry}
                selected={row.index === cursor}
                width={rowWidth}
                matches={getSettingsLabelMatches(row.entry, searchQuery)}
              />
            )
          )
        )}
      </box>

      {showDetail && detail && (
        <box style={{ flexDirection: 'column', marginTop: 1 }}>
          <text
            wrapMode="none"
            style={{ fg: picker.kind === 'save-failed' ? theme.danger : theme.textMuted }}
          >
            {truncateDialogText(detail, contentWidth)}
          </text>
        </box>
      )}
    </Modal>
  )
}
