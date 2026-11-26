import type { TextareaRenderable } from '@opentui/core'
import { useTheme } from '../styles/theme'
import type { SettingsOption } from '../settings'
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
import { getVisibleWindow } from './list-window'
import Modal from './Modal'
import { useTextareaFocus } from './use-textarea-focus'

const OPTIONS_FOOTER = '↑/↓ navigate  enter apply  esc back'
const OPTIONS_PREFERRED_WIDTH = 68
const OPTIONS_DETAIL_ROWS = 3

interface Props {
  title: string
  description: string
  columns: number
  rows: number
  options: SettingsOption[]
  cursor: number
  searchQuery: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

export default function SettingOptionsModal({
  title,
  description,
  columns,
  rows,
  options,
  cursor,
  searchQuery,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  const selected = options[cursor]
  useTextareaFocus(textareaRef, [])

  const width = getDialogWidth(columns, OPTIONS_PREFERRED_WIDTH)
  const contentWidth = getDialogContentWidth(width)
  const rowWidth = getDialogRowWidth(width)

  const reservedRows =
    getDialogChromeRows({ description, footer: OPTIONS_FOOTER }) + DIALOG_FILTER_ROWS

  const hasDetails = options.some(option => option.description)
  const showDetail = hasDetails && fitsOptionalDialogRows(rows, reservedRows, OPTIONS_DETAIL_ROWS)
  const listRows = getDialogListRows(rows, reservedRows + (showDetail ? OPTIONS_DETAIL_ROWS : 0))
  const visibleWindow = getVisibleWindow(options, cursor, listRows)

  return (
    <Modal
      title={title}
      description={description}
      footer={OPTIONS_FOOTER}
      columns={columns}
      preferredWidth={OPTIONS_PREFERRED_WIDTH}
    >
      <DialogFilter
        placeholder="Filter options"
        searchQuery={searchQuery}
        textareaRef={textareaRef}
        onContentChange={onContentChange}
      />

      <box style={{ flexDirection: 'column' }}>
        {options.length === 0 ? (
          <text style={{ fg: theme.textMuted }}>No options found</text>
        ) : (
          visibleWindow.items.map((option, index) => (
            <DialogRow
              key={option.value}
              label={option.label}
              value={option.value}
              selected={visibleWindow.startIndex + index === cursor}
              width={rowWidth}
            />
          ))
        )}
      </box>

      {showDetail && selected?.description && (
        <box style={{ flexDirection: 'column', marginTop: 1 }}>
          <text style={{ fg: theme.accent }}>
            {truncateDialogText(selected.label, contentWidth)}
          </text>
          <text style={{ fg: theme.textMuted }}>
            {truncateDialogText(selected.description, contentWidth)}
          </text>
        </box>
      )}
    </Modal>
  )
}
