import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { AppMode, ViewMode, type Config, type Item, type OpencodeSessionStats } from '../../types'

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
  requestKillSession: (sessionName: string) => void
  togglePinnedSession: (sessionName: string) => Promise<void>
  clearPendingKill: () => void
  handleSelect: (item: Item) => Promise<void>
  handleKillSession: (sessionName: string) => Promise<void>
  handleLastSession: () => Promise<void>
  handleRootSession: (item?: Item) => Promise<void>
  handleEditTarget: (item?: Item) => Promise<void>
  openRenameModal: (sessionName: string) => void
  openCommandsModal: () => void
  openSettingsModal: () => void
  loadOpencodeStatsForSession: (sessionName: string) => Promise<OpencodeSessionStats | null>
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

export function openSelectedRootSession(ctx: KeyboardHandlerContext) {
  ctx.clearPendingKill()
  void ctx.handleRootSession(getSelectedItem(ctx))
}

export function openSelectedEditTarget(ctx: KeyboardHandlerContext) {
  ctx.clearPendingKill()
  const item = getSelectedItem(ctx)
  if (item?.itemKind === 'configured') {
    void ctx.handleEditTarget(item)
  }
}
