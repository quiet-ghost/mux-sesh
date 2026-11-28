import { createCommandRunner } from '../multiplexer/command'
import type { Config, Item } from '../types'
import { createProjectDiscovery, type DiscoveryFailureListener } from './project-discovery-service'

const DISCOVERY_CACHE_TTL_MS = 15000
const DISCOVERY_COMMAND_TIMEOUT_MS = 10_000

const projectDiscovery = createProjectDiscovery({
  runner: createCommandRunner({ timeoutMs: DISCOVERY_COMMAND_TIMEOUT_MS }),
  ttlMs: DISCOVERY_CACHE_TTL_MS,
})

export async function getProjectItems(config: Config): Promise<Item[]> {
  return (await projectDiscovery.load(config, 'projects')).items
}

export async function getSessionCandidateItems(config: Config): Promise<Item[]> {
  return (await projectDiscovery.load(config, 'session-candidates')).items
}

export function refreshProjectDiscovery(): void {
  projectDiscovery.refresh()
}

export function subscribeProjectDiscoveryFailures(listener: DiscoveryFailureListener): () => void {
  return projectDiscovery.subscribeFailures(listener)
}
