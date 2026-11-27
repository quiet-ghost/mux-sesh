import type { TextareaRenderable } from '@opentui/core'
import { useTheme } from '../styles/theme'
import type { KeyHint } from './key-hints'
import Modal from './Modal'
import { useTextareaFocus } from './use-textarea-focus'

const EDITOR_HINTS: readonly KeyHint[] = [
  { label: 'apply', key: 'enter' },
  { label: 'back', key: 'esc' },
]

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

      <box
        style={{
          backgroundColor: theme.surfaceAlt,
          height: Math.max(6, rows - 16),
        }}
      >
        <textarea
          ref={textareaRef}
          initialValue={value}
          onContentChange={onContentChange}
          focused
        />
      </box>
    </Modal>
  )
}
