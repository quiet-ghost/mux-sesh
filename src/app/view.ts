import { getPanelStyle } from '../styles/theme'
import { isOpencodeSessionItem } from '../opencode/session-name'
import { AppMode, ViewMode, type ThemeColors } from '../types'

export function splitVisibleSessions<T extends { isSession: boolean; title: string }>(
  items: readonly T[]
) {
  return {
    regularSessions: items.filter(item => !isOpencodeSessionItem(item)),
    opencodeSessions: items.filter(isOpencodeSessionItem),
  }
}

export function getAppTitle(appMode: AppMode, viewMode: ViewMode): string {
  if (appMode === AppMode.Search) {
    return 'Search'
  }

  if (appMode === AppMode.NewSession) {
    return 'New Session'
  }

  if (appMode === AppMode.OpencodeManage) {
    return 'OpenCode Sessions'
  }

  return viewMode === ViewMode.Projects ? 'Projects' : 'Sessions'
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

export function getFooterHint(appMode: AppMode, prefixKey?: string): string {
  const prefixLabel = prefixKey ? `${prefixKey} ...` : 'direct keys'

  if (appMode === AppMode.OpencodeManage) {
    return `o back  d kill  ctrl+p commands  ${prefixLabel}`
  }

  if (appMode === AppMode.NewSession) {
    return 'enter create  esc cancel'
  }

  if (appMode === AppMode.Search) {
    return 'enter select  esc cancel'
  }

  return `enter select  i search  n new  o opencode  d kill  ctrl+p commands  ${prefixLabel}`
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
