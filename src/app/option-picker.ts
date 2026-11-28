import type { SetStateAction } from 'react'
import type { ModalState } from './modals'
import {
  getSelectedOptionIndex,
  getSettingOptions,
  type SettingsFieldId,
  type SettingsOption,
} from '../settings/settings-catalog'
import type { Config } from '../types'

// While an option picker is open, the highlighted option is the preview; the saved value lives
// in the config and changes only after a save succeeds.
export type OptionPicker =
  | { readonly kind: 'browsing' }
  | { readonly kind: 'saving'; readonly draft: SettingsOption }
  | { readonly kind: 'save-failed'; readonly draft: SettingsOption; readonly reason: string }

const browsing: OptionPicker = { kind: 'browsing' }

function saving(draft: SettingsOption): OptionPicker {
  return { kind: 'saving', draft }
}

function saveFailed(draft: SettingsOption, reason: string): OptionPicker {
  return { kind: 'save-failed', draft, reason }
}

function draftOf(config: Config, field: SettingsFieldId, value: string): SettingsOption {
  return (
    getSettingOptions(config, field).find(option => option.value === value) ?? {
      value,
      label: value,
    }
  )
}

// A save that finishes after the picker closed or changed field must not reopen or relabel it.
function within(field: SettingsFieldId, picker: OptionPicker): SetStateAction<ModalState> {
  return current =>
    current?.type === 'setting-options' && current.field === field
      ? { ...current, picker }
      : current
}

// A Settings-list save that finishes after Settings closed must not reopen it.
function withinSettings(picker: OptionPicker): SetStateAction<ModalState> {
  return current => (current?.type === 'settings' ? { ...current, picker } : current)
}

function previewedThemeId(
  modalState: ModalState,
  options: readonly SettingsOption[],
  cursor: number
): string | undefined {
  if (modalState?.type !== 'setting-options' || modalState.field !== 'theme') return undefined

  return options[cursor]?.value
}

// Opening highlights the saved value, so the first preview is the theme already on screen.
function openAtSaved(
  config: Config | null,
  open: (field: SettingsFieldId) => void,
  setCursor: (cursor: number) => void
): (field: SettingsFieldId) => void {
  return field => {
    open(field)

    if (config) setCursor(getSelectedOptionIndex(config, field))
  }
}

function notice(picker: OptionPicker): readonly string[] {
  switch (picker.kind) {
    case 'browsing':
      return []
    case 'saving':
      return [`Saving ${picker.draft.label}…`]
    case 'save-failed':
      return [
        picker.reason,
        `${picker.draft.label} is still unsaved. Press Enter to retry, or Esc to discard it.`,
      ]
  }
}

export const OptionPicker = {
  browsing,
  saving,
  saveFailed,
  draftOf,
  within,
  withinSettings,
  previewedThemeId,
  openAtSaved,
  notice,
} as const
