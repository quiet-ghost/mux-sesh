import type { TextareaRenderable } from '@opentui/core'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { SettingsEntry, SettingsOption, SettingsFieldId } from '../settings'
import type { CommandEntry } from '../ui/CommandsModal'
import type { ModalState } from './modals'
import type { SettingPaneState } from './setting-panes'
import { syncTextareaValue } from './textarea'
import CloseReviewBatch from '../ui/CloseReviewBatch'
import CloseReviewResults from '../ui/CloseReviewResults'
import CommandsModal, { getCommandEntryKey } from '../ui/CommandsModal'
import OperationOutcomeModal from '../ui/OperationOutcomeModal'
import RenameModal from '../ui/RenameModal'
import SettingEditorModal from '../ui/SettingEditorModal'
import SettingListModal from '../ui/SettingListModal'
import SettingOptionsModal from '../ui/SettingOptionsModal'
import SettingsModal from '../ui/SettingsModal'
import { useItemSelection } from '../ui/use-item-selection'

interface Props {
  modalState: ModalState
  columns: number
  rows: number
  configPath: string
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
  savedSettingOption: string | undefined
  settingOptionsCursor: number
  settingOptionsSearchQuery: string
  setSettingOptionsCursor: Dispatch<SetStateAction<number>>
  setSettingOptionsSearchQuery: Dispatch<SetStateAction<string>>
  settingEditorValue: string
  settingEditorError: string
  setSettingEditorValue: Dispatch<SetStateAction<string>>
  settingPane: SettingPaneState
  settingFieldDraft: string
  setSettingFieldDraft: Dispatch<SetStateAction<string>>
  settingFieldTextareaRef: MutableRefObject<TextareaRenderable | null>
  modalInputValue: string
  setModalInputValue: Dispatch<SetStateAction<string>>
  commandsSearchTextareaRef: MutableRefObject<TextareaRenderable | null>
  settingsSearchTextareaRef: MutableRefObject<TextareaRenderable | null>
  settingOptionsSearchTextareaRef: MutableRefObject<TextareaRenderable | null>
  settingEditorTextareaRef: MutableRefObject<TextareaRenderable | null>
  modalTextareaRef: MutableRefObject<TextareaRenderable | null>
  getSettingEditorTitle: (field: SettingsFieldId) => string
}

function getSettingsEntryKey(entry: SettingsEntry): string {
  return entry.id
}

function getSettingOptionKey(option: SettingsOption): string {
  return option.value
}

export function AppModalsLayer({
  modalState,
  columns,
  rows,
  configPath,
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
  savedSettingOption,
  settingOptionsCursor,
  settingOptionsSearchQuery,
  setSettingOptionsCursor,
  setSettingOptionsSearchQuery,
  settingEditorValue,
  settingEditorError,
  setSettingEditorValue,
  settingPane,
  settingFieldDraft,
  setSettingFieldDraft,
  settingFieldTextareaRef,
  modalInputValue,
  setModalInputValue,
  commandsSearchTextareaRef,
  settingsSearchTextareaRef,
  settingOptionsSearchTextareaRef,
  settingEditorTextareaRef,
  modalTextareaRef,
  getSettingEditorTitle,
}: Props) {
  useItemSelection(filteredCommandEntries, commandsCursor, setCommandsCursor, getCommandEntryKey)
  useItemSelection(filteredSettingsEntries, settingsCursor, setSettingsCursor, getSettingsEntryKey)
  useItemSelection(
    filteredSettingOptions,
    settingOptionsCursor,
    setSettingOptionsCursor,
    getSettingOptionKey
  )

  return (
    <>
      {modalState?.type === 'outcome' && (
        <OperationOutcomeModal report={modalState.report} columns={columns} />
      )}

      {modalState?.type === 'close-batch-review' && (
        <CloseReviewBatch batch={modalState.batch} columns={columns} />
      )}

      {modalState?.type === 'close-batch-results' && (
        <CloseReviewResults receipt={modalState.receipt} columns={columns} />
      )}

      {modalState?.type === 'rename' && (
        <RenameModal
          target={modalState.target}
          initialValue={modalInputValue}
          columns={columns}
          textareaRef={modalTextareaRef}
          onContentChange={() => syncTextareaValue(modalTextareaRef, setModalInputValue)}
        />
      )}

      {modalState?.type === 'commands' && (
        <CommandsModal
          columns={columns}
          rows={rows}
          entries={filteredCommandEntries}
          cursor={commandsCursor}
          searchQuery={commandsSearchQuery}
          textareaRef={commandsSearchTextareaRef}
          onContentChange={() =>
            syncTextareaValue(commandsSearchTextareaRef, setCommandsSearchQuery)
          }
        />
      )}

      {modalState?.type === 'settings' && (
        <SettingsModal
          configPath={configPath}
          columns={columns}
          rows={rows}
          entries={filteredSettingsEntries}
          cursor={settingsCursor}
          searchQuery={settingsSearchQuery}
          picker={modalState.picker}
          textareaRef={settingsSearchTextareaRef}
          onContentChange={() =>
            syncTextareaValue(settingsSearchTextareaRef, setSettingsSearchQuery)
          }
        />
      )}

      {modalState?.type === 'setting-options' && (
        <SettingOptionsModal
          title={getSettingEditorTitle(modalState.field)}
          description="Select an option to apply it immediately"
          columns={columns}
          rows={rows}
          options={filteredSettingOptions}
          savedValue={savedSettingOption}
          cursor={settingOptionsCursor}
          searchQuery={settingOptionsSearchQuery}
          picker={modalState.picker}
          textareaRef={settingOptionsSearchTextareaRef}
          onContentChange={() =>
            syncTextareaValue(settingOptionsSearchTextareaRef, setSettingOptionsSearchQuery)
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
          onContentChange={() => syncTextareaValue(settingEditorTextareaRef, setSettingEditorValue)}
        />
      )}

      {modalState?.type === 'setting-list' && settingPane.model && (
        <SettingListModal
          model={settingPane.model}
          columns={columns}
          rows={rows}
          draft={settingFieldDraft}
          textareaRef={settingFieldTextareaRef}
          onContentChange={() => syncTextareaValue(settingFieldTextareaRef, setSettingFieldDraft)}
        />
      )}
    </>
  )
}
