import type { TextareaRenderable } from '@opentui/core'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

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
