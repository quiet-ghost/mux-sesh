import type { Dispatch, SetStateAction } from 'react'
import { getSettingEditorValue, type SettingsFieldId } from '../settings'
import type { Config } from '../types'

export type ModalState =
  | { type: 'rename'; target: string }
  | { type: 'commands' }
  | { type: 'settings' }
  | { type: 'setting-options'; field: SettingsFieldId }
  | { type: 'setting-editor'; field: SettingsFieldId }
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
  setRenameTarget: Dispatch<SetStateAction<string>>
}

export function openRenameModal(
  sessionName: string,
  clearPendingKill: () => void,
  setRenameTarget: Dispatch<SetStateAction<string>>,
  setModalInputValue: Dispatch<SetStateAction<string>>,
  setModalState: Dispatch<SetStateAction<ModalState>>
) {
  clearPendingKill()
  setRenameTarget(sessionName)
  setModalInputValue(sessionName)
  setModalState({ type: 'rename', target: sessionName })
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
  setModalState({ type: 'setting-options', field })
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

export function closeModal(setters: ModalSetters) {
  setters.setModalState(null)
  setters.setModalInputValue('')
  setters.setCommandsSearchQuery('')
  setters.setCommandsCursor(0)
  setters.setSettingsSearchQuery('')
  setters.setSettingOptionsSearchQuery('')
  setters.setSettingEditorValue('')
  setters.setSettingEditorError('')
  setters.setRenameTarget('')
}
