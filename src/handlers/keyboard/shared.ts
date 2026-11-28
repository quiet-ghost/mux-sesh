import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  describeUnavailableAction,
  getActionTargetItem,
  getCommandEntry,
  type ActionContext,
  type CommandId,
} from '../../app/action-catalog'
import { openNewSession } from '../../app/launcher-query'
import type { ShowToast } from '../../app/notifications'
import { refreshProjectDiscovery } from '../../projects/project-items'
import { AppMode, ViewMode, type Config, type Item } from '../../types'

export interface KeyboardInput {
  name?: string
  ctrl?: boolean
  shift?: boolean
}

export interface KeyboardHandlerContext {
  // Owns every promise a key starts: expected failures are shown, defects go to crash recovery.
  runAction: (task: () => Promise<void>) => void
  appMode: AppMode
  viewMode: ViewMode
  items: Item[]
  regularSessions: Item[]
  agentSessions: Item[]
  cursor: number
  agentCursor: number
  searchQuery: string
  actionContext: ActionContext
  prefixKey: string
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
  // Refreshes the list and confirms it once published.
  refreshList: () => Promise<void>
  requestKillSession: (item: Item) => void
  requestMarkedClose: () => Promise<void>
  toggleMark: (item: Item) => void
  togglePinnedSession: (sessionName: string) => Promise<void>
  handleSelect: (item: Item) => Promise<void>
  // Runs the frozen launch plan for the highlighted Projects row, the one the footer names.
  launchPlanned: () => Promise<void>
  // Plans another Projects row with the same planner and runs that plan, under the same guard.
  launchProjectRow: (item: Item) => Promise<void>
  handleLastSession: () => Promise<void>
  handleRootSession: (item?: Item) => Promise<void>
  handleEditTarget: (item?: Item) => Promise<void>
  openRenameModal: (item: Item) => void
  openCommandsModal: () => void
  toggleDetails: () => void
  openSettingsModal: () => void
  showToast: ShowToast
}

export function getKeyName(key: KeyboardInput): string {
  return key.name ?? ''
}

export function matchesPrefixKey(key: KeyboardInput, prefixKey: string): boolean {
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

export function refreshList(ctx: KeyboardHandlerContext) {
  refreshProjectDiscovery()
  ctx.runAction(ctx.refreshList)
}

export function getSelectedItem(ctx: KeyboardHandlerContext): Item | undefined {
  return ctx.viewMode === ViewMode.Sessions
    ? ctx.regularSessions[ctx.cursor]
    : ctx.items[ctx.cursor]
}

// A Projects row opens exactly as New would plan it; every other row opens directly.
export function openSelectedItem(ctx: KeyboardHandlerContext, item: Item | undefined): void {
  if (!item) return

  if (ctx.viewMode === ViewMode.Projects) {
    ctx.runAction(ctx.launchPlanned)

    return
  }

  ctx.runAction(() => ctx.handleSelect(item))
}

function getQuickSelectItem(ctx: KeyboardHandlerContext, index: number): Item | undefined {
  return ctx.viewMode === ViewMode.Sessions ? ctx.regularSessions[index] : ctx.items[index]
}

// A Projects row opens through a launch plan, as Enter would: the highlighted row runs the plan the
// screen shows, and another row is highlighted and runs its own plan, made now.
export function openQuickSelectItem(ctx: KeyboardHandlerContext, index: number): void {
  const item = getQuickSelectItem(ctx, index)

  if (!item) return

  if (ctx.viewMode !== ViewMode.Projects) {
    ctx.runAction(() => ctx.handleSelect(item))

    return
  }

  if (index === ctx.cursor) {
    ctx.runAction(ctx.launchPlanned)

    return
  }

  ctx.setCursor(index)
  ctx.runAction(() => ctx.launchProjectRow(item))
}

export function enterNewSessionMode(ctx: KeyboardHandlerContext) {
  openNewSession(ctx, ctx.projectItems)
}

// Keys run an action only when the catalog allows it, and explain a refusal instead.
function runAvailableAction(
  ctx: KeyboardHandlerContext,
  id: CommandId,
  run: (target: Item | undefined) => void
) {
  const refusal = describeUnavailableAction(getCommandEntry(ctx.actionContext, id))

  if (refusal) {
    ctx.showToast({ kind: 'warning', message: refusal })

    return
  }

  run(getActionTargetItem(ctx.actionContext.target))
}

// With rows marked, close reviews exactly the marked set; otherwise the row under the cursor.
export function requestKillTarget(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'kill-session', item => {
    if (ctx.actionContext.marked.size > 0) {
      ctx.runAction(ctx.requestMarkedClose)

      return
    }

    if (item) ctx.requestKillSession(item)
  })
}

export function toggleMarkTarget(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'mark-target', item => {
    if (item) ctx.toggleMark(item)
  })
}

export function openRenameTarget(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'rename-session', item => {
    if (!item) return
    ctx.openRenameModal(item)
  })
}

export function openAgentsTarget(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'open-agents', () => {
    ctx.setAppMode(AppMode.AgentsManage)
    ctx.setAgentCursor(0)
  })
}

export function toggleDetailsPanel(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'toggle-details', () => {
    ctx.toggleDetails()
  })
}

export function openLastSession(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'last-session', () => {
    ctx.runAction(ctx.handleLastSession)
  })
}

export function openSelectedRootSession(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'root-session', item => {
    ctx.runAction(() => ctx.handleRootSession(item))
  })
}

export function openSelectedEditTarget(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'edit-target', item => {
    ctx.runAction(() => ctx.handleEditTarget(item))
  })
}

export function togglePinnedTarget(ctx: KeyboardHandlerContext) {
  runAvailableAction(ctx, 'toggle-pin-session', item => {
    if (!item) return
    ctx.runAction(() => ctx.togglePinnedSession(item.title))
  })
}
