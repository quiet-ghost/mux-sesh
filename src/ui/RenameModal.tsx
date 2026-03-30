import type { TextareaRenderable } from '@opentui/core'
import { useEffect } from 'react'
import { useTheme } from '../styles/theme'
import Modal from './Modal'

interface Props {
  target: string
  initialValue: string
  columns: number
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

export default function RenameModal({ target, initialValue, columns, textareaRef, onContentChange }: Props) {
  const theme = useTheme()

  useEffect(() => {
    queueMicrotask(() => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }

      textarea.focus()
      textarea.gotoLineEnd()
    })
  }, [target, textareaRef])

  return (
    <Modal
      title='Rename Session'
      description={`Update ${target}`}
      footer='Enter apply'
      columns={columns}
      preferredWidth={60}
    >
      <box style={{ backgroundColor: theme.surfaceAlt, height: 3 }}>
        <textarea ref={textareaRef} initialValue={initialValue} onContentChange={onContentChange} focused />
      </box>
    </Modal>
  )
}
