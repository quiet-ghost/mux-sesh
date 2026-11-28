import type { MixedSearchResult } from '@ff-labs/fff-bun'
import type { NativeFileSearch, NativeFinder, NativeResult } from '../../src/search/fff'

export interface FakeFinder extends NativeFinder {
  readonly root: string
  readonly searches: string[]
  readonly pageSizes: number[]
  destroyed: number
  searchesAfterDestroy: number
}

export interface FakeNativeOptions {
  // Scans stay pending until releaseScans() so tests can act during the scan wait.
  readonly holdScans?: boolean
  // Busy time spent inside the synchronous mixedSearch call.
  readonly searchCostMs?: number
}

export interface FakeNative {
  readonly native: NativeFileSearch
  readonly created: FakeFinder[]
  readonly attempts: string[]
  failNext(root: string, reason: string): void
  releaseScans(): void
  live(): FakeFinder[]
}

function result(root: string, query: string): MixedSearchResult {
  const name = `${query}-${root.split('/').filter(Boolean).join('-')}.md`

  return {
    items: [
      {
        type: 'file',
        item: {
          relativePath: name,
          fileName: name,
          size: 1,
          modified: 0,
          accessFrecencyScore: 0,
          modificationFrecencyScore: 0,
          totalFrecencyScore: 0,
          gitStatus: 'clean',
        },
      },
    ],
    scores: [
      {
        total: 10,
        baseScore: 10,
        filenameBonus: 0,
        specialFilenameBonus: 0,
        frecencyBoost: 0,
        distancePenalty: 0,
        currentFilePenalty: 0,
        comboMatchBoost: 0,
        exactMatch: false,
        matchType: 'fuzzy',
      },
    ],
    totalMatched: 1,
    totalFiles: 1,
    totalDirs: 0,
  }
}

function spin(ms: number): void {
  const end = performance.now() + ms

  while (performance.now() < end) {
    // Stands in for native work that blocks the event loop.
  }
}

export function createFakeNative(options: FakeNativeOptions = {}): FakeNative {
  const created: FakeFinder[] = []
  const attempts: string[] = []
  const failures = new Map<string, string>()
  const heldScans: Array<() => void> = []

  function createFinder(root: string): FakeFinder {
    const finder: FakeFinder = {
      root,
      searches: [],
      pageSizes: [],
      destroyed: 0,
      searchesAfterDestroy: 0,
      mixedSearch(query, searchOptions): NativeResult<MixedSearchResult> {
        if (finder.destroyed > 0) {
          finder.searchesAfterDestroy++

          return { ok: false, error: 'FileFinder instance has been destroyed.' }
        }

        finder.searches.push(query)
        finder.pageSizes.push(searchOptions.pageSize)
        spin(options.searchCostMs ?? 0)

        return { ok: true, value: result(root, query) }
      },
      async waitForScan(): Promise<NativeResult<boolean>> {
        if (options.holdScans) await new Promise<void>(resolve => heldScans.push(resolve))

        return { ok: true, value: true }
      },
      destroy() {
        finder.destroyed++
      },
    }

    return finder
  }

  return {
    created,
    attempts,
    native: {
      kind: 'ready',
      create(root) {
        attempts.push(root)
        const failure = failures.get(root)

        if (failure !== undefined) {
          failures.delete(root)

          return { ok: false, error: failure }
        }

        const finder = createFinder(root)
        created.push(finder)

        return { ok: true, value: finder }
      },
    },
    failNext(root, reason) {
      failures.set(root, reason)
    },
    releaseScans() {
      for (const release of heldScans.splice(0)) release()
    },
    live() {
      return created.filter(finder => finder.destroyed === 0)
    },
  }
}
