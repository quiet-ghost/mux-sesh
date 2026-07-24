import { isOpencodeSessionName } from '../opencode/session-name'
import type { CommandId } from '../ui/CommandsModal'
import { AppMode, ViewMode, type Item } from '../types'

interface ExecuteCommandContext {
  appMode: AppMode
  viewMode: ViewMode
  cursor: number
  agentCursor: number
  regularSessions: Item[]
  agentSessions: Item[]
  selectedPrimaryItem?: Item
  sessionCandidateItems: Item[]
  projectSourceItems: Item[]
  closeModal: () => void
  openRenameModal: (sessionName: string) => void
  openSettingsModal: () => void
  requestKillSession: (sessionName: string) => void
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
  loadOpencodeStatsForSession: (sessionName: string) => Promise<unknown>
  showMessage: (message: string, timeout?: number) => void
}

export async function executeCommand(commandID: CommandId, ctx: ExecuteCommandContext) {
  switch (commandID) {
    case 'search':
      ctx.closeModal()
      ctx.setAppMode(AppMode.Search)
      ctx.setSearchQuery('')
      return
    case 'new-session': {
      const items =
        ctx.sessionCandidateItems.length > 0 ? ctx.sessionCandidateItems : ctx.projectSourceItems
      ctx.closeModal()
      ctx.setAppMode(AppMode.NewSession)
      ctx.setViewMode(ViewMode.Projects)
      ctx.setAllItems(items)
      ctx.setItems(items)
      ctx.setCursor(Math.max(0, items.length - 1))
      ctx.setSearchQuery('')
      return
    }
    case 'open-settings':
      ctx.openSettingsModal()
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
    case 'rename-session': {
      const target =
        ctx.appMode === AppMode.AgentsManage
          ? ctx.agentSessions[ctx.agentCursor]
          : ctx.viewMode === ViewMode.Sessions
            ? ctx.regularSessions[ctx.cursor]
            : undefined
      if (target?.isSession) {
        ctx.openRenameModal(target.title)
      }
      return
    }
    case 'kill-session': {
      const target =
        ctx.appMode === AppMode.AgentsManage
          ? ctx.agentSessions[ctx.agentCursor]
          : ctx.viewMode === ViewMode.Sessions
            ? ctx.regularSessions[ctx.cursor]
            : undefined
      if (target?.isSession) {
        ctx.closeModal()
        ctx.requestKillSession(target.title)
      }
      return
    }
    case 'toggle-pin-session': {
      const target =
        ctx.viewMode === ViewMode.Sessions ? ctx.regularSessions[ctx.cursor] : undefined
      if (target) {
        ctx.closeModal()
        await ctx.togglePinnedSession(target.title)
      }
      return
    }
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
        const firstAgent = ctx.agentSessions[0].title
        if (isOpencodeSessionName(firstAgent)) {
          await ctx.loadOpencodeStatsForSession(firstAgent)
        }
      }
      return
    case 'refresh':
      ctx.closeModal()
      await ctx.refreshItems()
      ctx.showMessage('Refreshed')
      return
    case 'back':
      ctx.closeModal()
      ctx.setAppMode(AppMode.Normal)
      return
  }
}
