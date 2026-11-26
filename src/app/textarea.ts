import type { TextareaRenderable } from '@opentui/core'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

type EditableTextarea = Pick<TextareaRenderable, 'isDestroyed' | 'plainText' | 'setText'>

export function syncTextareaValue(
  textareaRef: MutableRefObject<TextareaRenderable | null>,
  setValue: Dispatch<SetStateAction<string>>,
  resetCursor?: Dispatch<SetStateAction<number>>
) {
  const value = textareaRef.current?.plainText

  if (value === undefined) {
    return
  }

  setValue(value)
  resetCursor?.(0)
}

// Writes a value set outside the editor (a reset) back into it; typed text already matches.
export function reconcileTextareaValue(textarea: EditableTextarea | null, value: string): void {
  if (!textarea || textarea.isDestroyed || textarea.plainText === value) return

  textarea.setText(value)
}
