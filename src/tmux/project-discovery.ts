import { basename } from 'path'
import { access, stat } from 'fs/promises'
import type { Config, Item } from '../types'
import { normalizePathForMatching } from '../util/glob'
import { getPathContextLabel } from '../util/path-display'

export interface DiscoveryCacheEntry {
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

export function isIgnoredProjectDirectory(baseName: string): boolean {
  return (
    baseName.startsWith('.') ||
    baseName === 'node_modules' ||
    baseName === 'target' ||
    baseName === 'build' ||
    baseName === 'dist'
  )
}

export function toProjectItem(projectPath: string): Item {
  return {
    title: basename(projectPath),
    desc: getPathContextLabel(projectPath),
    path: projectPath,
    isSession: false,
    itemKind: 'project',
  }
}

export function uniqueNormalizedPaths(paths: string[]): string[] {
  return [...new Set(paths.map(path => normalizePathForMatching(path)))]
}

export function buildCacheKey(config: Config, scope: 'projects' | 'session-candidates'): string {
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

export async function getExistingProjectRoots(projectPaths: string[]): Promise<string[]> {
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

export function filterSessionCandidatePaths(paths: string[]): string[] {
  return uniqueNormalizedPaths(paths).filter(path => !isIgnoredProjectDirectory(basename(path)))
}

export async function getCachedDiscovery(
  cache: Map<string, DiscoveryCacheEntry>,
  cacheKey: string,
  ttlMs: number,
  load: () => Promise<Item[]>
): Promise<Item[]> {
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items
  }

  const items = await load()
  cache.set(cacheKey, {
    items,
    expiresAt: Date.now() + ttlMs,
  })

  return items
}
