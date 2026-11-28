import { createSearchSchema, labelMatches, parseQuery, rankValues } from '../search/matcher'
import type { CommandEntry } from './action-catalog'

// Title ×1 and keywords ×0.6 are names; category ×0.5 and keybind ×0.25 are context, so a
// category or keybind match ranks below every title or keyword match.
const COMMAND_SCHEMA = createSearchSchema<CommandEntry>([
  { role: 'name', weight: 1, text: entry => entry.title },
  { role: 'name', weight: 0.6, text: entry => entry.keywords ?? '' },
  { role: 'context', weight: 0.5, text: entry => entry.category },
  { role: 'context', weight: 0.25, text: entry => entry.keybind },
])

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

export function getCommandLabelMatches(entry: CommandEntry, query: string): readonly number[] {
  return labelMatches(COMMAND_SCHEMA, entry, query)
}
