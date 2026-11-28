import {
  createSearchSchema,
  labelMatches,
  parseQuery,
  rankValues,
  type SearchKey,
} from '../search/matcher'
import type { SettingsEntry, SettingsOption } from './settings-catalog'

// Title ×1 and keywords ×0.7 are names, so `colors` finds Theme; the value, category and
// description are context.
const SETTINGS_ENTRY_SCHEMA = createSearchSchema<SettingsEntry>([
  { role: 'name', weight: 1, text: entry => entry.title },
  { role: 'name', weight: 0.7, text: entry => entry.keywords },
  { role: 'context', weight: 0.5, text: entry => entry.value },
  { role: 'context', weight: 0.4, text: entry => entry.category },
  { role: 'context', weight: 0.25, text: entry => entry.description },
])

const SETTINGS_OPTION_KEYS: readonly SearchKey<SettingsOption>[] = [
  { role: 'name', weight: 1, text: option => option.label },
  {
    role: 'name',
    weight: 0.75,
    text: option => (option.value === option.label ? '' : option.value),
  },
  { role: 'context', weight: 0.5, text: option => option.description ?? '' },
]

const SETTINGS_OPTION_SCHEMA = createSearchSchema(SETTINGS_OPTION_KEYS)

export function rankSettingsEntries(entries: SettingsEntry[], query: string): SettingsEntry[] {
  if (parseQuery(query).terms.length === 0) return entries

  return rankValues(SETTINGS_ENTRY_SCHEMA, entries, query).map(hit => hit.value)
}

export function rankSettingsOptions(options: SettingsOption[], query: string): SettingsOption[] {
  if (parseQuery(query).terms.length === 0) return options

  return rankValues(SETTINGS_OPTION_SCHEMA, options, query).map(hit => hit.value)
}

export function filterSettingsEntries(entries: SettingsEntry[], query: string): SettingsEntry[] {
  return rankSettingsEntries(entries, query)
}

export function filterSettingsOptions(options: SettingsOption[], query: string): SettingsOption[] {
  return rankSettingsOptions(options, query)
}

export function getSettingsLabelMatches(entry: SettingsEntry, query: string): readonly number[] {
  return labelMatches(SETTINGS_ENTRY_SCHEMA, entry, query)
}

export function getOptionLabelMatches(option: SettingsOption, query: string): readonly number[] {
  return labelMatches(SETTINGS_OPTION_SCHEMA, option, query)
}
