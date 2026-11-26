import type { TextareaRenderable } from '@opentui/core'
import { useLayoutEffect } from 'react'
import { reconcileTextareaValue } from '../app/textarea'
import { useTheme } from '../styles/theme'
import { AppMode } from '../types'

interface Props {
  appMode: AppMode
  searchQuery: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
  focused: boolean
  prefixActive?: boolean
}

export default function SearchInput({
  appMode,
  searchQuery,
  textareaRef,
  onContentChange,
  focused,
  prefixActive = false,
}: Props) {
  const theme = useTheme()

  const placeholder =
    appMode === AppMode.NewSession
      ? 'Type a project name, path, or GitHub URL...'
      : 'Type to search...'

  // A layout effect runs in the same commit, before newer typing can make the query stale.
  useLayoutEffect(() => {
    reconcileTextareaValue(textareaRef.current, searchQuery)
  }, [searchQuery, textareaRef])

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
        focused={focused}
      />
    </box>
  )
}
