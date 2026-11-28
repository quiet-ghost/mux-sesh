import type { TextareaRenderable } from '@opentui/core'
import type { ListPaneModel, PaneLine } from '../app/setting-panes'
import { useTheme } from '../styles/theme'
import type { ThemeColors } from '../types'
import {
  fitsOptionalDialogRows,
  getDialogChromeRows,
  getDialogContentWidth,
  getDialogListRows,
  getDialogRowWidth,
  getDialogWidth,
  truncateDialogText,
} from './dialog-layout'
import { DialogField, DialogRow } from './DialogList'
import { getVisibleWindow } from './list-window'
import Modal from './Modal'
import { useTextareaFocus } from './use-textarea-focus'

export const SETTING_PANE_WIDTH = 88

// The blank row above the list.
const LIST_GAP_ROWS = 1

// A blank row, then the selected row's line.
const DETAIL_ROWS = 2

interface Props {
  model: ListPaneModel
  columns: number
  rows: number
  draft: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

export function paneLineColor(theme: ThemeColors, line: PaneLine): string {
  switch (line.tone) {
    case 'muted':
      return theme.textMuted
    case 'text':
      return theme.text
    case 'danger':
      return theme.danger
  }
}

// A list setting's pane: one row per entry with what it does now, then the add and JSON rows.
// The open field takes the place of the row it edits, or of the add row.
export default function SettingListModal({
  model,
  columns,
  rows,
  draft,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  useTextareaFocus(textareaRef, [model.fieldRow])

  const width = getDialogWidth(columns, SETTING_PANE_WIDTH)
  const contentWidth = getDialogContentWidth(width)
  const rowWidth = getDialogRowWidth(width)

  const reservedRows = getDialogChromeRows({ description: model.description }) + LIST_GAP_ROWS
  const showDetail = fitsOptionalDialogRows(rows, reservedRows, DETAIL_ROWS)
  const listRows = getDialogListRows(rows, reservedRows + (showDetail ? DETAIL_ROWS : 0))
  const visible = getVisibleWindow([...model.rows], model.cursor, listRows)

  return (
    <Modal
      title={model.title}
      description={model.description}
      hints={model.hints}
      columns={columns}
      preferredWidth={SETTING_PANE_WIDTH}
    >
      <box style={{ flexDirection: 'column', marginTop: LIST_GAP_ROWS }}>
        {visible.items.map((row, offset) => {
          const index = visible.startIndex + offset

          if (index === model.fieldRow) {
            return (
              <DialogField
                key={`field:${row.key}`}
                initialValue={draft}
                placeholder={model.placeholder}
                textareaRef={textareaRef}
                onContentChange={onContentChange}
              />
            )
          }

          return (
            <DialogRow
              key={row.key}
              label={row.label}
              value={row.kind === 'item' ? row.value : ''}
              selected={model.fieldRow === undefined && index === model.cursor}
              width={rowWidth}
            />
          )
        })}
      </box>

      {showDetail && model.detail && (
        <box style={{ flexDirection: 'column', marginTop: 1 }}>
          <text wrapMode="none" style={{ fg: paneLineColor(theme, model.detail) }}>
            {truncateDialogText(model.detail.text, contentWidth)}
          </text>
        </box>
      )}
    </Modal>
  )
}
