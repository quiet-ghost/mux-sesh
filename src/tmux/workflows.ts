import type { Item } from '../types'
import { matchesGlob } from '../util/glob'

export function filterHiddenSessions(items: Item[], hiddenSessions: string[] = []): Item[] {
  if (hiddenSessions.length === 0) {
    return items
  }

  return items.filter(item => {
    if (!item.isSession) {
      return true
    }

    return !hiddenSessions.some(pattern => matchesGlob(item.title, pattern))
  })
}

export function getLastSessionTarget(items: Item[], currentSessionName?: string): Item | undefined {
  return items
    .filter(item => item.isSession && item.title !== currentSessionName)
    .sort((left, right) => (right.lastActivity ?? 0) - (left.lastActivity ?? 0))[0]
}
