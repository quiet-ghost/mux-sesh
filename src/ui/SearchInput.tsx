import type { TextareaRenderable } from '@opentui/core'
import { useEffect } from 'react'
import { useTheme } from '../styles/theme'
import { AppMode } from '../types'

interface Props {
  appMode: AppMode
  searchQuery: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
  prefixActive?: boolean
}

export default function SearchInput({
  appMode,
  searchQuery,
  textareaRef,
  onContentChange,
  prefixActive = false,
}: Props) {
  const theme = useTheme()
  const placeholder =
    appMode === AppMode.NewSession
      ? 'Type project name, GitHub URL, or custom session name...'
      : appMode === AppMode.Rename
        ? 'Enter new session name...'
        : 'Type to search...'

  useEffect(() => {
    if (appMode !== AppMode.Rename) {
      return
    }

    queueMicrotask(() => {
      const textarea = textareaRef.current
      if (!textarea) {
        return
      }

      textarea.focus()
      textarea.gotoLineEnd()
    })
  }, [appMode, textareaRef])

  return (
    <box
      style={{
        marginBottom: 1,
        height: 3,
        backgroundColor: prefixActive ? theme.surfaceAlt : theme.surface,
      }}
    >
      <textarea
        ref={textareaRef}
        placeholder={placeholder}
        initialValue={searchQuery}
        onContentChange={onContentChange}
        focused={!prefixActive}
      />
    </box>
  )
}
