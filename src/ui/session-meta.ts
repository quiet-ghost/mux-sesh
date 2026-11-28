import type { Item } from '../items/item'
import { isLiveSessionItem } from '../multiplexer/items'
import { toHomeRelativePath } from '../util/path-display'
import { formatSessionAge } from '../util/time'

export function getSessionMeta(item: Item): string {
  if (item.itemKind === 'herdr') {
    return item.agentStatus && item.agentStatus !== 'unknown' ? item.agentStatus : ''
  }

  return item.createdAt ? formatSessionAge(item.createdAt) : ''
}

export interface CompactDetailRow {
  readonly label: string
  readonly value: string
}

export interface CompactDetails {
  readonly path: string
  readonly rows: CompactDetailRow[]
}

function targetKind(item: Item): string {
  switch (item.itemKind) {
    case 'file':
      return 'File'
    case 'configured':
      return 'Configured project'
    case 'project':
    case 'tmux':
    case 'herdr':
    case undefined:
      return 'Project'
  }
}

// Inventory context only: nothing here reads the backend, git, files, or preview commands.
export function getCompactDetails(item: Item): CompactDetails {
  const path = item.path ? toHomeRelativePath(item.path) : ''

  if (isLiveSessionItem(item)) {
    const rows: CompactDetailRow[] = [
      { label: 'Status', value: item.isAttached ? 'active' : 'inactive' },
    ]

    if (item.windowCount) {
      rows.push({ label: item.backend === 'herdr' ? 'Tabs' : 'Windows', value: item.windowCount })
    }

    if (item.agentStatus && item.agentStatus !== 'unknown') {
      rows.push({ label: 'Agent', value: item.agentStatus })
    }

    return { path, rows }
  }

  const rows: CompactDetailRow[] = [{ label: 'Kind', value: targetKind(item) }]

  if (item.linkedSessionName) {
    rows.push({
      label: 'Live session',
      value: `${item.linkedSessionName} (${item.linkedSessionAttached ? 'active' : 'inactive'})`,
    })
  }

  return { path, rows }
}
