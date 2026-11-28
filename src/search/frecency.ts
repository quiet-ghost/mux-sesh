import { resolve } from 'path'
import * as Schema from 'effect/Schema'
import { isHerdrAgentItem, isLiveSessionItem } from '../multiplexer/items'
import type { BackendKind } from '../multiplexer/types'
import type { Item } from '../items/item'

// What the picker opened, kept as JSON lines: `{ key, frequency, lastOpen }`. Appends only; the
// last line for a key wins. Past FRECENCY_ENTRY_LIMIT lines the file is rewritten with the newest
// FRECENCY_ENTRY_LIMIT entries.

export const FRECENCY_ENTRY_LIMIT = 1000

// Search ranks `score × (1 + boost)`. The boost saturates below this cap, so history reorders rows
// of similar match quality but never lifts a prefix match over an exact name, or an inner match
// over a prefix one: those differ by ×1.4 or more.
export const FRECENCY_BOOST_CAP = 0.4

const DAY_MS = 86_400_000

const FrecencyEntrySchema = Schema.Struct({
  key: Schema.String.check(Schema.isMinLength(1)),
  frequency: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  lastOpen: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
})

export type FrecencyEntry = typeof FrecencyEntrySchema.Type

const isFrecencyEntry = Schema.is(FrecencyEntrySchema)

// A guard over JSON.parse costs a third of a full decode, and startup reads up to 1000 lines.
function parseLine(line: string): FrecencyEntry | undefined {
  let value: unknown

  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }

  return isFrecencyEntry(value) ? value : undefined
}

// A stable name for something the picker opens. Native ids (`$3`, `w12`) change when a server
// restarts, so sessions are named by backend and title, and everything else by its directory.
// Paths are resolved lexically, not through symlinks, so ranking a row never touches the disk.
export type OpenKey = string

function sessionKey(backend: BackendKind, title: string): OpenKey {
  return `session:${backend}:${title}`
}

function pathKey(path: string): OpenKey {
  return `path:${resolve(path)}`
}

export const OpenKey = {
  session: sessionKey,
  path: pathKey,

  // An agent pane counts as its workspace; a project row also counts as the live session it links to.
  ofItem(item: Item): readonly OpenKey[] {
    if (isHerdrAgentItem(item)) return [sessionKey('herdr', item.workspaceTitle ?? item.title)]

    if (isLiveSessionItem(item)) return [sessionKey(item.backend, item.title)]

    const keys = item.path ? [pathKey(item.path)] : []

    if (item.linkedSessionName && item.linkedSessionBackend)
      keys.push(sessionKey(item.linkedSessionBackend, item.linkedSessionName))

    return keys
  },
} as const

export function calculateFrecency(entry: FrecencyEntry, now: number): number {
  const days = Math.max(0, now - entry.lastOpen) / DAY_MS

  return entry.frequency / (1 + days)
}

export function frecencyBoost(frecency: number): number {
  const value = Math.max(0, frecency)

  return (FRECENCY_BOOST_CAP * value) / (value + 1)
}

export interface FrecencyHistory {
  // Latest entry per key, in the order their lines were last written.
  readonly entries: ReadonlyMap<OpenKey, FrecencyEntry>
  // Non-empty lines in the file, valid or not; compaction starts past FRECENCY_ENTRY_LIMIT.
  readonly lines: number
}

const EMPTY: FrecencyHistory = { entries: new Map(), lines: 0 }

function parse(text: string): FrecencyHistory {
  const entries = new Map<OpenKey, FrecencyEntry>()
  let lines = 0

  for (const line of text.split('\n')) {
    if (!line.trim()) continue

    lines++

    const entry = parseLine(line)

    if (!entry) continue

    // Kept as its three fields, so an unknown extra field is never written back.
    entries.delete(entry.key)
    entries.set(entry.key, { key: entry.key, frequency: entry.frequency, lastOpen: entry.lastOpen })
  }

  return { entries, lines }
}

function serializeEntry(entry: FrecencyEntry): string {
  return JSON.stringify({ key: entry.key, frequency: entry.frequency, lastOpen: entry.lastOpen })
}

export interface RecordedOpens {
  readonly history: FrecencyHistory
  // The JSON lines to append, newline-terminated.
  readonly appended: string
}

export interface CompactedHistory {
  readonly history: FrecencyHistory
  // The whole replacement file.
  readonly text: string
}

// One more open of each key at `now`.
function record(history: FrecencyHistory, keys: readonly OpenKey[], now: number): RecordedOpens {
  const entries = new Map(history.entries)
  const lines: string[] = []

  for (const key of new Set(keys)) {
    const entry = { key, frequency: (entries.get(key)?.frequency ?? 0) + 1, lastOpen: now }
    entries.delete(key)
    entries.set(key, entry)
    lines.push(serializeEntry(entry))
  }

  return {
    history: { entries, lines: history.lines + lines.length },
    appended: lines.map(line => `${line}\n`).join(''),
  }
}

function needsCompaction(history: FrecencyHistory): boolean {
  return history.lines > FRECENCY_ENTRY_LIMIT
}

// The newest FRECENCY_ENTRY_LIMIT entries, newest first; keys are unique, so order cannot flip a winner.
function compact(history: FrecencyHistory): CompactedHistory {
  const kept = [...history.entries.values()]
    .sort((left, right) => right.lastOpen - left.lastOpen)
    .slice(0, FRECENCY_ENTRY_LIMIT)

  return {
    history: { entries: new Map(kept.map(entry => [entry.key, entry])), lines: kept.length },
    text: kept.map(entry => `${serializeEntry(entry)}\n`).join(''),
  }
}

function boosts(history: FrecencyHistory, now: number): ReadonlyMap<OpenKey, number> {
  return new Map(
    [...history.entries].map(([key, entry]) => [key, frecencyBoost(calculateFrecency(entry, now))])
  )
}

export const FrecencyHistory = {
  empty: EMPTY,
  parse,
  record,
  needsCompaction,
  compact,
  boosts,
} as const
