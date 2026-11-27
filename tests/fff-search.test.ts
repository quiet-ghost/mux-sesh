import { describe, expect, test } from 'bun:test'
import type { FileItem, MixedSearchResult, Score } from '@ff-labs/fff-bun'
import { getDefaultConfig } from '../src/config'
import {
  combineFileSearchResults,
  createFileSearchScope,
  FileSearchFailedError,
  FileSearchUnavailableError,
  mapMixedResultToScoredItems,
  mergeScoredItems,
  type FileSearchOutcome,
  type NativeFileSearch,
} from '../src/search/fff'
import type { Item } from '../src/types'
import { createFakeNative, type FakeNative } from './fixtures/fake-native-finder'

function makeScore(total: number): Score {
  return {
    total,
    baseScore: total,
    filenameBonus: 0,
    specialFilenameBonus: 0,
    frecencyBoost: 0,
    distancePenalty: 0,
    currentFilePenalty: 0,
    comboMatchBoost: 0,
    exactMatch: false,
    matchType: 'fuzzy',
  }
}

function makeFileItem(relativePath: string, fileName: string): FileItem {
  return {
    relativePath,
    fileName,
    size: 10,
    modified: 0,
    accessFrecencyScore: 0,
    modificationFrecencyScore: 0,
    totalFrecencyScore: 0,
    gitStatus: 'clean',
  }
}

function makeItem(path: string, itemKind: Item['itemKind']): Item {
  return {
    title: path.split('/').filter(Boolean).pop() ?? path,
    desc: '',
    path,
    isSession: false,
    itemKind,
  }
}

describe('fff result mapping', () => {
  test('maps mixed files and directories into mux-sesh items', () => {
    const result: MixedSearchResult = {
      items: [
        { type: 'file', item: makeFileItem('notes/todo.md', 'todo.md') },
        {
          type: 'directory',
          item: { relativePath: 'src/app/', dirName: 'app/', maxAccessFrecency: 0 },
        },
      ],
      scores: [makeScore(120), makeScore(80)],
      totalMatched: 2,
      totalFiles: 1,
      totalDirs: 1,
    }

    const scored = mapMixedResultToScoredItems('/home/tester/dev', result)

    expect(scored).toEqual([
      {
        score: 120,
        item: {
          title: 'todo.md',
          desc: '/home/tester/dev/notes',
          path: '/home/tester/dev/notes/todo.md',
          isSession: false,
          itemKind: 'file',
        },
      },
      {
        score: 80,
        item: {
          title: 'app',
          desc: '/home/tester/dev/src',
          path: '/home/tester/dev/src/app',
          isSession: false,
          itemKind: 'project',
        },
      },
    ])
  })

  test('drops directory results that collapse to the root', () => {
    const result: MixedSearchResult = {
      items: [
        { type: 'directory', item: { relativePath: '/', dirName: '/', maxAccessFrecency: 0 } },
      ],
      scores: [makeScore(10)],
      totalMatched: 1,
      totalFiles: 0,
      totalDirs: 1,
    }

    expect(mapMixedResultToScoredItems('/home/tester/dev', result)).toEqual([])
  })
})

describe('fff result merging', () => {
  test('merges multi-root results by score and dedupes paths', () => {
    const merged = mergeScoredItems(
      [
        [
          { score: 50, item: makeItem('/dev/a/readme.md', 'file') },
          { score: 90, item: makeItem('/dev/a/src', 'project') },
        ],
        [
          { score: 70, item: makeItem('/dev/b/readme.md', 'file') },
          { score: 90, item: makeItem('/dev/a/src', 'project') },
        ],
      ],
      10
    )

    expect(merged.map(item => item.path)).toEqual([
      '/dev/a/src',
      '/dev/b/readme.md',
      '/dev/a/readme.md',
    ])
  })

  test('applies the merge limit after sorting', () => {
    const merged = mergeScoredItems(
      [
        [
          { score: 1, item: makeItem('/dev/low', 'project') },
          { score: 3, item: makeItem('/dev/high', 'project') },
          { score: 2, item: makeItem('/dev/mid', 'project') },
        ],
      ],
      2
    )

    expect(merged.map(item => item.path)).toEqual(['/dev/high', '/dev/mid'])
  })

  test('keeps local results when fff finds nothing', () => {
    const local = [makeItem('/dev/local', 'project')]

    expect(combineFileSearchResults([], local, 'local')).toBe(local)
  })
})

describe('combined file search ranking', () => {
  test('ranks exact local matches above fff file noise', () => {
    const local = [makeItem('/home/tester/dev/mux-sesh', 'project')]

    const fffItems = [
      makeItem('/home/tester/dev/mux-sesh/tests/mux-sesh-helpers.test.ts', 'file'),
      makeItem('/home/tester/dev/mux-sesh/src/mux-sesh.schema.json', 'file'),
    ]

    const combined = combineFileSearchResults(fffItems, local, 'mux-sesh')

    expect(combined[0]?.path).toBe('/home/tester/dev/mux-sesh')
  })

  test('attaches highlight indices to fff items through local scoring', () => {
    const fffItems = [makeItem('/dev/notes/todo.md', 'file')]

    const combined = combineFileSearchResults(fffItems, [], 'todo')

    expect(combined[0]?.searchMatch?.titleIndices).toEqual([0, 1, 2, 3])
  })

  test('keeps typo-only fff matches at the end without highlights', () => {
    const local = [makeItem('/dev/schema-tools', 'project')]
    const fffItems = [makeItem('/dev/lib/schema.rs', 'file')]

    const combined = combineFileSearchResults(fffItems, local, 'shcema')

    expect(combined.map(item => item.path)).toEqual(['/dev/lib/schema.rs'])
    expect(combined[0]?.searchMatch).toBeUndefined()
  })

  test('prefers the local item when fff returns the same path', () => {
    const local = [
      {
        ...makeItem('/dev/mux-sesh', 'project'),
        linkedSessionName: 'mux-sesh',
      },
    ]

    const fffItems = [makeItem('/dev/mux-sesh', 'project')]

    const combined = combineFileSearchResults(fffItems, local, 'mux')

    expect(combined).toHaveLength(1)
    expect(combined[0]?.linkedSessionName).toBe('mux-sesh')
  })

  test('ranks an equally strong project above a file and keeps native order for equal files', () => {
    const local = [makeItem('/dev/notes', 'project')]
    const fffItems = [makeItem('/dev/b/notes', 'file'), makeItem('/dev/a/notes', 'file')]

    const combined = combineFileSearchResults(fffItems, local, 'notes')

    expect(combined.map(item => item.path)).toEqual(['/dev/notes', '/dev/b/notes', '/dev/a/notes'])
  })

  test('ranks a strong file match above a weak local match', () => {
    const local = [makeItem('/dev/the-big-old-notebook', 'project')]
    const fffItems = [makeItem('/dev/lib/tbon.ts', 'file')]

    const combined = combineFileSearchResults(fffItems, local, 'tbon')

    expect(combined.map(item => item.path)).toEqual([
      '/dev/lib/tbon.ts',
      '/dev/the-big-old-notebook',
    ])
  })
})

const config = getDefaultConfig('/fixture')

function scopeOver(native: NativeFileSearch, roots: () => string[], limit = 60) {
  return createFileSearchScope({
    load: async () => native,
    roots: async () => roots(),
    limit,
    scanWaitMs: 1500,
  })
}

function foundPaths(outcome: FileSearchOutcome): string[] {
  if (outcome.kind !== 'found') throw new Error(`Expected found rows, got ${outcome.kind}`)

  return outcome.items.map(item => item.path)
}

function attemptsFor(fake: FakeNative, root: string): number {
  return fake.attempts.filter(attempt => attempt === root).length
}

describe('file search scope', () => {
  test('a failed root initialization is reported and retried by the next search', async () => {
    const fake = createFakeNative()
    const scope = scopeOver(fake.native, () => ['/a'])
    fake.failNext('/a', 'scan root vanished')

    const failed = await scope.search('todo', config)

    expect(failed.kind).toBe('failed')
    expect(failed.kind === 'failed' && failed.failure).toBeInstanceOf(FileSearchFailedError)
    expect(failed.kind === 'failed' && failed.failure.message).toContain('/a')
    expect(failed.kind === 'failed' && failed.failure.message).toContain('scan root vanished')

    expect(foundPaths(await scope.search('todo', config))).toEqual(['/a/todo-a.md'])
    expect(attemptsFor(fake, '/a')).toBe(2)
    expect(fake.created).toHaveLength(1)
  })

  test('one failing root keeps the other roots rows and retries next time', async () => {
    const fake = createFakeNative()
    const scope = scopeOver(fake.native, () => ['/a', '/b'])
    fake.failNext('/a', 'permission denied')

    expect(foundPaths(await scope.search('todo', config))).toEqual(['/b/todo-b.md'])
    expect(foundPaths(await scope.search('todo', config)).sort()).toEqual([
      '/a/todo-a.md',
      '/b/todo-b.md',
    ])
    expect(attemptsFor(fake, '/a')).toBe(2)
    expect(attemptsFor(fake, '/b')).toBe(1)
  })

  test('dispose destroys each owned finder once and later searches open nothing', async () => {
    const fake = createFakeNative()
    const scope = scopeOver(fake.native, () => ['/a', '/b'])

    await scope.search('todo', config)
    scope.dispose()
    scope.dispose()

    expect(fake.created.map(finder => finder.destroyed)).toEqual([1, 1])
    expect(await scope.search('todo', config)).toEqual({ kind: 'disposed' })
    expect(fake.created).toHaveLength(2)
  })

  test('disposing during the scan wait destroys the finder and never searches it', async () => {
    const fake = createFakeNative({ holdScans: true })
    const scope = scopeOver(fake.native, () => ['/a'])

    const pending = scope.search('todo', config)
    await Bun.sleep(1)
    expect(fake.created).toHaveLength(1)

    scope.dispose()
    fake.releaseScans()

    expect(await pending).toEqual({ kind: 'disposed' })
    expect(fake.created.map(finder => finder.destroyed)).toEqual([1])
    expect(
      fake.created.map(finder => finder.searches.length + finder.searchesAfterDestroy)
    ).toEqual([0])
  })

  test('a root dropped from the configured roots is released', async () => {
    const fake = createFakeNative()
    let roots = ['/a', '/b']
    const scope = scopeOver(fake.native, () => roots)

    await scope.search('todo', config)
    roots = ['/a']
    expect(foundPaths(await scope.search('todo', config))).toEqual(['/a/todo-a.md'])

    expect(fake.live().map(finder => finder.root)).toEqual(['/a'])
    expect(fake.created.map(finder => finder.destroyed)).toEqual([0, 1])
  })

  test('warming loads the native library without opening any root finder', async () => {
    const fake = createFakeNative()
    const scope = scopeOver(fake.native, () => ['/a', '/b'])

    await scope.warm()

    expect(fake.attempts).toEqual([])
  })

  test('every root search keeps the native page limit and reports its native time', async () => {
    const fake = createFakeNative({ searchCostMs: 2 })
    const scope = scopeOver(fake.native, () => ['/a', '/b'], 1)

    const outcome = await scope.search('todo', config)

    expect(foundPaths(outcome)).toHaveLength(1)
    expect(fake.created.flatMap(finder => finder.pageSizes)).toEqual([1, 1])
    expect(outcome.kind === 'found' && outcome.nativeMs).toBeGreaterThanOrEqual(4)
  })

  test('disabled native search is explicit and opens nothing', async () => {
    const scope = scopeOver({ kind: 'disabled' }, () => ['/a'])

    expect(await scope.search('todo', config)).toEqual({ kind: 'disabled' })
  })

  test('unavailable native search is an explicit failure, not a throw', async () => {
    const failure = new FileSearchUnavailableError('the native library could not be loaded')
    const scope = scopeOver({ kind: 'unavailable', failure }, () => ['/a'])

    expect(await scope.search('todo', config)).toEqual({ kind: 'failed', failure })
  })
})
