import type { TextareaRenderable } from '@opentui/core'
import { useTheme } from '../styles/theme'
import Modal from './Modal'
import { useTextareaFocus } from './use-textarea-focus'

interface Props {
  target: string
  initialValue: string
  columns: number
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

export default function RenameModal({
  target,
  initialValue,
  columns,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  useTextareaFocus(textareaRef, [target], { gotoLineEnd: true })

  return (
    <Modal
      title="Rename Session"
      description={`Update ${target}`}
      footer="Enter apply"
      columns={columns}
      preferredWidth={60}
    >
      <box style={{ backgroundColor: theme.surfaceAlt, height: 3 }}>
        <textarea
          ref={textareaRef}
          initialValue={initialValue}
          onContentChange={onContentChange}
          focused
        />
      </box>
    </Modal>
  )
}
