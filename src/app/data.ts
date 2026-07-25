import { getListedSessionItems, mergeSessionItems } from '../config/listed-sessions'
import { orderProjectItems, orderSessionItems } from '../items/order'
import { annotateProjectItemsWithSessionLinks } from '../projects/session-links'
import { clearMatchIndices } from '../search'
import { workspaceToItem } from '../multiplexer/items'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey } from '../multiplexer/items'
import { getProjectItems, getSessionCandidateItems } from '../tmux/projects'
import { filterHiddenSessions } from '../tmux/workflows'
import { isAgentSessionItem } from '../agents/session-name'
import type { Config, Item } from '../types'

export type Measure = <T>(name: string, fn: () => Promise<T>) => Promise<T>

export function getSessionSelectionIndex(nextItems: Item[], selection?: string | null): number {
  const regularItems = nextItems.filter(item => !isAgentSessionItem(item))
  if (regularItems.length === 0 || !selection) {
    return 0
  }

  const index = regularItems.findIndex(
    item => getItemKey(item) === selection || item.title === selection
  )
  return index >= 0 ? index : 0
}

export function getProjectSelectionIndex(nextItems: Item[], selection?: string | null): number {
  if (nextItems.length === 0 || !selection) {
    return 0
  }

  const index = nextItems.findIndex(item => item.path === selection)
  return index >= 0 ? index : 0
}

export async function loadSessionItems(
  config: Config,
  measure: Measure,
  backend: MultiplexerBackend,
  labelPrefix = 'sessions'
): Promise<{ visibleSessions: Item[]; sessionItems: Item[] }> {
  const sessions = await measure(`${labelPrefix}:listWorkspaces`, async () =>
    (await backend.list()).map(workspaceToItem)
  )
  const visibleSessions = filterHiddenSessions(sessions, config.hiddenSessions)
  const listedSessions = await measure(`${labelPrefix}:getListedSessionItems`, () =>
    getListedSessionItems(config)
  )
  const sessionItems = clearMatchIndices(
    orderSessionItems(
      mergeSessionItems(visibleSessions, listedSessions),
      config.sortOrder,
      config.pinnedSessions
    )
  )

  return {
    visibleSessions,
    sessionItems,
  }
}

export async function loadProjectItemsWithLinks(
  config: Config,
  liveSessions: Item[],
  measure: Measure,
  sourceItems?: Item[]
): Promise<{ projectSourceItems: Item[]; projectItems: Item[] }> {
  const projectSourceItems = sourceItems ?? (await loadProjectSourceItems(config, measure))

  const projectItems = clearMatchIndices(
    orderProjectItems(
      await measure('projects:linkProjectItems', () =>
        annotateProjectItemsWithSessionLinks(projectSourceItems, liveSessions, config)
      ),
      config.sortOrder
    )
  )

  return {
    projectSourceItems,
    projectItems,
  }
}

export async function loadProjectSourceItems(config: Config, measure: Measure): Promise<Item[]> {
  return orderProjectItems(
    await measure('projects:getProjectItems', () => getProjectItems(config)),
    config.sortOrder
  )
}

export async function loadSessionCandidateItems(
  config: Config,
  measure: Measure,
  backend: MultiplexerBackend
): Promise<Item[]> {
  const [candidates, sessions] = await measure('loadSessionCandidateItems', () =>
    Promise.all([
      getSessionCandidateItems(config),
      backend.list().then(items => items.map(workspaceToItem)),
    ])
  )

  const visibleSessions = filterHiddenSessions(sessions, config.hiddenSessions)
  return measure('linkSessionCandidateItems', () =>
    annotateProjectItemsWithSessionLinks(candidates, visibleSessions, config)
  )
}
