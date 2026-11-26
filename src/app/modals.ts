import type { Dispatch, SetStateAction } from 'react'
import type { OperationReport } from './action-outcome'
import { OptionPicker } from './option-picker'
import { getSettingEditorValue, type SettingsFieldId } from '../settings'
import type { Config, Item } from '../types'

export type ModalState =
  | { type: 'rename'; target: string }
  | { type: 'commands' }
  | { type: 'settings' }
  | {
      type: 'setting-options'
      field: SettingsFieldId
      openedFrom: 'commands' | 'settings'
      picker: OptionPicker
    }
  | { type: 'setting-editor'; field: SettingsFieldId }
  | { type: 'outcome'; report: OperationReport }
  | null

interface ModalSetters {
  setModalState: Dispatch<SetStateAction<ModalState>>
  setModalInputValue: Dispatch<SetStateAction<string>>
  setCommandsSearchQuery: Dispatch<SetStateAction<string>>
  setCommandsCursor: Dispatch<SetStateAction<number>>
  setSettingsSearchQuery: Dispatch<SetStateAction<string>>
  setSettingsCursor: Dispatch<SetStateAction<number>>
  setSettingOptionsSearchQuery: Dispatch<SetStateAction<string>>
  setSettingOptionsCursor: Dispatch<SetStateAction<number>>
  setSettingEditorValue: Dispatch<SetStateAction<string>>
  setSettingEditorError: Dispatch<SetStateAction<string>>
  setRenameTarget: Dispatch<SetStateAction<Item | null>>
}

export function openRenameModal(
  item: Item,
  clearPendingKill: () => void,
  setRenameTarget: Dispatch<SetStateAction<Item | null>>,
  setModalInputValue: Dispatch<SetStateAction<string>>,
  setModalState: Dispatch<SetStateAction<ModalState>>
) {
  clearPendingKill()
  setRenameTarget(item)
  setModalInputValue(item.title)
  setModalState({ type: 'rename', target: item.title })
}

export function openCommandsModal(
  clearPendingKill: () => void,
  setCommandsSearchQuery: Dispatch<SetStateAction<string>>,
  setCommandsCursor: Dispatch<SetStateAction<number>>,
  setModalState: Dispatch<SetStateAction<ModalState>>
) {
  clearPendingKill()
  setCommandsSearchQuery('')
  setCommandsCursor(0)
  setModalState({ type: 'commands' })
}

export function openSettingsModal(
  config: Config | null,
  clearPendingKill: () => void,
  setSettingEditorError: Dispatch<SetStateAction<string>>,
  setSettingsSearchQuery: Dispatch<SetStateAction<string>>,
  setSettingsCursor: Dispatch<SetStateAction<number>>,
  setModalState: Dispatch<SetStateAction<ModalState>>
) {
  if (!config) {
    return
  }

  clearPendingKill()
  setSettingEditorError('')
  setSettingsSearchQuery('')
  setSettingsCursor(0)
  setModalState({ type: 'settings' })
}

export function openSettingOptions(
  field: SettingsFieldId,
  setSettingOptionsSearchQuery: Dispatch<SetStateAction<string>>,
  setSettingOptionsCursor: Dispatch<SetStateAction<number>>,
  setModalState: Dispatch<SetStateAction<ModalState>>
) {
  setSettingOptionsSearchQuery('')
  setSettingOptionsCursor(0)
  // Escape returns to Settings when opened there; otherwise to the main screen.
  setModalState(current => ({
    type: 'setting-options',
    field,
    openedFrom: current?.type === 'settings' ? 'settings' : 'commands',
    picker: OptionPicker.browsing,
  }))
}

export function openSettingEditor(
  config: Config | null,
  field: SettingsFieldId,
  setSettingEditorError: Dispatch<SetStateAction<string>>,
  setSettingEditorValue: Dispatch<SetStateAction<string>>,
  setModalState: Dispatch<SetStateAction<ModalState>>
) {
  if (!config) {
    return
  }

  setSettingEditorError('')
  setSettingEditorValue(getSettingEditorValue(config, field))
  setModalState({ type: 'setting-editor', field })
}

// Replaces whatever dialog started the action, so completed work is the one thing on screen.
export function openOutcomeModal(
  report: OperationReport,
  setModalState: Dispatch<SetStateAction<ModalState>>
) {
  setModalState({ type: 'outcome', report })
}

export function closeModal(setters: ModalSetters) {
  setters.setModalState(null)
  setters.setModalInputValue('')
  setters.setCommandsSearchQuery('')
  setters.setCommandsCursor(0)
  setters.setSettingsSearchQuery('')
  setters.setSettingOptionsSearchQuery('')
  setters.setSettingEditorValue('')
  setters.setSettingEditorError('')
  setters.setRenameTarget(null)
}
