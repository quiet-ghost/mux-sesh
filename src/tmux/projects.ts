import { spawn } from 'bun'
import { basename } from 'path'
import { access, stat } from 'fs/promises'
import type { Config, Item } from '../types'
import { normalizePathForMatching } from '../util/glob'
import { getPathContextLabel } from '../util/path-display'

interface ZoxideEntry {
  score: number
  path: string
}

interface DiscoveryCacheEntry {
  expiresAt: number
  items: Item[]
}

const PROJECT_MARKERS = [
  '.git',
  '.jj',
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'flake.nix',
]
const DISCOVERY_CACHE_TTL_MS = 15000
const PROJECT_SCAN_DEPTH = 3
const SESSION_CANDIDATE_SCAN_DEPTH = 5
const projectItemsCache = new Map<string, DiscoveryCacheEntry>()
const sessionCandidateCache = new Map<string, DiscoveryCacheEntry>()

function isIgnoredProjectDirectory(baseName: string): boolean {
  return (
    baseName.startsWith('.') ||
    baseName === 'node_modules' ||
    baseName === 'target' ||
    baseName === 'build' ||
    baseName === 'dist'
  )
}

function toProjectItem(projectPath: string): Item {
  return {
    title: basename(projectPath),
    desc: getPathContextLabel(projectPath),
    path: projectPath,
    isSession: false,
    itemKind: 'project',
  }
}

function uniqueNormalizedPaths(paths: string[]): string[] {
  return [...new Set(paths.map(path => normalizePathForMatching(path)))]
}

function buildCacheKey(config: Config, scope: 'projects' | 'session-candidates'): string {
  return JSON.stringify({
    scope,
    roots: uniqueNormalizedPaths(config.projectPaths),
    zoxideMode: config.zoxideMode,
  })
}

async function hasProjectMarker(projectPath: string): Promise<boolean> {
  for (const marker of PROJECT_MARKERS) {
    try {
      await access(`${projectPath}/${marker}`)
      return true
    } catch {}
  }

  return false
}

export async function filterProjectCandidatePaths(projectPaths: string[]): Promise<string[]> {
  const uniquePaths = uniqueNormalizedPaths(projectPaths)
  const matches = await Promise.all(
    uniquePaths.map(async projectPath => ({
      projectPath,
      include: await hasProjectMarker(projectPath),
    }))
  )

  return matches.filter(match => match.include).map(match => match.projectPath)
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

function isWithinProjectRoots(projectPath: string, projectRoots: string[]): boolean {
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
    return items.sort((a, b) => a.title.localeCompare(b.title))
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

async function getZoxideEntries(
  projectRoots: string[],
  requireProjectMarker: boolean
): Promise<ZoxideEntry[]> {
  try {
    const proc = spawn(['zoxide', 'query', '--list', '--score'])
    const output = await new Response(proc.stdout).text()
    await proc.exited

    if (proc.exitCode !== 0) {
      return []
    }

    const entriesWithinRoots = parseZoxideOutput(output).filter(entry =>
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

async function getExistingProjectRoots(projectPaths: string[]): Promise<string[]> {
  const existingPaths: string[] = []
  for (const path of projectPaths) {
    try {
      const pathStat = await stat(path)
      if (pathStat.isDirectory()) {
        existingPaths.push(path)
      }
    } catch {}
  }

  return existingPaths
}

async function scanDirectories(projectRoots: string[], maxDepth: number): Promise<string[]> {
  if (projectRoots.length === 0) {
    return []
  }

  const args = [...projectRoots, '-mindepth', '1', '-maxdepth', String(maxDepth), '-type', 'd']
  const proc = spawn(['find', ...args], {
    stderr: 'pipe',
  })
  const output = await new Response(proc.stdout).text()
  const stderrPromise = new Response(proc.stderr).text()
  await proc.exited
  await stderrPromise

  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(path => normalizePathForMatching(path))
}

function filterSessionCandidatePaths(paths: string[]): string[] {
  return uniqueNormalizedPaths(paths).filter(path => !isIgnoredProjectDirectory(basename(path)))
}

async function getCachedDiscovery(
  cache: Map<string, DiscoveryCacheEntry>,
  cacheKey: string,
  load: () => Promise<Item[]>
): Promise<Item[]> {
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items
  }

  const items = await load()
  cache.set(cacheKey, {
    items,
    expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS,
  })

  return items
}

export async function getProjectItems(config: Config): Promise<Item[]> {
  const cacheKey = buildCacheKey(config, 'projects')

  return getCachedDiscovery(projectItemsCache, cacheKey, async () => {
    const existingPaths = await getExistingProjectRoots(config.projectPaths)
    if (existingPaths.length === 0) {
      return []
    }

    const scannedPaths = await scanDirectories(existingPaths, PROJECT_SCAN_DEPTH)
    const projectCandidatePaths = await filterProjectCandidatePaths(scannedPaths)
    const items = projectCandidatePaths
      .filter(path => !isIgnoredProjectDirectory(basename(path)))
      .map(toProjectItem)

    const zoxideEntries =
      config.zoxideMode === 'off' ? [] : await getZoxideEntries(existingPaths, true)
    return applyZoxideMode(items, zoxideEntries, config)
  })
}

export async function getSessionCandidateItems(config: Config): Promise<Item[]> {
  const cacheKey = buildCacheKey(config, 'session-candidates')

  return getCachedDiscovery(sessionCandidateCache, cacheKey, async () => {
    const existingPaths = await getExistingProjectRoots(config.projectPaths)
    if (existingPaths.length === 0) {
      return []
    }

    const scannedPaths = await scanDirectories(existingPaths, SESSION_CANDIDATE_SCAN_DEPTH)
    const candidatePaths = filterSessionCandidatePaths(scannedPaths)
    const items = candidatePaths.map(toProjectItem)
    const zoxideEntries =
      config.zoxideMode === 'off' ? [] : await getZoxideEntries(existingPaths, false)

    return applyZoxideMode(items, zoxideEntries, config)
  })
}
