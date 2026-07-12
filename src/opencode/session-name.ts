import type { Item } from '../types'

const OPENCODE_SESSION_PREFIX = 'opencode-'
const SIDE_SESSION_NAMES = new Set(['tui_chat'])

export function isOpencodeSessionName(sessionName: string): boolean {
  return sessionName.startsWith(OPENCODE_SESSION_PREFIX) || SIDE_SESSION_NAMES.has(sessionName)
}

export function isOpencodeSessionItem(item: Pick<Item, 'isSession' | 'title'>): boolean {
  return item.isSession && isOpencodeSessionName(item.title)
}
