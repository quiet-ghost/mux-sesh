import { refreshProjectDiscovery } from '../tmux/projects'
import { getActionTarget, type CommandId } from './action-catalog'
import { getNewSessionSeed, openNewSession } from './launcher-query'
import { AppMode, ViewMode, type Item, type KeybindMode } from '../types'

interface ExecuteCommandContext {
  keybindMode: KeybindMode
  viewMode: ViewMode
  agentSessions: Item[]
  selectedPrimaryItem?: Item
  sessionCandidateItems: Item[]
  projectSourceItems: Item[]
  closeModal: () => void
  openRenameModal: (item: Item) => void
  openSettingsModal: () => void
  openSettingOptions: (field: 'theme') => void
  requestKillSession: (item: Item) => void
  togglePinnedSession: (sessionName: string) => Promise<void>
  setAppMode: (mode: AppMode) => void
  setViewMode: (mode: ViewMode) => void
  setAllItems: (items: Item[]) => void
  setItems: (items: Item[]) => void
  setCursor: (cursor: number) => void
  setSearchQuery: (value: string) => void
  setAgentCursor: (cursor: number) => void
  refreshItems: (forceViewMode?: ViewMode) => Promise<void>
  handleLastSession: () => Promise<void>
  handleRootSession: (item?: Item) => Promise<void>
  handleEditTarget: (item?: Item) => Promise<void>
  showMessage: (message: string, timeout?: number) => void
  toggleDetails: () => void
}

// The palette refuses unavailable commands first; these guards only keep the target exact.
export async function executeCommand(commandID: CommandId, ctx: ExecuteCommandContext) {
  const target = getActionTarget(ctx.selectedPrimaryItem)

  switch (commandID) {
    case 'search':
      ctx.closeModal()
      ctx.setAppMode(AppMode.Search)
      ctx.setSearchQuery('')

      return
    case 'new-session':
      ctx.closeModal()
      openNewSession(ctx, getNewSessionSeed(ctx.sessionCandidateItems, ctx.projectSourceItems))

      return

    case 'open-settings':
      ctx.openSettingsModal()

      return
    case 'open-themes':
      ctx.openSettingOptions('theme')

      return
    case 'view-projects':
      ctx.closeModal()
      ctx.setViewMode(ViewMode.Projects)
      await ctx.refreshItems(ViewMode.Projects)

      return
    case 'view-sessions':
      ctx.closeModal()
      ctx.setViewMode(ViewMode.Sessions)
      await ctx.refreshItems(ViewMode.Sessions)

      return
    case 'rename-session':
      if (target.kind === 'session') {
        ctx.openRenameModal(target.item)
      }

      return
    case 'kill-session':
      if (target.kind === 'session') {
        ctx.closeModal()
        ctx.requestKillSession(target.item)
      }

      return
    case 'toggle-pin-session':
      if (
        ctx.viewMode === ViewMode.Sessions &&
        (target.kind === 'session' || target.kind === 'configured')
      ) {
        ctx.closeModal()
        await ctx.togglePinnedSession(target.item.title)
      }

      return
    case 'last-session':
      ctx.closeModal()
      await ctx.handleLastSession()

      return
    case 'root-session':
      ctx.closeModal()
      await ctx.handleRootSession(ctx.selectedPrimaryItem)

      return
    case 'edit-target':
      ctx.closeModal()
      await ctx.handleEditTarget(ctx.selectedPrimaryItem)

      return
    case 'open-agents':
      ctx.closeModal()

      if (ctx.viewMode === ViewMode.Sessions && ctx.agentSessions.length > 0) {
        ctx.setAppMode(AppMode.AgentsManage)
        ctx.setAgentCursor(0)
      }

      return
    case 'refresh':
      ctx.closeModal()
      refreshProjectDiscovery()
      await ctx.refreshItems()
      ctx.showMessage('Refreshed')

      return
    case 'toggle-details':
      ctx.closeModal()
      ctx.toggleDetails()

      return
    case 'back':
      ctx.closeModal()
      ctx.setAppMode(ctx.keybindMode === 'standard' ? AppMode.Search : AppMode.Normal)

      return
  }
}
