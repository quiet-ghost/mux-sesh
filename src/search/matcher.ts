import fuzzysort, { type Prepared, type Result } from 'fuzzysort'

// One fuzzysort-backed matcher for every searchable list.
//
// Each space-separated term must match at least one key (AND). A term's score is the best
// `fuzzysort score × key weight` over the keys; a row's score is the mean over its terms.
// Rows where some term matched a `name` key form the `name` tier. Rows that only match through
// `context` keys (paths, categories, hints) form the `context` tier, which always ranks below the
// name tier and only accepts queries of 3+ characters whose every term is a substring of the
// context: short or scattered subsequences match almost any path, so they would hide nothing.
//
// Score lifts are multiplicative so a lift never overrides a much better match:
// exact name ×2, name prefix ×1.5, a list-specific `lift`, and `× (1 + boost)` for frecency.
// Ties keep the source order.

export type SearchKeyRole = 'name' | 'context'

export interface SearchKey<T> {
  readonly role: SearchKeyRole
  readonly weight: number
  // An empty string means the value has no text for this key.
  readonly text: (value: T) => string
}

export type SearchTier = 'name' | 'context'

export interface SearchHit<T> {
  readonly value: T
  readonly order: number
  readonly tier: SearchTier
  readonly score: number
  // Sorted match positions into each key's text, in key order; empty when that key did not win a term.
  readonly positions: readonly (readonly number[])[]
}

export interface SearchRanking<T> {
  // List-specific multiplicative lift, e.g. pinned rows; 1 leaves the score unchanged.
  readonly lift?: (value: T) => number
  // Pluggable relevance boost ≥ 0 such as frecency, applied as `score × (1 + boost)`.
  readonly boost?: (value: T) => number
}

export type PrepareTarget = (text: string) => Prepared

export const EXACT_NAME_LIFT = 2
export const NAME_PREFIX_LIFT = 1.5
export const MIN_CONTEXT_QUERY_LENGTH = 3

interface PreparedEntry {
  readonly texts: string[]
  readonly lowered: string[]
  readonly targets: (Prepared | undefined)[]
}

export interface SearchSchema<T extends object> {
  readonly keys: readonly SearchKey<T>[]
  // Prepared targets for each key, cached per value and refreshed when a key's text changes.
  targets(value: T): readonly (Prepared | undefined)[]
  // Lowercased key texts matching the last `targets` call for this value.
  lowered(value: T): readonly string[]
  // Lets a derived copy with the same searchable text reuse the original's prepared targets.
  share(copy: T, original: T): void
}

export function createSearchSchema<T extends object>(
  keys: readonly SearchKey<T>[],
  prepare: PrepareTarget = text => fuzzysort.prepare(text)
): SearchSchema<T> {
  const cache = new WeakMap<T, PreparedEntry>()

  return {
    keys,

    targets(value) {
      let entry = cache.get(value)

      if (!entry) {
        entry = { texts: [], lowered: [], targets: [] }
        cache.set(value, entry)
      }

      for (let index = 0; index < keys.length; index++) {
        const key = keys[index]

        if (!key) continue

        const text = key.text(value)

        if (index < entry.texts.length && entry.texts[index] === text) continue

        entry.texts[index] = text
        entry.lowered[index] = text.toLowerCase()
        entry.targets[index] = text ? prepare(text) : undefined
      }

      return entry.targets
    },

    lowered(value) {
      return cache.get(value)?.lowered ?? []
    },

    share(copy, original) {
      const entry = cache.get(original)

      if (entry) cache.set(copy, entry)
    },
  }
}

export interface ParsedQuery {
  // Lowercased, trimmed, single-spaced; the refinement cache compares these.
  readonly text: string
  readonly terms: readonly string[]
  readonly length: number
}

export function parseQuery(query: string): ParsedQuery {
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))]

  return {
    text: terms.join(' '),
    terms,
    length: terms.reduce((total, term) => total + term.length, 0),
  }
}

interface TermMatch {
  readonly key: number
  readonly weighted: number
  readonly indexes: readonly number[]
}

interface ValueMatch {
  readonly terms: readonly TermMatch[]
  readonly nameMatched: boolean
}

// Every term must match some key; undefined when one does not.
function matchTerms<T extends object>(
  schema: SearchSchema<T>,
  value: T,
  terms: readonly string[]
): ValueMatch | undefined {
  const targets = schema.targets(value)
  const matches: TermMatch[] = []
  let nameMatched = false

  for (const term of terms) {
    let best: { key: number; weighted: number; result: Result } | undefined

    for (let index = 0; index < targets.length; index++) {
      const target = targets[index]
      const key = schema.keys[index]

      if (!target || !key) continue

      // Scores are at most 1, so this key cannot win; it only matters for the tier.
      if (best && best.weighted >= key.weight && (nameMatched || key.role === 'context')) continue

      const result = fuzzysort.single(term, target)

      if (!result) continue

      if (key.role === 'name') nameMatched = true

      const weighted = result.score * key.weight

      if (!best || weighted > best.weighted) best = { key: index, weighted, result }
    }

    if (!best) return undefined

    // fuzzysort reuses a prepared target's index buffer, so read it before the next term.
    matches.push({ key: best.key, weighted: best.weighted, indexes: best.result.indexes })
  }

  return { terms: matches, nameMatched }
}

function contextMatchAllowed<T extends object>(
  schema: SearchSchema<T>,
  value: T,
  query: ParsedQuery,
  match: ValueMatch
): boolean {
  if (query.length < MIN_CONTEXT_QUERY_LENGTH) return false

  const lowered = schema.lowered(value)

  return match.terms.every((termMatch, index) => {
    const term = query.terms[index]
    const text = lowered[termMatch.key]

    return term !== undefined && text !== undefined && text.includes(term)
  })
}

function nameLift<T extends object>(schema: SearchSchema<T>, value: T, query: ParsedQuery): number {
  const first = query.terms[0] ?? ''
  let lift = 1

  for (const [index, text] of schema.lowered(value).entries()) {
    if (!text || schema.keys[index]?.role !== 'name') continue

    if (text === query.text) return EXACT_NAME_LIFT

    if (text.startsWith(first)) lift = NAME_PREFIX_LIFT
  }

  return lift
}

function toHit<T extends object>(
  schema: SearchSchema<T>,
  value: T,
  order: number,
  query: ParsedQuery,
  match: ValueMatch,
  ranking: SearchRanking<T>
): SearchHit<T> | undefined {
  const tier: SearchTier = match.nameMatched ? 'name' : 'context'

  if (tier === 'context' && !contextMatchAllowed(schema, value, query, match)) return undefined

  const positions = schema.keys.map((_, key) => {
    const [only, ...rest] = match.terms

    if (only && rest.length === 0) return only.key === key ? only.indexes : []

    const indexes = match.terms.flatMap(term => (term.key === key ? term.indexes : []))

    return [...new Set(indexes)].sort((left, right) => left - right)
  })

  const mean = match.terms.reduce((total, term) => total + term.weighted, 0) / match.terms.length
  const lift = tier === 'name' ? nameLift(schema, value, query) : 1
  const boost = Math.max(0, ranking.boost?.(value) ?? 0)
  const score = mean * lift * (ranking.lift?.(value) ?? 1) * (1 + boost)

  return { value, order, tier, score, positions }
}

function compareHits<T>(left: SearchHit<T>, right: SearchHit<T>): number {
  if (left.tier !== right.tier) return left.tier === 'name' ? -1 : 1

  return right.score - left.score || left.order - right.order
}

interface SearchPass<T> {
  // Source indices of every value whose terms all matched, before the context-tier rule.
  readonly matched: number[]
  readonly hits: SearchHit<T>[]
}

function searchIndices<T extends object>(
  schema: SearchSchema<T>,
  source: readonly T[],
  candidates: Iterable<number>,
  query: ParsedQuery,
  ranking: SearchRanking<T>
): SearchPass<T> {
  const matched: number[] = []
  const hits: SearchHit<T>[] = []

  for (const order of candidates) {
    const value = source[order]

    if (value === undefined) continue

    const match = matchTerms(schema, value, query.terms)

    if (!match) continue

    matched.push(order)

    const hit = toHit(schema, value, order, query, match, ranking)

    if (hit) hits.push(hit)
  }

  return { matched, hits: hits.sort(compareHits) }
}

function allIndices(length: number): Iterable<number> {
  return Array.from({ length }, (_, index) => index)
}

function unmatched<T>(source: readonly T[]): SearchHit<T>[] {
  return source.map((value, order) => ({ value, order, tier: 'name', score: 0, positions: [] }))
}

// Stateless ranking. A blank query returns every value in source order.
export function rankValues<T extends object>(
  schema: SearchSchema<T>,
  source: readonly T[],
  query: string,
  ranking: SearchRanking<T> = {}
): SearchHit<T>[] {
  const parsed = parseQuery(query)

  if (parsed.terms.length === 0) return unmatched(source)

  return searchIndices(schema, source, allIndices(source.length), parsed, ranking).hits
}

export interface SearchSession<T> {
  search(source: readonly T[], query: string): SearchHit<T>[]
}

// Ranking with refinement: while the source list keeps its identity and the new query extends
// the previous one, only the previous matches are searched again. Extending a query only adds
// constraints (a longer term is still a subsequence of the shorter one's matches, and a new term
// is one more AND), so the result equals a fresh search.
export function createSearchSession<T extends object>(
  schema: SearchSchema<T>,
  ranking: SearchRanking<T> = {}
): SearchSession<T> {
  let previous: { source: readonly T[]; text: string; matched: number[] } | undefined

  return {
    search(source, query) {
      const parsed = parseQuery(query)

      if (parsed.terms.length === 0) {
        previous = undefined

        return unmatched(source)
      }

      const candidates =
        previous?.source === source && parsed.text.startsWith(previous.text)
          ? previous.matched
          : allIndices(source.length)

      const pass = searchIndices(schema, source, candidates, parsed, ranking)
      previous = { source, text: parsed.text, matched: pass.matched }

      return pass.hits
    },
  }
}
