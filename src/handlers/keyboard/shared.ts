import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  describeUnavailableAction,
  getActionTargetItem,
  getCommandEntry,
  type ActionContext,
  type CommandId,
} from '../../app/action-catalog'
import { AppMode, ViewMode, type Config, type Item } from '../../types'
import { requestFatalShutdown } from '../../util/shutdown'

export interface KeyboardInput {
  name?: string
  ctrl?: boolean
  shift?: boolean
}

export interface KeyboardHandlerContext {
  appMode: AppMode
  viewMode: ViewMode
  items: Item[]
  regularSessions: Item[]
  agentSessions: Item[]
  cursor: number
  agentCursor: number
  searchQuery: string
  actionContext: ActionContext
  prefixKey?: string
  projectItems: Item[]
  sessionItems: Item[]
  prefixActive: boolean
  prefixTimeoutRef: MutableRefObject<NodeJS.Timeout | null>
  setAppMode: (mode: AppMode) => void
  setViewMode: (mode: ViewMode) => void
  setCursor: Dispatch<SetStateAction<number>>
  setAgentCursor: Dispatch<SetStateAction<number>>
  setSearchQuery: (query: string) => void
  setAllItems: Dispatch<SetStateAction<Item[]>>
  setItems: Dispatch<SetStateAction<Item[]>>
  setPrefixActive: (active: boolean) => void
  refreshItems: (forceViewMode?: ViewMode, nextConfig?: Config) => Promise<void>
  requestKillSession: (item: Item) => void
  togglePinnedSession: (sessionName: string) => Promise<void>
  clearPendingKill: () => void
  handleSelect: (item: Item) => Promise<void>
  handleKillSession: (item: Item) => Promise<void>
  handleLastSession: () => Promise<void>
  handleRootSession: (item?: Item) => Promise<void>
  handleEditTarget: (item?: Item) => Promise<void>
  openRenameModal: (item: Item) => void
  openCommandsModal: () => void
  toggleDetails: () => void
  openSettingsModal: () => void
  setMessage: (message: string) => void
}

export function getKeyName(key: KeyboardInput): string {
  return key.name ?? ''
}

export function matchesPrefixKey(key: KeyboardInput, prefixKey = 'ctrl+x'): boolean {
  const parts = prefixKey.toLowerCase().split('+')
  const keyPart = parts.at(-1) ?? prefixKey.toLowerCase()
  const expectsCtrl = parts.includes('ctrl')
  const expectsShift = parts.includes('shift')

  return (
    Boolean(key.ctrl) === expectsCtrl &&
    Boolean(key.shift) === expectsShift &&
    getKeyName(key).toLowerCase() === keyPart
  )
}

export function clearPrefix(ctx: KeyboardHandlerContext) {
  if (ctx.prefixTimeoutRef.current) {
    clearTimeout(ctx.prefixTimeoutRef.current)
    ctx.prefixTimeoutRef.current = null
  }

  ctx.setPrefixActive(false)
}

export function activatePrefix(ctx: KeyboardHandlerContext) {
  ctx.setPrefixActive(true)
  ctx.prefixTimeoutRef.current = setTimeout(() => {
    ctx.setPrefixActive(false)
  }, 2000)
}

export function setTimedMessage(ctx: KeyboardHandlerContext, message: string, timeout = 2000) {
  ctx.setMessage(message)
  setTimeout(() => ctx.setMessage(''), timeout)
}

export function getSelectedItem(ctx: KeyboardHandlerContext): Item | undefined {
  return ctx.viewMode === ViewMode.Sessions
    ? ctx.regularSessions[ctx.cursor]
    : ctx.items[ctx.cursor]
}

export function getQuickSelectItem(ctx: KeyboardHandlerContext, index: number): Item | undefined {
  return ctx.viewMode === ViewMode.Sessions ? ctx.regularSessions[index] : ctx.items[index]
}

export function enterNewSessionMode(ctx: KeyboardHandlerContext) {
  ctx.clearPendingKill()
  ctx.setAppMode(AppMode.NewSession)
  ctx.setViewMode(ViewMode.Projects)
  ctx.setAllItems(ctx.projectItems)
  ctx.setItems(ctx.projectItems)
  ctx.setCursor(Math.max(0, ctx.projectItems.length - 1))
  ctx.setSearchQuery('')
}

// Keys run an action only when the catalog allows it, and explain a refusal instead.
export function runAvailableAction(
  ctx: KeyboardHandlerContext,
  id: CommandId,
  run: (target: Item | undefined) => void
) {
  const refusal = describeUnavailableAction(getCommandEntry(ctx.actionContext, id))

  if (refusal) {
    setTimedMessage(ctx, refusal)

    return
  }

  run(getActionTargetItem(ctx.actionContext.target))
}

export function requestKillTarget(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'kill-session', item => {
    if (item) ctx.requestKillSession(item)
  })
}

export function openRenameTarget(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'rename-session', item => {
    if (!item) return
    ctx.clearPendingKill()
    ctx.openRenameModal(item)
  })
}

export function openAgentsTarget(ctx: KeyboardHandlerContext) {
  ctx.clearPendingKill()
  runAvailableAction(ctx, 'open-agents', () => {
    ctx.setAppMode(AppMode.AgentsManage)
    ctx.setAgentCursor(0)
  })
}

export function toggleDetailsPanel(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'toggle-details', () => {
    ctx.clearPendingKill()
    ctx.toggleDetails()
  })
}

export function openLastSession(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'last-session', () => {
    ctx.clearPendingKill()
    ctx.handleLastSession().catch(requestFatalShutdown)
  })
}

export function openSelectedRootSession(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'root-session', item => {
    ctx.clearPendingKill()
    ctx.handleRootSession(item).catch(requestFatalShutdown)
  })
}

export function openSelectedEditTarget(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'edit-target', item => {
    ctx.clearPendingKill()
    ctx.handleEditTarget(item).catch(requestFatalShutdown)
  })
}

export function togglePinnedTarget(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'toggle-pin-session', item => {
    if (!item) return
    ctx.clearPendingKill()
    ctx.togglePinnedSession(item.title).catch(requestFatalShutdown)
  })
}
