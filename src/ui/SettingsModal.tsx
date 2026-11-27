import type { TextareaRenderable } from '@opentui/core'
import { useTheme } from '../styles/theme'
import type { SettingsEntry } from '../settings'
import {
  DIALOG_FILTER_ROWS,
  fitsOptionalDialogRows,
  getDialogChromeRows,
  getDialogContentWidth,
  getDialogListRows,
  getDialogRowWidth,
  getDialogWidth,
  truncateDialogText,
} from './dialog-layout'
import { DialogFilter, DialogRow } from './DialogList'
import type { KeyHint } from './key-hints'
import { getVisibleWindow } from './list-window'
import Modal from './Modal'
import { useTextareaFocus } from './use-textarea-focus'

const SETTINGS_DESCRIPTION = 'Search for a setting, then open its option or editor screen'

const SETTINGS_HINTS: readonly KeyHint[] = [
  { label: 'navigate', key: '↑/↓' },
  { label: 'open', key: 'enter' },
  { label: 'close', key: 'esc' },
]

const SETTINGS_PREFERRED_WIDTH = 74
const SETTINGS_SUMMARY_ROWS = 3
const SETTINGS_DETAIL_ROWS = 3

interface Props {
  configPath: string
  themeName: string
  colorMode: string
  columns: number
  rows: number
  entries: SettingsEntry[]
  cursor: number
  searchQuery: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

export default function SettingsModal({
  configPath,
  themeName,
  colorMode,
  columns,
  rows,
  entries,
  cursor,
  searchQuery,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  const selected = entries[cursor]
  useTextareaFocus(textareaRef, [])

  const width = getDialogWidth(columns, SETTINGS_PREFERRED_WIDTH)
  const contentWidth = getDialogContentWidth(width)
  const rowWidth = getDialogRowWidth(width)

  const reservedRows =
    getDialogChromeRows({ description: SETTINGS_DESCRIPTION }) +
    SETTINGS_SUMMARY_ROWS +
    DIALOG_FILTER_ROWS

  const showDetail = fitsOptionalDialogRows(rows, reservedRows, SETTINGS_DETAIL_ROWS)
  const listRows = getDialogListRows(rows, reservedRows + (showDetail ? SETTINGS_DETAIL_ROWS : 0))
  const visibleWindow = getVisibleWindow(entries, cursor, listRows)

  return (
    <Modal
      title="Settings"
      description={SETTINGS_DESCRIPTION}
      hints={SETTINGS_HINTS}
      columns={columns}
      preferredWidth={SETTINGS_PREFERRED_WIDTH}
    >
      <box style={{ flexDirection: 'column', marginBottom: 1 }}>
        <text style={{ fg: theme.textMuted }}>
          {truncateDialogText(`Path: ${configPath}`, contentWidth)}
        </text>
        <text style={{ fg: theme.textMuted }}>
          {truncateDialogText(`${themeName} (${colorMode})`, contentWidth)}
        </text>
      </box>

      <DialogFilter
        placeholder="Search settings"
        searchQuery={searchQuery}
        textareaRef={textareaRef}
        onContentChange={onContentChange}
      />

      <box style={{ flexDirection: 'column' }}>
        {entries.length === 0 ? (
          <text style={{ fg: theme.textMuted }}>No settings found</text>
        ) : (
          visibleWindow.items.map((entry, index) => (
            <DialogRow
              key={entry.id}
              label={entry.label}
              value={entry.value}
              selected={visibleWindow.startIndex + index === cursor}
              width={rowWidth}
            />
          ))
        )}
      </box>

      {showDetail && selected && (
        <box style={{ flexDirection: 'column', marginTop: 1 }}>
          <text style={{ fg: theme.accent }}>
            {truncateDialogText(selected.label, contentWidth)}
          </text>
          <text style={{ fg: theme.textMuted }}>
            {truncateDialogText(selected.hint, contentWidth)}
          </text>
        </box>
      )}
    </Modal>
  )
}
