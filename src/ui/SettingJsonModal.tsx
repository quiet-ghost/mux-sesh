import type { TextareaRenderable } from '@opentui/core'
import { getDialogHints } from '../app/dialog-actions'
import { useTheme } from '../styles/theme'
import { getDialogContentWidth, getDialogWidth, truncateDialogText } from './dialog-layout'
import Modal from './Modal'
import { textFieldColors } from './text-field-colors'
import { useTextareaFocus } from './use-textarea-focus'

const JSON_HINTS = getDialogHints({ kind: 'setting-json' })
const PREFERRED_WIDTH = 88
const DESCRIPTION = 'Nothing is saved until ctrl+s; esc discards the draft'

interface Props {
  title: string
  value: string
  error: string
  columns: number
  rows: number
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

// A code view of one config value: numbered lines that scroll sideways instead of wrapping, and
// the error under the text it is about.
export default function SettingJsonModal({
  title,
  value,
  error,
  columns,
  rows,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  const height = Math.max(6, rows - 16)
  const contentWidth = getDialogContentWidth(getDialogWidth(columns, PREFERRED_WIDTH))
  useTextareaFocus(textareaRef, [])

  return (
    <Modal
      title={`${title} · JSON`}
      description={DESCRIPTION}
      hints={JSON_HINTS}
      columns={columns}
      preferredWidth={PREFERRED_WIDTH}
    >
      <box style={{ flexShrink: 0, height, marginTop: 1, overflow: 'hidden' }}>
        <line-number fg={theme.textMuted} bg={theme.surface} minWidth={3} paddingRight={2}>
          <textarea
            ref={textareaRef}
            style={{ flexGrow: 1, flexShrink: 1, height }}
            {...textFieldColors(theme)}
            initialValue={value}
            onContentChange={onContentChange}
            focused
            wrapMode="none"
          />
        </line-number>
      </box>

      {error && (
        <text style={{ fg: theme.danger, marginTop: 1, wrapMode: 'none' }}>
          {truncateDialogText(error, contentWidth)}
        </text>
      )}
    </Modal>
  )
}
