import type { TextareaRenderable } from '@opentui/core'
import { useLayoutEffect } from 'react'
import { reconcileTextareaValue } from '../app/textarea'
import { useTheme } from '../styles/theme'
import { AppMode } from '../types'
import { textFieldColors } from './text-field-colors'

const PROMPT = '›'

interface Props {
  appMode: AppMode
  searchQuery: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
  // False while a pending prefix or a dialog owns the keys; the field then drops its focused look.
  focused: boolean
  placeholder?: string
  // Right-aligned and muted, e.g. `3 of 7`; omitted when the field is not a result filter.
  count?: string
}

export default function SearchInput({
  appMode,
  searchQuery,
  textareaRef,
  onContentChange,
  focused,
  placeholder = appMode === AppMode.NewSession
    ? 'Type a project name, path, or GitHub URL...'
    : 'Type to search...',
  count,
}: Props) {
  const theme = useTheme()

  // A layout effect runs in the same commit, before newer typing can make the query stale.
  useLayoutEffect(() => {
    reconcileTextareaValue(textareaRef.current, searchQuery)
  }, [searchQuery, textareaRef])

  return (
    <box
      style={{
        flexDirection: 'row',
        flexShrink: 0,
        height: 1,
        marginBottom: 1,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: focused ? theme.surfaceAlt : 'transparent',
      }}
    >
      <text
        style={{ fg: focused ? theme.primary : theme.textMuted, flexShrink: 0, wrapMode: 'none' }}
      >
        {`${PROMPT} `}
      </text>
      <textarea
        ref={textareaRef}
        style={{ flexGrow: 1, flexShrink: 1, height: 1 }}
        placeholder={placeholder}
        {...textFieldColors(theme)}
        initialValue={searchQuery}
        onContentChange={onContentChange}
        focused={focused}
        wrapMode="none"
      />
      {count ? (
        <text style={{ fg: theme.textMuted, flexShrink: 0, wrapMode: 'none', marginLeft: 1 }}>
          {count}
        </text>
      ) : null}
    </box>
  )
}
