import { isAgentSessionItem } from '../agents/session-name'
import { getPanelStyle } from '../styles/theme'
import { AppMode, ViewMode, type BackendKind, type Item, type ThemeColors } from '../types'
import { getActionFooter, getActionTarget } from './action-catalog'

export function splitVisibleSessions<T extends { isSession: boolean; title: string }>(
  items: readonly T[]
) {
  return {
    regularSessions: items.filter(item => !isAgentSessionItem(item)),
    agentSessions: items.filter(isAgentSessionItem),
  }
}

export function getAppTitle(
  appMode: AppMode,
  viewMode: ViewMode,
  backend: BackendKind = 'tmux'
): string {
  if (appMode === AppMode.Search) {
    return 'Search'
  }

  if (appMode === AppMode.NewSession) {
    return backend === 'herdr' ? 'New Workspace' : 'New Session'
  }

  if (appMode === AppMode.AgentsManage) {
    return 'Agent Sessions'
  }

  return viewMode === ViewMode.Projects
    ? 'Projects'
    : backend === 'herdr'
      ? 'Workspaces'
      : 'Sessions'
}

export function getListStyle(theme: ThemeColors, appMode: AppMode) {
  if (appMode === AppMode.NewSession) {
    return {
      ...getPanelStyle(theme, 'full'),
      flexGrow: 1,
      flexShrink: 1,
    }
  }

  return {
    ...getPanelStyle(theme, 'split'),
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 40,
  }
}

export function getStatusLabel(
  viewMode: ViewMode,
  activeSessions: number,
  totalSessions: number,
  projectCount: number
): string {
  return viewMode === ViewMode.Sessions
    ? `${activeSessions}/${totalSessions} active`
    : `${projectCount} projects`
}

// Callers with the full context should use getActionFooter. Without it this assumes vim keys,
// an unresolved backend, and no agents, so it never advertises a key it cannot confirm.
export function getFooterHint(appMode: AppMode, prefixKey?: string, selectedItem?: Item): string {
  const target = getActionTarget(selectedItem)

  return getActionFooter({
    appMode,
    viewMode:
      target.kind === 'project' || target.kind === 'file' ? ViewMode.Projects : ViewMode.Sessions,
    keybindMode: 'vim',
    prefixKey,
    backend: null,
    agentCount: 0,
    target,
  })
}

export function getEmptyStateMessage(
  appMode: AppMode,
  searchQuery: string,
  isGitHubURL: boolean
): string {
  if (appMode === AppMode.NewSession && searchQuery && isGitHubURL) {
    return 'Clone & create session'
  }

  if (appMode === AppMode.NewSession && searchQuery) {
    return `Create session: ${searchQuery}`
  }

  return 'No items found'
}
