import { spawn } from 'bun'
import { basename } from 'path'
import type { Config, Item } from '../types'
import { normalizePathForMatching } from '../util/glob'
import {
  buildCacheKey,
  filterProjectCandidatePaths,
  filterSessionCandidatePaths,
  getCachedDiscovery,
  getExistingProjectRoots,
  type DiscoveryCacheEntry,
  isIgnoredProjectDirectory,
  toProjectItem,
} from './project-discovery'
import { applyZoxideMode, getZoxideEntries, parseZoxideOutput } from './project-zoxide'

const DISCOVERY_CACHE_TTL_MS = 15000
const PROJECT_SCAN_DEPTH = 3
const SESSION_CANDIDATE_SCAN_DEPTH = 5
const projectItemsCache = new Map<string, DiscoveryCacheEntry>()
const sessionCandidateCache = new Map<string, DiscoveryCacheEntry>()

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

async function runCommand(args: string[]): Promise<{ exitCode: number; output: string }> {
  const proc = spawn(args)
  const output = await new Response(proc.stdout).text()
  await proc.exited
  return { exitCode: proc.exitCode ?? 1, output }
}

export async function getProjectItems(config: Config): Promise<Item[]> {
  const cacheKey = buildCacheKey(config, 'projects')

  return getCachedDiscovery(projectItemsCache, cacheKey, DISCOVERY_CACHE_TTL_MS, async () => {
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
      config.zoxideMode === 'off' ? [] : await getZoxideEntries(runCommand, existingPaths, true)
    return applyZoxideMode(items, zoxideEntries, config)
  })
}

export async function getSessionCandidateItems(config: Config): Promise<Item[]> {
  const cacheKey = buildCacheKey(config, 'session-candidates')

  return getCachedDiscovery(sessionCandidateCache, cacheKey, DISCOVERY_CACHE_TTL_MS, async () => {
    const existingPaths = await getExistingProjectRoots(config.projectPaths)
    if (existingPaths.length === 0) {
      return []
    }

    const scannedPaths = await scanDirectories(existingPaths, SESSION_CANDIDATE_SCAN_DEPTH)
    const candidatePaths = filterSessionCandidatePaths(scannedPaths)
    const items = candidatePaths.map(toProjectItem)
    const zoxideEntries =
      config.zoxideMode === 'off' ? [] : await getZoxideEntries(runCommand, existingPaths, false)

    return applyZoxideMode(items, zoxideEntries, config)
  })
}

export { applyZoxideMode, filterProjectCandidatePaths, parseZoxideOutput }
