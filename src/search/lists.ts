import type { CommandEntry } from '../app/action-catalog'
import type { SettingsEntry, SettingsOption } from '../settings'
import {
  createSearchSchema,
  parseQuery,
  rankValues,
  type SearchKey,
  type SearchSchema,
} from './matcher'

// Title ×1 and keywords ×0.6 are names; category ×0.5 and keybind ×0.25 are context, so a
// category or keybind match ranks below every title or keyword match.
const COMMAND_SCHEMA = createSearchSchema<CommandEntry>([
  { role: 'name', weight: 1, text: entry => entry.title },
  { role: 'name', weight: 0.6, text: entry => entry.keywords ?? '' },
  { role: 'context', weight: 0.5, text: entry => entry.category },
  { role: 'context', weight: 0.25, text: entry => entry.keybind },
])

const SETTINGS_ENTRY_SCHEMA = createSearchSchema<SettingsEntry>([
  { role: 'name', weight: 1, text: entry => entry.label },
  { role: 'context', weight: 0.5, text: entry => entry.value },
  { role: 'context', weight: 0.5, text: entry => entry.hint },
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

// Ranked best first, then grouped by category in the order each category's best entry appears,
// so the palette's category headings never repeat and the first row is the best match.
export function rankCommandEntries(entries: CommandEntry[], query: string): CommandEntry[] {
  if (parseQuery(query).terms.length === 0) return entries

  const groups = new Map<string, CommandEntry[]>()

  for (const hit of rankValues(COMMAND_SCHEMA, entries, query)) {
    const group = groups.get(hit.value.category)

    if (group) group.push(hit.value)
    else groups.set(hit.value.category, [hit.value])
  }

  return [...groups.values()].flat()
}

export function rankSettingsEntries(entries: SettingsEntry[], query: string): SettingsEntry[] {
  if (parseQuery(query).terms.length === 0) return entries

  return rankValues(SETTINGS_ENTRY_SCHEMA, entries, query).map(hit => hit.value)
}

export function rankSettingsOptions(options: SettingsOption[], query: string): SettingsOption[] {
  if (parseQuery(query).terms.length === 0) return options

  return rankValues(SETTINGS_OPTION_SCHEMA, options, query).map(hit => hit.value)
}

// Label match positions for one visible row, from the same schema and query that ranked it.
function labelMatches<T extends object>(
  schema: SearchSchema<T>,
  value: T,
  query: string
): readonly number[] {
  if (parseQuery(query).terms.length === 0) return []

  return rankValues(schema, [value], query)[0]?.positions[0] ?? []
}

export function getCommandLabelMatches(entry: CommandEntry, query: string): readonly number[] {
  return labelMatches(COMMAND_SCHEMA, entry, query)
}

export function getSettingsLabelMatches(entry: SettingsEntry, query: string): readonly number[] {
  return labelMatches(SETTINGS_ENTRY_SCHEMA, entry, query)
}

export function getOptionLabelMatches(option: SettingsOption, query: string): readonly number[] {
  return labelMatches(SETTINGS_OPTION_SCHEMA, option, query)
}
