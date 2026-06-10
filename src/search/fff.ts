import { basename, join } from 'path'
import { homedir } from 'os'
import type { FileFinder, MixedSearchResult } from '@ff-labs/fff-bun'
import { scoreSearchItems } from './index'
import type { Config, Item } from '../types'

declare global {
  // Build-time constant used by @ff-labs/fff-bun for compiled binaries.
  const FFF_LIBC: 'gnu' | 'musl'
}
import { getExistingProjectRoots, uniqueNormalizedPaths } from '../tmux/project-discovery'
import { getPathContextLabel } from '../util/path-display'

const DEFAULT_RESULT_LIMIT = 60
const SCAN_WAIT_TIMEOUT_MS = 1500

interface ScoredItem {
  item: Item
  score: number
}

type FffModule = typeof import('@ff-labs/fff-bun')

const state: {
  module?: FffModule | null
  finders: Map<string, Promise<FileFinder | null>>
} = {
  finders: new Map(),
}

function isFileSearchDisabled(): boolean {
  const flag = process.env.MUX_SESH_DISABLE_FFF?.toLowerCase()
  return flag === '1' || flag === 'true'
}

async function loadFffModule(): Promise<FffModule | null> {
  if (state.module !== undefined) {
    return state.module
  }

  if (isFileSearchDisabled()) {
    state.module = null
    return null
  }

  try {
    const loaded = await import('@ff-labs/fff-bun')
    state.module = loaded.FileFinder.isAvailable() ? loaded : null
  } catch {
    state.module = null
  }

  return state.module
}

async function getFinder(root: string): Promise<FileFinder | null> {
  const cached = state.finders.get(root)
  if (cached) {
    return cached
  }

  const created = (async () => {
    const loaded = await loadFffModule()
    if (!loaded) {
      return null
    }

    const made = loaded.FileFinder.create({
      basePath: root,
      disableMmapCache: true,
      disableContentIndexing: true,
      enableHomeDirScanning: root === homedir(),
    })
    if (!made.ok) {
      return null
    }

    await made.value.waitForScan(SCAN_WAIT_TIMEOUT_MS)
    return made.value
  })()

  state.finders.set(root, created)
  return created
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
  const candidates = [...localItems, ...newFileSearchItems]

  const scored = scoreSearchItems(candidates, query).sort((left, right) => right.score - left.score)
  const scoredPaths = new Set(scored.map(result => result.item.path))

  // fff matched these (typo-resistant) even though the local matcher rejected
  // them; keep them visible at the bottom in fff ranking order.
  const typoOnlyItems = newFileSearchItems.filter(item => !scoredPaths.has(item.path))

  return [...scored.map(result => result.item), ...typoOnlyItems]
}

async function searchRoot(root: string, query: string, limit: number): Promise<ScoredItem[]> {
  const finder = await getFinder(root)
  if (!finder) {
    return []
  }

  const result = finder.mixedSearch(query, { pageSize: limit })
  if (!result.ok) {
    return []
  }

  return mapMixedResultToScoredItems(root, result.value)
}

export async function isFileSearchAvailable(): Promise<boolean> {
  return (await loadFffModule()) !== null
}

export async function warmFileSearch(config: Config): Promise<void> {
  if (!(await loadFffModule())) {
    return
  }

  const roots = await getExistingProjectRoots(uniqueNormalizedPaths(config.projectPaths))
  await Promise.all(roots.map(root => getFinder(root)))
}

export async function searchFilesAndDirectories(
  query: string,
  config: Config,
  limit = DEFAULT_RESULT_LIMIT
): Promise<Item[]> {
  const trimmed = query.trim()
  if (!trimmed || !(await loadFffModule())) {
    return []
  }

  const roots = await getExistingProjectRoots(uniqueNormalizedPaths(config.projectPaths))
  if (roots.length === 0) {
    return []
  }

  const results = await Promise.all(roots.map(root => searchRoot(root, trimmed, limit)))
  return mergeScoredItems(results, limit)
}

export async function destroyFileSearch(): Promise<void> {
  const pending = [...state.finders.values()]
  state.finders.clear()
  state.module = undefined

  for (const finderPromise of pending) {
    const finder = await finderPromise.catch(() => null)
    finder?.destroy()
  }
}
