import type { Item } from '../types'
import { formatSessionAge } from '../util/time'

export function getSessionMeta(item: Item): string {
  if (item.itemKind === 'herdr') {
    return item.agentStatus && item.agentStatus !== 'unknown' ? item.agentStatus : ''
  }

  return item.createdAt ? formatSessionAge(item.createdAt) : ''
}
