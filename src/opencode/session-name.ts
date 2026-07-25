import type { Item } from '../types'

const OPENCODE_SESSION_PREFIX = 'opencode-'

export function isOpencodeSessionName(sessionName: string): boolean {
  return sessionName.startsWith(OPENCODE_SESSION_PREFIX)
}

export function isOpencodeSessionItem(
  item: Pick<Item, 'isSession' | 'title' | 'itemKind'>
): boolean {
  return item.isSession && item.itemKind !== 'herdr' && isOpencodeSessionName(item.title)
}
