import type { Item } from '../types'
import type { HerdrAgentTarget, LiveWorkspace, WorkspaceRef } from './types'
import { getLiveSessionGroupLabel } from '../util/path-display'

export interface LiveSessionItem extends Item {
  isSession: true
  itemKind: 'tmux' | 'herdr'
  sessionId: string
  backend: 'tmux' | 'herdr'
  target?: HerdrAgentTarget
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
    target: workspace.backend === 'herdr' ? workspace.target : undefined,
    workspaceTitle: workspace.workspaceTitle,
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

export function isHerdrAgentItem(
  item: Item | undefined
): item is LiveSessionItem & { backend: 'herdr'; target: HerdrAgentTarget } {
  return (
    item !== undefined &&
    isLiveSessionItem(item) &&
    item.backend === 'herdr' &&
    item.target?.kind === 'agent'
  )
}

export function getWorkspaceRef(item: LiveSessionItem): WorkspaceRef {
  return item.backend === 'herdr'
    ? { backend: 'herdr', id: item.sessionId, title: item.title, target: item.target }
    : { backend: 'tmux', id: item.sessionId, title: item.title }
}

export function getSessionKey(item: LiveSessionItem): string {
  return item.target
    ? `${item.backend}:${item.sessionId}:agent:${item.target.paneId}`
    : `${item.backend}:${item.sessionId}`
}

export function getItemKey(item: Item): string {
  return isLiveSessionItem(item) ? getSessionKey(item) : `${item.itemKind ?? 'item'}:${item.title}`
}
