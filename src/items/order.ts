import type { Item, SortOrder } from '../types'

function compareByTitle(left: Item, right: Item): number {
  return left.title.localeCompare(right.title)
}

function isOpencodeSession(item: Item): boolean {
  return item.isSession && item.title.startsWith('opencode-')
}

function isConfiguredSession(item: Item): boolean {
  return item.itemKind === 'configured'
}

function sortByGroup(items: Item[], groups: Array<'live' | 'configured'>): Item[] {
  const configuredItems = items.filter(isConfiguredSession).sort(compareByTitle)
  const liveItems = items.filter(item => !isConfiguredSession(item)).sort(compareByTitle)
  const groupedItems = new Map([
    ['configured', configuredItems],
    ['live', liveItems],
  ])

  return groups.flatMap(group => groupedItems.get(group) ?? [])
}

export function orderSessionItems(items: Item[], sortOrder: SortOrder = 'live-first'): Item[] {
  const opencodeItems = items.filter(isOpencodeSession).sort(compareByTitle)
  const regularItems = items.filter(item => !isOpencodeSession(item))

  const orderedRegularItems =
    sortOrder === 'configured-first'
      ? sortByGroup(regularItems, ['configured', 'live'])
      : sortOrder === 'alphabetical'
        ? [...regularItems].sort(compareByTitle)
        : sortByGroup(regularItems, ['live', 'configured'])

  return [...orderedRegularItems, ...opencodeItems]
}

export function orderProjectItems(items: Item[], sortOrder: SortOrder = 'live-first'): Item[] {
  if (sortOrder === 'alphabetical') {
    return [...items].sort(compareByTitle)
  }

  return items
}

export function getSessionSection(item: Item): 'live' | 'configured' {
  return item.itemKind === 'configured' ? 'configured' : 'live'
}
