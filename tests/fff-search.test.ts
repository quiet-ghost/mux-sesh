import { describe, expect, test } from 'bun:test'
import type { FileItem, MixedSearchResult, Score } from '@ff-labs/fff-bun'
import {
  mapMixedResultToScoredItems,
  mergeFileSearchItems,
  mergeScoredItems,
} from '../src/search/fff'
import type { Item } from '../src/types'

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

    expect(mergeFileSearchItems([], local)).toBe(local)
  })

  test('puts fff results first and keeps unmatched local items', () => {
    const fffItems = [makeItem('/dev/a/todo.md', 'file'), makeItem('/dev/a', 'project')]
    const local = [makeItem('/dev/a', 'project'), makeItem('/dev/zoxide-extra', 'project')]

    expect(mergeFileSearchItems(fffItems, local).map(item => item.path)).toEqual([
      '/dev/a/todo.md',
      '/dev/a',
      '/dev/zoxide-extra',
    ])
  })
})
