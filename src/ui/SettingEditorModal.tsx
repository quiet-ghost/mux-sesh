import type { TextareaRenderable } from '@opentui/core'
import { getDialogHints } from '../app/action-catalog'
import { useTheme } from '../styles/theme'
import { DialogField } from './DialogList'
import Modal from './Modal'
import { useTextareaFocus } from './use-textarea-focus'

const EDITOR_HINTS = getDialogHints({ kind: 'setting-editor' })

interface Props {
  title: string
  description: string
  value: string
  error?: string
  columns: number
  rows: number
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

export default function SettingEditorModal({
  title,
  description,
  value,
  error,
  columns,
  rows,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  useTextareaFocus(textareaRef, [])

  return (
    <Modal
      title={title}
      description={description}
      hints={EDITOR_HINTS}
      columns={columns}
      preferredWidth={88}
    >
      {error && <text style={{ fg: theme.danger, marginBottom: 1 }}>{error}</text>}

      <DialogField
        initialValue={value}
        textareaRef={textareaRef}
        onContentChange={onContentChange}
        height={Math.max(6, rows - 16)}
      />
    </Modal>
  )
}
