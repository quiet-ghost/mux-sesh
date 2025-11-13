import { AppMode } from '../types'

interface Props {
  appMode: AppMode
  searchQuery: string
  textareaRef: any
  onContentChange: () => void
}

export default function SearchInput({ appMode, searchQuery, textareaRef, onContentChange }: Props) {
  const placeholder =
    appMode === AppMode.NewSession
      ? 'Type project name, GitHub URL, or custom session name...'
      : appMode === AppMode.Rename
        ? 'Enter new session name...'
        : 'Type to search...'

  return (
    <box style={{ marginBottom: 1, height: 3 }}>
      <textarea
        ref={textareaRef}
        placeholder={placeholder}
        initialValue={searchQuery}
        onContentChange={onContentChange}
        focused
      />
    </box>
  )
}
