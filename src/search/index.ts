import { basename } from 'path'
import type { Item, SearchMatchMetadata } from '../items/item'
import {
  createSearchSchema,
  createSearchSession,
  rankValues,
  type PrepareTarget,
  type SearchHit,
  type SearchKey,
  type SearchRanking,
  type SearchSchema,
  type SearchTier,
} from './matcher'

// Every query re-reads each key to notice renamed rows; memoizing the basename keeps that cheap.
const BASENAME_CACHE_LIMIT = 20_000
const basenames = new Map<string, string>()

function pathBasename(path: string): string {
  const cached = basenames.get(path)

  if (cached !== undefined) return cached

  if (basenames.size >= BASENAME_CACHE_LIMIT) basenames.clear()

  const name = basename(path)
  basenames.set(path, name)

  return name
}

// Title ×1, path basename ×0.75 (only when it differs from the title), context ×0.25.
// Positions come back in this key order; the title and context are the strings the lists render.
const TITLE_KEY = 0
const CONTEXT_KEY = 2

const ITEM_KEYS: readonly SearchKey<Item>[] = [
  { role: 'name', weight: 1, text: item => item.title },
  {
    role: 'name',
    weight: 0.75,
    text: item => {
      const name = pathBasename(item.path)

      return name === item.title ? '' : name
    },
  },
  { role: 'context', weight: 0.25, text: item => item.desc },
]

const PINNED_LIFT = 1.15
const LIVE_LIFT = 1.05
const ATTACHED_LIFT = 1.05

// A native file result loses an equal match to a project or session.
const FILE_LIFT = 0.9

function itemLift(item: Item): number {
  const live = item.isSession || item.linkedSessionName !== undefined
  const attached = item.isAttached === true || item.linkedSessionAttached === true

  return (
    (item.isPinned ? PINNED_LIFT : 1) *
    (live ? LIVE_LIFT : 1) *
    (attached ? ATTACHED_LIFT : 1) *
    (item.itemKind === 'file' ? FILE_LIFT : 1)
  )
}

const ITEM_SCHEMA = createSearchSchema(ITEM_KEYS)

function withSearchMatch(item: Item, searchMatch?: SearchMatchMetadata): Item {
  if (!searchMatch || (!searchMatch.titleIndices && !searchMatch.descIndices)) {
    if (!item.searchMatch) {
      return item
    }

    const { searchMatch: _searchMatch, ...itemWithoutSearchMatch } = item

    return itemWithoutSearchMatch
  }

  return {
    ...item,
    searchMatch,
  }
}

export interface RankedItem {
  readonly item: Item
  readonly tier: SearchTier
  readonly score: number
}

function toRankedItem(schema: SearchSchema<Item>, hit: SearchHit<Item>): RankedItem {
  const title = hit.positions[TITLE_KEY] ?? []
  const context = hit.positions[CONTEXT_KEY] ?? []

  const searchMatch: SearchMatchMetadata = {}

  if (title.length > 0) searchMatch.titleIndices = [...title]

  if (context.length > 0) searchMatch.descIndices = [...context]

  const item = withSearchMatch(hit.value, searchMatch)

  schema.share(item, hit.value)

  return { item, tier: hit.tier, score: hit.score }
}

export interface ItemSearchOptions {
  // Frecency hook: a per-item boost ≥ 0 applied as `score × (1 + boost)`.
  readonly boost?: (item: Item) => number
  // Test seam: counts or replaces how searchable strings are prepared.
  readonly prepare?: PrepareTarget
}

function itemRanking(options: ItemSearchOptions): SearchRanking<Item> {
  return options.boost ? { lift: itemLift, boost: options.boost } : { lift: itemLift }
}

function itemSchema(options: ItemSearchOptions): SearchSchema<Item> {
  return options.prepare ? createSearchSchema(ITEM_KEYS, options.prepare) : ITEM_SCHEMA
}

export function clearMatchIndices(items: Item[]): Item[] {
  return items.map(item => withSearchMatch(item))
}

// Best match first, one flat list; each row keeps its kind and section fields.
export function rankItems(
  items: Item[],
  query: string,
  options: ItemSearchOptions = {}
): RankedItem[] {
  const schema = itemSchema(options)

  return rankValues(schema, items, query, itemRanking(options)).map(hit =>
    toRankedItem(schema, hit)
  )
}

export type ItemFilter = (items: Item[], query: string) => Item[]

export function filterAndSortItems(
  items: Item[],
  query: string,
  options: ItemSearchOptions = {}
): Item[] {
  if (!query.trim()) {
    return clearMatchIndices(items)
  }

  return rankItems(items, query, options).map(ranked => ranked.item)
}

// A filter that refines its previous result while the source list stays the same and the query grows.
export function createItemFilter(options: ItemSearchOptions = {}): ItemFilter {
  const schema = itemSchema(options)
  const session = createSearchSession(schema, itemRanking(options))

  return (items, query) => {
    const hits = session.search(items, query)

    if (!query.trim()) return clearMatchIndices(items)

    return hits.map(hit => toRankedItem(schema, hit).item)
  }
}
