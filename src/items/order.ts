import type { Item, SortOrder } from '../types'
import { isAgentSessionItem } from '../agents/session-name'
import { getLiveSessionSortKey } from '../util/path-display'

export type SessionSection = 'pinned' | 'live' | 'configured'

function compareByTitle(left: Item, right: Item): number {
  return left.title.localeCompare(right.title)
}

function compareLiveSessions(left: Item, right: Item): number {
  const leftGroupKey = getLiveSessionSortKey(left.path, left.title)
  const rightGroupKey = getLiveSessionSortKey(right.path, right.title)
  const groupDifference = leftGroupKey.localeCompare(rightGroupKey)

  if (groupDifference !== 0) {
    return groupDifference
  }

  return left.title.localeCompare(right.title)
}

function isConfiguredSession(item: Item): boolean {
  return item.itemKind === 'configured'
}

function applyPinnedState(items: Item[], pinnedSessions: readonly string[]): Item[] {
  const pinnedSet = new Set(pinnedSessions)

  return items.map(item => ({
    ...item,
    isPinned: pinnedSet.has(item.title),
  }))
}

function splitPinnedItems(items: Item[], pinnedSessions: readonly string[]) {
  const pinnedItems = pinnedSessions.flatMap(title => items.filter(item => item.title === title))
  const pinnedSet = new Set(pinnedItems)
  const remainingItems = items.filter(item => !pinnedSet.has(item))

  return { pinnedItems, remainingItems }
}

function sortByGroup(items: Item[], groups: Array<'live' | 'configured'>): Item[] {
  const configuredItems = items.filter(isConfiguredSession).sort(compareByTitle)
  const liveItems = items.filter(item => !isConfiguredSession(item)).sort(compareLiveSessions)
  const groupedItems = new Map([
    ['configured', configuredItems],
    ['live', liveItems],
  ])

  return groups.flatMap(group => groupedItems.get(group) ?? [])
}

export function orderSessionItems(
  items: Item[],
  sortOrder: SortOrder = 'live-first',
  pinnedSessions: readonly string[] = []
): Item[] {
  const itemsWithPinnedState = applyPinnedState(items, pinnedSessions)
  const agentItems = itemsWithPinnedState.filter(isAgentSessionItem).sort(compareByTitle)
  const regularItems = itemsWithPinnedState.filter(item => !isAgentSessionItem(item))
  const { pinnedItems, remainingItems } = splitPinnedItems(regularItems, pinnedSessions)

  const orderedRegularItems =
    sortOrder === 'configured-first'
      ? sortByGroup(remainingItems, ['configured', 'live'])
      : sortOrder === 'alphabetical'
        ? [...remainingItems].sort((left, right) => {
            if (isConfiguredSession(left) || isConfiguredSession(right)) {
              return compareByTitle(left, right)
            }

            return compareLiveSessions(left, right)
          })
        : sortByGroup(remainingItems, ['live', 'configured'])

  return [...pinnedItems, ...orderedRegularItems, ...agentItems]
}

export function orderProjectItems(items: Item[], sortOrder: SortOrder = 'live-first'): Item[] {
  if (sortOrder === 'alphabetical') {
    return [...items].sort(compareByTitle)
  }

  return items
}

export function getSessionSection(item: Item): SessionSection {
  if (item.isPinned) {
    return 'pinned'
  }

  return item.itemKind === 'configured' ? 'configured' : 'live'
}
