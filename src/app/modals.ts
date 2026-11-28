import type { Dispatch, SetStateAction } from 'react'
import type { OperationReport } from './action-outcome'
import type { CleanupBatch, CloseReceipt } from '../sessions/cleanup-batch'
import { OptionPicker } from './option-picker'
import type { SettingListPane, SettingPane, SettingRulesPane } from './setting-panes'
import {
  getSettingEditorValue,
  isFormSetting,
  isJsonSetting,
  type SettingsFieldId,
} from '../settings/settings-catalog'
import type { IconKind, IconsFormRow } from '../settings/settings-icons'
import type { Config, Item } from '../types'

export type ModalState =
  | { type: 'rename'; target: string }
  | { type: 'commands' }
  | { type: 'settings'; picker: OptionPicker }
  | {
      type: 'setting-options'
      field: SettingsFieldId
      openedFrom: 'commands' | 'settings'
      picker: OptionPicker
    }
  | { type: 'setting-editor'; field: SettingsFieldId }
  | SettingPane
  // `from` is the list or rule list pane whose "Edit as JSON…" row opened it; leaving goes back
  // there, or to Settings when it was opened from Settings.
  | { type: 'setting-json'; field: SettingsFieldId; from: JsonEditorOrigin }
  | { type: 'icons-form'; row: IconsFormRow; mode: IconsFormMode }
  | { type: 'outcome'; report: OperationReport }
  | { type: 'close-batch-review'; batch: CleanupBatch }
  | { type: 'close-batch-results'; receipt: CloseReceipt }
  | null

export type JsonEditorOrigin = SettingListPane | SettingRulesPane | undefined

function jsonEditorOrigin(current: ModalState): JsonEditorOrigin {
  return current?.type === 'setting-list' || current?.type === 'setting-rules' ? current : undefined
}

// Where the raw JSON editor goes back to: the pane that opened it, or the same Settings row.
export function leaveJsonEditor(current: ModalState): ModalState {
  if (current?.type === 'setting-json' && current.from) return current.from

  return { type: 'settings', picker: OptionPicker.browsing }
}

// A glyph saves when it is applied; while a save runs, no other change starts.
export type IconsFormMode =
  | { readonly kind: 'browsing' }
  | { readonly kind: 'editing'; readonly icon: IconKind }
  | { readonly kind: 'saving' }

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
  setRenameTarget: Dispatch<SetStateAction<Item | null>>,
  setModalInputValue: Dispatch<SetStateAction<string>>,
  setModalState: Dispatch<SetStateAction<ModalState>>
) {
  setRenameTarget(item)
  setModalInputValue(item.title)
  setModalState({ type: 'rename', target: item.title })
}

export function openCommandsModal(
  setCommandsSearchQuery: Dispatch<SetStateAction<string>>,
  setCommandsCursor: Dispatch<SetStateAction<number>>,
  setModalState: Dispatch<SetStateAction<ModalState>>
) {
  setCommandsSearchQuery('')
  setCommandsCursor(0)
  setModalState({ type: 'commands' })
}

export function openSettingsModal(
  config: Config | null,
  setSettingEditorError: Dispatch<SetStateAction<string>>,
  setSettingsSearchQuery: Dispatch<SetStateAction<string>>,
  setSettingsCursor: Dispatch<SetStateAction<number>>,
  setModalState: Dispatch<SetStateAction<ModalState>>
) {
  if (!config) {
    return
  }

  setSettingEditorError('')
  setSettingsSearchQuery('')
  setSettingsCursor(0)
  setModalState({ type: 'settings', picker: OptionPicker.browsing })
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

// The one way into a setting's editor: lists and rules open the raw JSON view, Icons its form, and
// other settings a one-line field. List editors' "Edit as JSON…" rows open it here too.
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

  if (isFormSetting(field)) {
    setModalState({ type: 'icons-form', row: 'enabled', mode: { kind: 'browsing' } })

    return
  }

  setSettingEditorValue(getSettingEditorValue(config, field))

  if (isJsonSetting(field)) {
    setModalState(current => ({ type: 'setting-json', field, from: jsonEditorOrigin(current) }))

    return
  }

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
