import type { Item } from '../types'
import type { LiveWorkspace, WorkspaceRef } from './types'
import { getLiveSessionGroupLabel } from '../util/path-display'

export interface LiveSessionItem extends Item {
  isSession: true
  itemKind: 'tmux' | 'herdr'
  sessionId: string
  backend: 'tmux' | 'herdr'
}

export function workspaceToItem(workspace: LiveWorkspace): LiveSessionItem {
  return {
    title: workspace.title,
    desc: getLiveSessionGroupLabel(workspace.path),
    path: workspace.path,
    isSession: true,
    itemKind: workspace.backend,
    sessionId: workspace.id,
    backend: workspace.backend,
    agentStatus: workspace.agentStatus,
    isAttached: workspace.isActive,
    windowCount: String(workspace.unitCount),
    createdAt: workspace.createdAt,
    lastActivity: workspace.lastActivity,
  }
}

export function isLiveSessionItem(item: Item): item is LiveSessionItem {
  return (
    item.isSession &&
    (item.itemKind === 'tmux' || item.itemKind === 'herdr') &&
    item.backend === item.itemKind &&
    typeof item.sessionId === 'string'
  )
}

export function getWorkspaceRef(item: LiveSessionItem): WorkspaceRef {
  return { backend: item.backend, id: item.sessionId, title: item.title }
}

export function getSessionKey(item: LiveSessionItem): string {
  return `${item.backend}:${item.sessionId}`
}

export function getItemKey(item: Item): string {
  return isLiveSessionItem(item) ? getSessionKey(item) : `${item.itemKind ?? 'item'}:${item.title}`
}
