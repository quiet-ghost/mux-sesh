import type { TextareaRenderable } from '@opentui/core'
import { OptionPicker } from '../app/option-picker'
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
import type { KeyHint } from './key-hints'
import { getVisibleWindow } from './list-window'
import Modal from './Modal'
import { useTextareaFocus } from './use-textarea-focus'

const OPTIONS_HINTS: readonly KeyHint[] = [
  { label: 'navigate', key: '↑/↓' },
  { label: 'apply', key: 'enter' },
  { label: 'back', key: 'esc' },
]

const OPTIONS_PREFERRED_WIDTH = 68
const OPTIONS_DETAIL_ROWS = 3
const NOTICE_MARGIN_ROWS = 1

function wrapNotice(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''

  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word

    if (next.length <= width || !line) {
      line = next
    } else {
      lines.push(line)
      line = word
    }
  }

  if (line) lines.push(line)

  return lines.map(wrapped => truncateDialogText(wrapped, width))
}

interface Props {
  title: string
  description: string
  columns: number
  rows: number
  options: SettingsOption[]
  // The value in the config, which changes only after a save succeeds; the highlight is a preview.
  savedValue: string | undefined
  cursor: number
  searchQuery: string
  picker: OptionPicker
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

export default function SettingOptionsModal({
  title,
  description,
  columns,
  rows,
  options,
  savedValue,
  cursor,
  searchQuery,
  picker,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  const selected = options[cursor]
  useTextareaFocus(textareaRef, [])

  const width = getDialogWidth(columns, OPTIONS_PREFERRED_WIDTH)
  const contentWidth = getDialogContentWidth(width)
  const rowWidth = getDialogRowWidth(width)

  const noticeLines = OptionPicker.notice(picker).flatMap(text => wrapNotice(text, contentWidth))
  const noticeRows = noticeLines.length > 0 ? NOTICE_MARGIN_ROWS + noticeLines.length : 0

  const reservedRows = getDialogChromeRows({ description }) + DIALOG_FILTER_ROWS + noticeRows

  const hasDetails = options.some(option => option.description)
  const showDetail = hasDetails && fitsOptionalDialogRows(rows, reservedRows, OPTIONS_DETAIL_ROWS)
  const listRows = getDialogListRows(rows, reservedRows + (showDetail ? OPTIONS_DETAIL_ROWS : 0))
  const visibleWindow = getVisibleWindow(options, cursor, listRows)

  return (
    <Modal
      title={title}
      description={description}
      hints={OPTIONS_HINTS}
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
              current={option.value === savedValue}
              width={rowWidth}
            />
          ))
        )}
      </box>

      {noticeLines.length > 0 && (
        <box style={{ flexDirection: 'column', marginTop: NOTICE_MARGIN_ROWS }}>
          {noticeLines.map((line, index) => (
            <text
              key={index}
              wrapMode="none"
              style={{ fg: picker.kind === 'save-failed' ? theme.danger : theme.textMuted }}
            >
              {line}
            </text>
          ))}
        </box>
      )}

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
