import { spawn } from 'bun'
import type { Config, Item } from '../types'
import { normalizePathForMatching } from '../util/glob'
import {
  buildCacheKey,
  getCachedDiscovery,
  getExistingProjectRoots,
  PRUNED_PROJECT_DIRECTORY_NAMES,
  toProjectItem,
  type DiscoveryCacheEntry,
} from './project-discovery'
import { applyZoxideMode, getZoxideEntries } from './project-zoxide'

type Scope = 'projects' | 'session-candidates'

interface DiscoveryLoadOptions {
  cache: Map<string, DiscoveryCacheEntry>
  scope: Scope
  ttlMs: number
  scanDepth: number
  requireProjectMarker: boolean
  selectPaths: (paths: string[]) => Promise<string[]>
}

async function scanDirectories(projectRoots: string[], maxDepth: number): Promise<string[]> {
  if (projectRoots.length === 0) {
    return []
  }

  const pruneExpression = PRUNED_PROJECT_DIRECTORY_NAMES.flatMap((name, index) =>
    index === 0 ? ['-name', name] : ['-o', '-name', name]
  )
  const args = [
    ...projectRoots,
    '-mindepth',
    '1',
    '-maxdepth',
    String(maxDepth),
    '(',
    ...pruneExpression,
    ')',
    '-prune',
    '-o',
    '-type',
    'd',
    '-print',
  ]
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

export async function loadDiscoveryItems(
  config: Config,
  options: DiscoveryLoadOptions
): Promise<Item[]> {
  const cacheKey = buildCacheKey(config, options.scope)

  return getCachedDiscovery(options.cache, cacheKey, options.ttlMs, async () => {
    const existingPaths = await getExistingProjectRoots(config.projectPaths)
    if (existingPaths.length === 0) {
      return []
    }

    const scannedPaths = await scanDirectories(existingPaths, options.scanDepth)
    const selectedPaths = await options.selectPaths(scannedPaths)
    const items = selectedPaths.map(toProjectItem)
    const zoxideEntries =
      config.zoxideMode === 'off'
        ? []
        : await getZoxideEntries(runCommand, existingPaths, options.requireProjectMarker)

    return applyZoxideMode(items, zoxideEntries, config)
  })
}
