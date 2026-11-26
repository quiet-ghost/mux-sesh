import { isAgentSessionItem } from '../agents/session-name'
import { getPanelStyle } from '../styles/theme'
import { getWrappedRowCount } from '../ui/session-viewport'
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

const DETAIL_PANEL_SHARE = 0.4
const DETAIL_PANEL_GAP_COLUMNS = 1
const HEADER_ROWS = 2
const SEARCH_INPUT_ROWS = 4
const FOOTER_HINT_ROWS = 1
const FOOTER_PADDING_COLUMNS = 1
const VERSION_BADGE_GAP_COLUMNS = 3
const LIST_PADDING_COLUMNS = 2

export interface ScreenLayoutInput {
  rows: number
  columns: number
  appMode: AppMode
  showDetailPanel: boolean
  message: string
  versionLabel: string
}

export interface ScreenLayout {
  listWidth: number
  listContentWidth: number
  detailPanelWidth: number
  footerWidth: number
  sectionRows: number
}

export function getScreenLayout({
  rows,
  columns,
  appMode,
  showDetailPanel,
  message,
  versionLabel,
}: ScreenLayoutInput): ScreenLayout {
  const detailPanelWidth = showDetailPanel ? Math.floor(columns * DETAIL_PANEL_SHARE) : 0

  const listWidth = Math.max(
    1,
    columns - (showDetailPanel ? detailPanelWidth + DETAIL_PANEL_GAP_COLUMNS : 0)
  )

  const footerWidth = Math.max(
    1,
    columns - FOOTER_PADDING_COLUMNS - versionLabel.length - VERSION_BADGE_GAP_COLUMNS
  )

  const searchRows =
    appMode === AppMode.Search || appMode === AppMode.NewSession ? SEARCH_INPUT_ROWS : 0

  const messageRows = message ? getWrappedRowCount(message, footerWidth) : 0

  return {
    listWidth,
    listContentWidth: Math.max(1, listWidth - LIST_PADDING_COLUMNS),
    detailPanelWidth,
    footerWidth,
    sectionRows: Math.max(1, rows - HEADER_ROWS - searchRows - messageRows - FOOTER_HINT_ROWS),
  }
}

export function getListStyle(theme: ThemeColors, width: number) {
  return {
    ...getPanelStyle(theme, 'full'),
    width,
    paddingTop: 0,
    paddingBottom: 0,
    flexShrink: 0,
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
