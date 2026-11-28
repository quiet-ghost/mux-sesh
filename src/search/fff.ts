import { basename, join } from 'path'
import { homedir } from 'os'
import type { MixedSearchResult } from '@ff-labs/fff-bun'
import { rankItems } from './index'
import type { Config, Item } from '../types'

declare global {
  // Build-time constant used by @ff-labs/fff-bun for compiled binaries.
  const FFF_LIBC: 'gnu' | 'musl'
}

import { getExistingProjectRoots, uniqueNormalizedPaths } from '../projects/discovery'
import { getPathContextLabel } from '../util/path-display'

const DEFAULT_RESULT_LIMIT = 60
const SCAN_WAIT_TIMEOUT_MS = 1500

interface ScoredItem {
  item: Item
  score: number
}

type FffModule = typeof import('@ff-labs/fff-bun')

export class FileSearchUnavailableError extends Error {
  readonly _tag = 'FileSearchUnavailableError'

  constructor(reason: string, options?: ErrorOptions) {
    super(reason, options)
    this.name = 'FileSearchUnavailableError'
  }
}

// Expected native search failures; programming errors and non-Error throws are defects.
export function isFileSearchFailure(cause: unknown): cause is Error {
  return (
    cause instanceof Error &&
    !(cause instanceof TypeError) &&
    !(cause instanceof ReferenceError) &&
    !(cause instanceof SyntaxError) &&
    !(cause instanceof RangeError)
  )
}

export type NativeResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string }

// One root's native finder. `mixedSearch` is synchronous: nothing can cancel it once called.
export interface NativeFinder {
  mixedSearch(
    query: string,
    options: { readonly pageSize: number }
  ): NativeResult<MixedSearchResult>
  waitForScan(timeoutMs: number): Promise<NativeResult<boolean>>
  destroy(): void
}

export type NativeFileSearch =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'unavailable'; readonly failure: FileSearchUnavailableError }
  | { readonly kind: 'ready'; readonly create: (root: string) => NativeResult<NativeFinder> }

function isFileSearchDisabled(): boolean {
  const flag = process.env.MUX_SESH_DISABLE_FFF?.toLowerCase()

  return flag === '1' || flag === 'true'
}

async function importNativeFileSearch(): Promise<NativeFileSearch> {
  if (isFileSearchDisabled()) return { kind: 'disabled' }

  let loaded: FffModule

  try {
    loaded = await import('@ff-labs/fff-bun')
  } catch (cause) {
    return {
      kind: 'unavailable',
      failure: new FileSearchUnavailableError('the native library could not be loaded', { cause }),
    }
  }

  if (!loaded.FileFinder.isAvailable()) {
    return {
      kind: 'unavailable',
      failure: new FileSearchUnavailableError(
        'the native library is not available on this platform'
      ),
    }
  }

  return {
    kind: 'ready',
    create: root =>
      loaded.FileFinder.create({
        basePath: root,
        disableMmapCache: true,
        disableContentIndexing: true,
        enableHomeDirScanning: root === homedir(),
      }),
  }
}

let nativeFileSearch: Promise<NativeFileSearch> | undefined

// The native library loads once per process; disabled and unavailable stay explicit outcomes.
export function loadNativeFileSearch(): Promise<NativeFileSearch> {
  nativeFileSearch ??= importNativeFileSearch()

  return nativeFileSearch
}

export function mapMixedResultToScoredItems(root: string, result: MixedSearchResult): ScoredItem[] {
  return result.items.flatMap((mixed, index): ScoredItem[] => {
    const score = result.scores[index]?.total ?? 0

    if (mixed.type === 'file') {
      const path = join(root, mixed.item.relativePath)

      return [
        {
          score,
          item: {
            title: mixed.item.fileName,
            desc: getPathContextLabel(path),
            path,
            isSession: false,
            itemKind: 'file' as const,
          },
        },
      ]
    }

    const relative = mixed.item.relativePath.replace(/[\\/]+$/, '')

    if (!relative) {
      return []
    }

    const path = join(root, relative)

    return [
      {
        score,
        item: {
          title: basename(path),
          desc: getPathContextLabel(path),
          path,
          isSession: false,
          itemKind: 'project' as const,
        },
      },
    ]
  })
}

export function mergeScoredItems(results: ScoredItem[][], limit: number): Item[] {
  const seenPaths = new Set<string>()

  return results
    .flat()
    .sort(
      (left, right) => right.score - left.score || left.item.path.length - right.item.path.length
    )
    .flatMap(scored => {
      if (seenPaths.has(scored.item.path)) {
        return []
      }

      seenPaths.add(scored.item.path)

      return [scored.item]
    })
    .slice(0, limit)
}

// Native results are re-ranked by the shared matcher on the same strings the rows render, so
// local and native rows share one scale: a local row wins its path, file rows take FILE_LIFT,
// and equal scores keep local rows first, then native order. Rows only fff matched (typos)
// follow every matched row in native order, without highlights.
export function combineFileSearchResults(
  fileSearchItems: Item[],
  localItems: Item[],
  query: string
): Item[] {
  if (fileSearchItems.length === 0) {
    return localItems
  }

  const localPaths = new Set(localItems.map(item => item.path))
  const newFileSearchItems = fileSearchItems.filter(item => !localPaths.has(item.path))
  const ranked = rankItems([...localItems, ...newFileSearchItems], query)
  const rankedPaths = new Set(ranked.map(result => result.item.path))
  const typoOnlyItems = newFileSearchItems.filter(item => !rankedPaths.has(item.path))

  return [...ranked.map(result => result.item), ...typoOnlyItems]
}

export class FileSearchFailedError extends Error {
  readonly _tag = 'FileSearchFailedError'

  constructor(reason: string) {
    super(reason)
    this.name = 'FileSearchFailedError'
  }
}

export type FileSearchOutcome =
  | { readonly kind: 'found'; readonly items: Item[]; readonly nativeMs: number }
  | { readonly kind: 'disabled' }
  | { readonly kind: 'failed'; readonly failure: Error }
  | { readonly kind: 'disposed' }

export interface FileSearchScope {
  // Loads the native library only; root finders open on the first explicit query.
  warm(): Promise<void>
  search(query: string, config: Config): Promise<FileSearchOutcome>
  dispose(): void
}

export interface FileSearchScopeDependencies {
  readonly load: () => Promise<NativeFileSearch>
  readonly roots: (config: Config) => Promise<string[]>
  readonly limit: number
  readonly scanWaitMs: number
}

const FILE_SEARCH_SCOPE_DEPENDENCIES: FileSearchScopeDependencies = {
  load: loadNativeFileSearch,
  roots: config => getExistingProjectRoots(uniqueNormalizedPaths(config.projectPaths)),
  limit: DEFAULT_RESULT_LIMIT,
  scanWaitMs: SCAN_WAIT_TIMEOUT_MS,
}

type RootSearch =
  | { readonly kind: 'found'; readonly items: ScoredItem[]; readonly nativeMs: number }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'released' }

interface OwnedFinder {
  readonly finder: NativeFinder
  readonly scanned: Promise<NativeResult<boolean>>
}

const DISPOSED: FileSearchOutcome = { kind: 'disposed' }

// Owns at most one native finder per configured root. Finders open on the first explicit query,
// failed starts are never cached, and dispose destroys each owned finder exactly once.
export function createFileSearchScope(
  dependencies: FileSearchScopeDependencies = FILE_SEARCH_SCOPE_DEPENDENCIES
): FileSearchScope {
  const owned = new Map<string, OwnedFinder>()
  let disposed = false

  function release(root: string): void {
    const entry = owned.get(root)

    if (!entry) return

    owned.delete(root)
    entry.finder.destroy()
  }

  function open(
    create: (root: string) => NativeResult<NativeFinder>,
    root: string
  ): NativeResult<OwnedFinder> {
    const existing = owned.get(root)

    if (existing) return { ok: true, value: existing }

    const created = create(root)

    if (!created.ok) return created

    const entry = {
      finder: created.value,
      scanned: created.value.waitForScan(dependencies.scanWaitMs),
    }

    owned.set(root, entry)

    return { ok: true, value: entry }
  }

  async function searchRoot(
    create: (root: string) => NativeResult<NativeFinder>,
    root: string,
    query: string
  ): Promise<RootSearch> {
    const opened = open(create, root)

    if (!opened.ok) {
      return { kind: 'failed', reason: `the finder for ${root} could not start (${opened.error})` }
    }

    const entry = opened.value

    try {
      await entry.scanned
    } catch (cause) {
      if (!isFileSearchFailure(cause)) throw cause

      if (owned.get(root) === entry) release(root)

      return { kind: 'failed', reason: `the finder for ${root} could not scan (${cause.message})` }
    }

    // Released while scanning: the scope was disposed or a newer search dropped this root.
    if (disposed || owned.get(root) !== entry) return { kind: 'released' }

    const started = performance.now()
    const result = entry.finder.mixedSearch(query, { pageSize: dependencies.limit })
    const nativeMs = performance.now() - started

    if (!result.ok) {
      return { kind: 'failed', reason: `the search in ${root} failed (${result.error})` }
    }

    return { kind: 'found', items: mapMixedResultToScoredItems(root, result.value), nativeMs }
  }

  return {
    async warm() {
      if (!disposed) await dependencies.load()
    },

    async search(query, config) {
      const trimmed = query.trim()

      if (disposed) return DISPOSED

      if (!trimmed) return { kind: 'found', items: [], nativeMs: 0 }

      const native = await dependencies.load()

      if (disposed) return DISPOSED

      if (native.kind === 'disabled') return { kind: 'disabled' }

      if (native.kind === 'unavailable') return { kind: 'failed', failure: native.failure }

      const roots = await dependencies.roots(config)

      if (disposed) return DISPOSED

      const configured = new Set(roots)

      for (const root of owned.keys()) {
        if (!configured.has(root)) release(root)
      }

      const searches = await Promise.all(
        roots.map(root => searchRoot(native.create, root, trimmed))
      )

      if (disposed) return DISPOSED

      const found = searches.flatMap(search => (search.kind === 'found' ? [search] : []))
      const reasons = searches.flatMap(search => (search.kind === 'failed' ? [search.reason] : []))

      if (found.length === 0 && reasons.length > 0) {
        return { kind: 'failed', failure: new FileSearchFailedError(reasons.join('; ')) }
      }

      return {
        kind: 'found',
        items: mergeScoredItems(
          found.map(search => search.items),
          dependencies.limit
        ),
        nativeMs: found.reduce((total, search) => total + search.nativeMs, 0),
      }
    },

    dispose() {
      disposed = true

      for (const root of owned.keys()) release(root)
    },
  }
}
