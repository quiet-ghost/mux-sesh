import type { Item } from '../types'

const AGENT_SESSION_PREFIXES = ['opencode-', 'pi-', 'codex-', 'claude-'] as const
const SIDE_SESSION_NAMES = new Set(['tui_chat'])

export function isAgentSessionName(sessionName: string): boolean {
  return (
    AGENT_SESSION_PREFIXES.some(prefix => sessionName.startsWith(prefix)) ||
    SIDE_SESSION_NAMES.has(sessionName)
  )
}

export function isAgentSessionItem(
  item: Pick<Item, 'isSession' | 'title' | 'itemKind' | 'agentStatus'>
): boolean {
  if (!item.isSession) {
    return false
  }

  return item.itemKind === 'herdr'
    ? item.agentStatus !== undefined && item.agentStatus !== 'unknown'
    : isAgentSessionName(item.title)
}
