import type { TextareaRenderable } from '@opentui/core'
import { DialogField } from './DialogList'
import type { KeyHint } from './key-hints'
import Modal from './Modal'
import { useTextareaFocus } from './use-textarea-focus'

const RENAME_HINTS: readonly KeyHint[] = [
  { label: 'apply', key: 'enter' },
  { label: 'cancel', key: 'esc' },
]

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
  useTextareaFocus(textareaRef, [target], { gotoLineEnd: true })

  return (
    <Modal
      title="Rename Session"
      description={`Update ${target}`}
      hints={RENAME_HINTS}
      columns={columns}
      preferredWidth={60}
    >
      <DialogField
        initialValue={initialValue}
        textareaRef={textareaRef}
        onContentChange={onContentChange}
      />
    </Modal>
  )
}
