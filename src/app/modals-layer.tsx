import type { TextareaRenderable } from '@opentui/core'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { SettingsEntry, SettingsOption, SettingsFieldId } from '../settings'
import type { CommandEntry } from '../ui/CommandsModal'
import type { ModalState } from './modals'
import CommandsModal from '../ui/CommandsModal'
import RenameModal from '../ui/RenameModal'
import SettingEditorModal from '../ui/SettingEditorModal'
import SettingOptionsModal from '../ui/SettingOptionsModal'
import SettingsModal from '../ui/SettingsModal'

interface Props {
  modalState: ModalState
  columns: number
  rows: number
  configPath: string
  themeId: string
  themeName: string
  colorMode: string
  filteredCommandEntries: CommandEntry[]
  commandsCursor: number
  commandsSearchQuery: string
  setCommandsCursor: Dispatch<SetStateAction<number>>
  setCommandsSearchQuery: Dispatch<SetStateAction<string>>
  filteredSettingsEntries: SettingsEntry[]
  settingsCursor: number
  settingsSearchQuery: string
  setSettingsCursor: Dispatch<SetStateAction<number>>
  setSettingsSearchQuery: Dispatch<SetStateAction<string>>
  filteredSettingOptions: SettingsOption[]
  settingOptionsCursor: number
  settingOptionsSearchQuery: string
  setSettingOptionsCursor: Dispatch<SetStateAction<number>>
  setSettingOptionsSearchQuery: Dispatch<SetStateAction<string>>
  settingEditorValue: string
  settingEditorError: string
  setSettingEditorValue: Dispatch<SetStateAction<string>>
  modalInputValue: string
  setModalInputValue: Dispatch<SetStateAction<string>>
  commandsSearchTextareaRef: MutableRefObject<TextareaRenderable | null>
  settingsSearchTextareaRef: MutableRefObject<TextareaRenderable | null>
  settingOptionsSearchTextareaRef: MutableRefObject<TextareaRenderable | null>
  settingEditorTextareaRef: MutableRefObject<TextareaRenderable | null>
  modalTextareaRef: MutableRefObject<TextareaRenderable | null>
  getSettingEditorTitle: (field: SettingsFieldId) => string
}

function setTextareaValue(
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

export function AppModalsLayer({
  modalState,
  columns,
  rows,
  configPath,
  themeId,
  themeName,
  colorMode,
  filteredCommandEntries,
  commandsCursor,
  commandsSearchQuery,
  setCommandsCursor,
  setCommandsSearchQuery,
  filteredSettingsEntries,
  settingsCursor,
  settingsSearchQuery,
  setSettingsCursor,
  setSettingsSearchQuery,
  filteredSettingOptions,
  settingOptionsCursor,
  settingOptionsSearchQuery,
  setSettingOptionsCursor,
  setSettingOptionsSearchQuery,
  settingEditorValue,
  settingEditorError,
  setSettingEditorValue,
  modalInputValue,
  setModalInputValue,
  commandsSearchTextareaRef,
  settingsSearchTextareaRef,
  settingOptionsSearchTextareaRef,
  settingEditorTextareaRef,
  modalTextareaRef,
  getSettingEditorTitle,
}: Props) {
  return (
    <>
      {modalState?.type === 'rename' && (
        <RenameModal
          target={modalState.target}
          initialValue={modalInputValue}
          columns={columns}
          textareaRef={modalTextareaRef}
          onContentChange={() => setTextareaValue(modalTextareaRef, setModalInputValue)}
        />
      )}

      {modalState?.type === 'commands' && (
        <CommandsModal
          columns={columns}
          themeId={themeId}
          entries={filteredCommandEntries}
          cursor={commandsCursor}
          searchQuery={commandsSearchQuery}
          textareaRef={commandsSearchTextareaRef}
          onContentChange={() =>
            setTextareaValue(commandsSearchTextareaRef, setCommandsSearchQuery, setCommandsCursor)
          }
        />
      )}

      {modalState?.type === 'settings' && (
        <SettingsModal
          configPath={configPath}
          themeName={themeName}
          colorMode={colorMode}
          columns={columns}
          entries={filteredSettingsEntries}
          cursor={settingsCursor}
          searchQuery={settingsSearchQuery}
          textareaRef={settingsSearchTextareaRef}
          onContentChange={() =>
            setTextareaValue(settingsSearchTextareaRef, setSettingsSearchQuery, setSettingsCursor)
          }
        />
      )}

      {modalState?.type === 'setting-options' && (
        <SettingOptionsModal
          title={getSettingEditorTitle(modalState.field)}
          description="Select an option to apply it immediately"
          columns={columns}
          options={filteredSettingOptions}
          cursor={settingOptionsCursor}
          searchQuery={settingOptionsSearchQuery}
          textareaRef={settingOptionsSearchTextareaRef}
          onContentChange={() =>
            setTextareaValue(
              settingOptionsSearchTextareaRef,
              setSettingOptionsSearchQuery,
              setSettingOptionsCursor
            )
          }
        />
      )}

      {modalState?.type === 'setting-editor' && (
        <SettingEditorModal
          title={getSettingEditorTitle(modalState.field)}
          description="Edit value and press Enter to apply immediately"
          value={settingEditorValue}
          error={settingEditorError}
          columns={columns}
          rows={rows}
          textareaRef={settingEditorTextareaRef}
          onContentChange={() => setTextareaValue(settingEditorTextareaRef, setSettingEditorValue)}
        />
      )}
    </>
  )
}
