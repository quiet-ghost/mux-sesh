import { basename } from 'path'
import { access, stat } from 'fs/promises'
import type { Config } from '../config/config-model'
import type { Item } from '../items/item'
import { mapWithConcurrency } from '../util/concurrency'
import { normalizePathForMatching } from '../util/glob'
import { getPathContextLabel } from '../util/path-display'

const MARKER_CHECK_CONCURRENCY = 16

const PROJECT_MARKERS = [
  '.git',
  '.jj',
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'flake.nix',
]

// Caches and virtual environments: never a project, and never somewhere to start a session.
const CACHE_DIRECTORY_NAMES = ['__pycache__', 'venv', 'site-packages']

export const PRUNED_PROJECT_DIRECTORY_NAMES = [
  '.git',
  '.jj',
  'node_modules',
  'target',
  'build',
  'dist',
  ...CACHE_DIRECTORY_NAMES,
]

export function isIgnoredProjectDirectory(baseName: string): boolean {
  return baseName.startsWith('.') || PRUNED_PROJECT_DIRECTORY_NAMES.includes(baseName)
}

// Below its root, a path inside a hidden or pruned folder is noise (`~/.config/…`, `…/__pycache__`).
// A hidden root listed on purpose, such as `~/.dotfiles`, still counts: only the part below it is checked.
export function isInsideIgnoredDirectory(path: string, roots: readonly string[]): boolean {
  const normalized = normalizePathForMatching(path)

  // The deepest root holding the path decides, so a hidden root inside another root still counts.
  const root = roots
    .flatMap(entry => {
      const candidate = normalizePathForMatching(entry)

      return normalized.startsWith(`${candidate}/`) ? [candidate] : []
    })
    .sort((left, right) => right.length - left.length)[0]

  if (root === undefined) return false

  return normalized
    .slice(root.length + 1)
    .split('/')
    .some(isIgnoredProjectDirectory)
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

export type DiscoveryScope = 'projects' | 'session-candidates'

export function buildCacheKey(config: Config, scope: DiscoveryScope): string {
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

  const matches = await mapWithConcurrency(
    uniquePaths,
    MARKER_CHECK_CONCURRENCY,
    async projectPath => ({
      projectPath,
      include: await hasProjectMarker(projectPath),
    })
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
