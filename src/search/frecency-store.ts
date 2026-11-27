import { appendFile, mkdir, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import * as Schema from 'effect/Schema'
import { getOpenHistoryPath } from '../config/paths'
import type { Item } from '../types'
import { mark } from '../util/perf'
import { FrecencyHistory, OpenKey } from './frecency'

// An open is recorded before the picker hands the terminal over, so a slow disk can delay it by
// this much at most; the open itself never waits on, or fails because of, its record.
export const OPEN_HISTORY_TIMEOUT_MS = 250

export type RecordOutcome =
  | { readonly kind: 'recorded' }
  | { readonly kind: 'off' }
  | { readonly kind: 'failed'; readonly reason: string }

export interface OpenHistoryServices {
  readonly path: () => string
  readonly now: () => number
  readonly timeoutMs: number
  // Expected I/O failures: the picker exits right after an open, so a toast would never be seen.
  readonly report: (message: string) => void
}

export interface OpenHistory {
  // Follows config; until configured on, nothing is read, written or ranked.
  configure(enabled: boolean): void
  // Reads the file at most once; never rejects for an expected I/O failure.
  load(): Promise<void>
  boost(item: Item): number
  record(keys: readonly OpenKey[]): Promise<RecordOutcome>
}

type Snapshot =
  | {
      readonly kind: 'ready'
      readonly history: FrecencyHistory
      readonly boosts: ReadonlyMap<OpenKey, number>
    }
  | { readonly kind: 'unavailable'; readonly reason: string }

// An errno failure from the filesystem is expected; anything else is a defect and propagates.
const isFileSystemError = Schema.is(
  Schema.Struct({
    code: Schema.String.check(Schema.isPattern(/^E[A-Z0-9]+$/)),
    message: Schema.String,
  })
)

export function createOpenHistory(services: OpenHistoryServices): OpenHistory {
  let enabled = false
  let file: string | undefined
  let loading: Promise<Snapshot> | undefined
  let current: Snapshot | undefined
  let writes: Promise<unknown> = Promise.resolve()
  const itemKeys = new WeakMap<Item, readonly OpenKey[]>()

  function path(): string {
    file ??= services.path()

    return file
  }

  function ready(history: FrecencyHistory): Snapshot {
    return { kind: 'ready', history, boosts: FrecencyHistory.boosts(history, services.now()) }
  }

  async function compact(history: FrecencyHistory): Promise<FrecencyHistory> {
    const compacted = FrecencyHistory.compact(history)
    const target = path()
    const temporary = `${target}.${process.pid}.tmp`

    try {
      await writeFile(temporary, compacted.text, { mode: 0o600 })
      // Rename is atomic on one filesystem: a crash leaves either the old file or the new one.
      await rename(temporary, target)
    } catch (cause) {
      if (!isFileSystemError(cause)) throw cause

      services.report(
        `could not compact ${target}: ${cause.message}; it keeps growing until the next start`
      )

      return history
    }

    return compacted.history
  }

  async function read(): Promise<Snapshot> {
    let text: string

    try {
      text = await Bun.file(path()).text()
    } catch (cause) {
      if (!isFileSystemError(cause)) throw cause

      if (cause.code === 'ENOENT') return ready(FrecencyHistory.empty)

      // Appending without the earlier counts would reset them, so nothing is written this run.
      const reason = `could not read ${path()}: ${cause.message}`
      services.report(`${reason}; search history is off until the next start`)

      return { kind: 'unavailable', reason }
    }

    const history = FrecencyHistory.parse(text)

    return ready(FrecencyHistory.needsCompaction(history) ? await compact(history) : history)
  }

  async function loaded(): Promise<Snapshot> {
    loading ??= read().then(snapshot => {
      current = snapshot

      return snapshot
    })

    return loading
  }

  async function append(keys: readonly OpenKey[]): Promise<RecordOutcome> {
    const snapshot = await loaded()

    if (snapshot.kind === 'unavailable') return { kind: 'failed', reason: snapshot.reason }

    const next = FrecencyHistory.record(snapshot.history, keys, services.now())
    const target = path()

    try {
      await mkdir(dirname(target), { recursive: true, mode: 0o700 })
      await appendFile(target, next.appended, { mode: 0o600 })
    } catch (cause) {
      if (!isFileSystemError(cause)) throw cause

      const reason = `could not write ${target}: ${cause.message}`
      services.report(`${reason}; this open was not recorded`)

      return { kind: 'failed', reason }
    }

    current = ready(next.history)
    loading = Promise.resolve(current)

    return { kind: 'recorded' }
  }

  async function bounded(work: Promise<RecordOutcome>): Promise<RecordOutcome> {
    let timer: ReturnType<typeof setTimeout> | undefined

    const timeout = new Promise<RecordOutcome>(resolve => {
      timer = setTimeout(() => {
        const reason = `recording took longer than ${services.timeoutMs}ms`
        services.report(`${reason}; the open went ahead without waiting`)
        resolve({ kind: 'failed', reason })
      }, services.timeoutMs)
    })

    try {
      return await Promise.race([work, timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  function keysOf(item: Item): readonly OpenKey[] {
    let keys = itemKeys.get(item)

    if (!keys) {
      keys = OpenKey.ofItem(item)
      itemKeys.set(item, keys)
    }

    return keys
  }

  return {
    configure(next) {
      enabled = next
    },

    async load() {
      if (enabled) await loaded()
    },

    boost(item) {
      if (!enabled || current?.kind !== 'ready') return 0

      let best = 0

      for (const key of keysOf(item)) best = Math.max(best, current.boosts.get(key) ?? 0)

      return best
    },

    async record(keys) {
      if (!enabled) return { kind: 'off' }

      if (keys.length === 0) return { kind: 'recorded' }

      // One write at a time, so two opens cannot both count from the same earlier frequency.
      const work = writes.then(() => append(keys))
      // Only orders the next write; this caller still receives this write's own failure.
      writes = work.catch(() => undefined)

      return bounded(work)
    },
  }
}

export const OPEN_HISTORY: OpenHistory = createOpenHistory({
  path: () => getOpenHistoryPath(),
  now: Date.now,
  timeoutMs: OPEN_HISTORY_TIMEOUT_MS,
  report: message => mark(`openHistory: ${message}`),
})
