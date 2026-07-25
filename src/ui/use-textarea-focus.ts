import type { TextareaRenderable } from '@opentui/core'
import { useEffect } from 'react'

interface Options {
  gotoLineEnd?: boolean
}

type FocusableTextarea = Pick<TextareaRenderable, 'isDestroyed' | 'focus' | 'gotoLineEnd'>

export function focusTextarea(textarea: FocusableTextarea | null, gotoLineEnd = false): void {
  if (!textarea || textarea.isDestroyed) return

  textarea.focus()
  if (gotoLineEnd && !textarea.isDestroyed) {
    textarea.gotoLineEnd()
  }
}

export function useTextareaFocus(
  textareaRef: { current: TextareaRenderable | null },
  dependencies: readonly unknown[],
  options: Options = {}
) {
  useEffect(() => {
    queueMicrotask(() => {
      focusTextarea(textareaRef.current, options.gotoLineEnd)
    })
  }, [options.gotoLineEnd, textareaRef, ...dependencies])
}
