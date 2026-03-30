import type { TextareaRenderable } from '@opentui/core'
import { useEffect } from 'react'
import { useTheme } from '../styles/theme'
import Modal from './Modal'

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

  useEffect(() => {
    queueMicrotask(() => {
      textareaRef.current?.focus()
    })
  }, [textareaRef])

  return (
    <Modal title={title} description={description} footer='Enter apply' columns={columns} preferredWidth={88}>
      {error && <text style={{ fg: theme.danger, marginBottom: 1 }}>{error}</text>}

      <box
        style={{
          backgroundColor: theme.surfaceAlt,
          height: Math.max(6, rows - 16),
        }}
      >
        <textarea ref={textareaRef} initialValue={value} onContentChange={onContentChange} focused />
      </box>
    </Modal>
  )
}
