import { createCommandRunner } from '../multiplexer/command'
import type { Config } from '../config/config-model'
import type { Item } from '../items/item'
import {
  createProjectDiscovery,
  type DiscoveryFailureListener,
  type ProjectDiscovery,
} from './discovery-service'

const DISCOVERY_CACHE_TTL_MS = 15000
const DISCOVERY_COMMAND_TIMEOUT_MS = 10_000

export const PROJECT_DISCOVERY: ProjectDiscovery = createProjectDiscovery({
  runner: createCommandRunner({ timeoutMs: DISCOVERY_COMMAND_TIMEOUT_MS }),
  ttlMs: DISCOVERY_CACHE_TTL_MS,
})

export async function getProjectItems(config: Config): Promise<Item[]> {
  return (await PROJECT_DISCOVERY.load(config, 'projects')).items
}

export async function getSessionCandidateItems(config: Config): Promise<Item[]> {
  return (await PROJECT_DISCOVERY.load(config, 'session-candidates')).items
}

export function refreshProjectDiscovery(): void {
  PROJECT_DISCOVERY.refresh()
}

export function subscribeProjectDiscoveryFailures(listener: DiscoveryFailureListener): () => void {
  return PROJECT_DISCOVERY.subscribeFailures(listener)
}
