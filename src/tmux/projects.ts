import type { Config, Item } from '../types'
import {
  filterProjectCandidatePaths,
  filterSessionCandidatePaths,
  type DiscoveryCacheEntry,
} from './project-discovery'
import { loadDiscoveryItems } from './project-loader'
import { applyZoxideMode, parseZoxideOutput } from './project-zoxide'

const DISCOVERY_CACHE_TTL_MS = 15000
const PROJECT_SCAN_DEPTH = 3
const SESSION_CANDIDATE_SCAN_DEPTH = 5
const projectItemsCache = new Map<string, DiscoveryCacheEntry>()
const sessionCandidateCache = new Map<string, DiscoveryCacheEntry>()

export async function getProjectItems(config: Config): Promise<Item[]> {
  return loadDiscoveryItems(config, {
    cache: projectItemsCache,
    scope: 'projects',
    ttlMs: DISCOVERY_CACHE_TTL_MS,
    scanDepth: PROJECT_SCAN_DEPTH,
    requireProjectMarker: true,
    selectPaths: filterProjectCandidatePaths,
  })
}

export async function getSessionCandidateItems(config: Config): Promise<Item[]> {
  return loadDiscoveryItems(config, {
    cache: sessionCandidateCache,
    scope: 'session-candidates',
    ttlMs: DISCOVERY_CACHE_TTL_MS,
    scanDepth: SESSION_CANDIDATE_SCAN_DEPTH,
    requireProjectMarker: false,
    selectPaths: async paths => filterSessionCandidatePaths(paths),
  })
}

export { applyZoxideMode, filterProjectCandidatePaths, parseZoxideOutput }
