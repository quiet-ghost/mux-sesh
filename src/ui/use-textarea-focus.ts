import type { TextareaRenderable } from '@opentui/core'
import { useEffect } from 'react'

interface Options {
  gotoLineEnd?: boolean
}

export function useTextareaFocus(
  textareaRef: { current: TextareaRenderable | null },
  dependencies: readonly unknown[],
  options: Options = {}
) {
  useEffect(() => {
    queueMicrotask(() => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }

      textarea.focus()
      if (options.gotoLineEnd) {
        textarea.gotoLineEnd()
      }
    })
  }, [options.gotoLineEnd, textareaRef, ...dependencies])
}
