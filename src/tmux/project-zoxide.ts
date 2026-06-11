import { basename } from 'path'
import type { Config, Item } from '../types'
import { normalizePathForMatching } from '../util/glob'
import {
  filterProjectCandidatePaths,
  isIgnoredProjectDirectory,
  toProjectItem,
} from './project-discovery'

export interface ZoxideEntry {
  score: number
  path: string
}

export function parseZoxideOutput(output: string): ZoxideEntry[] {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      const trimmed = line.trim()
      const firstSpaceIndex = trimmed.indexOf(' ')
      if (firstSpaceIndex === -1) {
        return []
      }

      const score = Number(trimmed.slice(0, firstSpaceIndex))
      const path = trimmed.slice(firstSpaceIndex + 1).trim()
      if (!Number.isFinite(score) || !path) {
        return []
      }

      return [{ score, path }]
    })
}

export function isWithinProjectRoots(projectPath: string, projectRoots: string[]): boolean {
  const normalizedProjectPath = normalizePathForMatching(projectPath)

  return projectRoots.some(projectRoot => {
    const normalizedRoot = normalizePathForMatching(projectRoot)
    return (
      normalizedProjectPath === normalizedRoot ||
      normalizedProjectPath.startsWith(`${normalizedRoot}/`)
    )
  })
}

function rankItemsByZoxide(items: Item[], entries: ZoxideEntry[], config: Config): Item[] {
  if (config.zoxideMode === 'off' || entries.length === 0) {
    return [...items].sort((a, b) => a.title.localeCompare(b.title))
  }

  const zoxideScores = new Map(
    entries.map(entry => [normalizePathForMatching(entry.path), entry.score])
  )

  return [...items].sort((left, right) => {
    const scoreDifference =
      (zoxideScores.get(normalizePathForMatching(right.path)) ?? 0) -
      (zoxideScores.get(normalizePathForMatching(left.path)) ?? 0)

    if (scoreDifference !== 0) {
      return scoreDifference
    }

    return left.title.localeCompare(right.title)
  })
}

export function applyZoxideMode(items: Item[], entries: ZoxideEntry[], config: Config): Item[] {
  const rankedItems = rankItemsByZoxide(items, entries, config)

  if (config.zoxideMode !== 'merge') {
    return rankedItems
  }

  const existingPaths = new Set(rankedItems.map(item => normalizePathForMatching(item.path)))
  const mergedItems = entries.flatMap(entry => {
    const normalizedPath = normalizePathForMatching(entry.path)
    const baseName = basename(entry.path)

    if (
      existingPaths.has(normalizedPath) ||
      !isWithinProjectRoots(entry.path, config.projectPaths) ||
      isIgnoredProjectDirectory(baseName)
    ) {
      return []
    }

    existingPaths.add(normalizedPath)
    return [toProjectItem(entry.path)]
  })

  return [...rankedItems, ...mergedItems]
}

export async function getZoxideEntries(
  spawnCommand: (args: string[]) => Promise<{ exitCode: number; output: string }>,
  projectRoots: string[],
  requireProjectMarker: boolean
): Promise<ZoxideEntry[]> {
  try {
    const result = await spawnCommand(['zoxide', 'query', '--list', '--score'])
    if (result.exitCode !== 0) {
      return []
    }

    const entriesWithinRoots = parseZoxideOutput(result.output).filter(entry =>
      isWithinProjectRoots(entry.path, projectRoots)
    )

    if (!requireProjectMarker) {
      return entriesWithinRoots.filter(entry => !isIgnoredProjectDirectory(basename(entry.path)))
    }

    const projectCandidatePaths = await filterProjectCandidatePaths(
      entriesWithinRoots.map(entry => entry.path)
    )
    const projectCandidates = new Set(projectCandidatePaths)

    return entriesWithinRoots.filter(entry =>
      projectCandidates.has(normalizePathForMatching(entry.path))
    )
  } catch {
    return []
  }
}
