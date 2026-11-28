import { getDefaultConfig } from '../config'
import type { Config } from '../types'
import {
  controlOf,
  displayValue,
  formatJSON,
  getSetting,
  isJsonEdited,
  resetOf,
  SETTINGS_LIST,
  storedValue,
  type SettingsEntry,
  type SettingsFieldId,
  type SettingsOption,
} from './settings-catalog'

export function getSettingsEntries(config: Config, homeDir: string): SettingsEntry[] {
  const defaults = getDefaultConfig(homeDir)

  return SETTINGS_LIST.map(setting => ({
    id: setting.id,
    title: setting.title,
    category: setting.category,
    description: setting.description,
    keywords: setting.keywords.join(' '),
    value: displayValue(setting, config),
    control: controlOf(setting, config),
    reset: resetOf(setting, config, defaults),
  }))
}

export function getSettingEditorValue(config: Config, field: SettingsFieldId): string {
  const setting = getSetting(field)

  switch (setting.kind) {
    case 'text':
      return setting.read(config)
    case 'json':
    case 'list':
    case 'rules':
      return formatJSON(config, setting.key, setting.read(config))
    case 'picker':
      return setting.custom ? setting.read(config) : ''
    case 'choice':
    case 'number':
    case 'form':
      return ''
  }
}

const EDITOR_DESCRIPTION = 'Edit value and press Enter to apply immediately'

export function getSettingEditorDescription(field: SettingsFieldId): string {
  const setting = getSetting(field)

  return setting.kind === 'picker' && setting.custom
    ? setting.custom.description
    : EDITOR_DESCRIPTION
}

export function getSettingOptions(config: Config, field: SettingsFieldId): SettingsOption[] {
  const setting = getSetting(field)

  return setting.kind === 'choice' || setting.kind === 'picker' ? setting.options(config) : []
}

// The stored value: an option value for choices, so it matches the picker's options.
export function getSettingValue(config: Config, field: SettingsFieldId): string {
  const setting = getSetting(field)

  return isJsonEdited(setting) || setting.kind === 'form'
    ? setting.summary(config)
    : storedValue(setting, config)
}

// The value as the Settings row shows it.
export function getSettingDisplayValue(config: Config, field: SettingsFieldId): string {
  return displayValue(getSetting(field), config)
}

export function getSelectedOptionIndex(config: Config, field: SettingsFieldId): number {
  const current = getSettingValue(config, field)

  return Math.max(
    0,
    getSettingOptions(config, field).findIndex(option => option.value === current)
  )
}
