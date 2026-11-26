import { isAgentSessionItem } from '../agents/session-name'
import { getPanelStyle } from '../styles/theme'
import { getWrappedRowCount } from '../ui/session-viewport'
import { AppMode, ViewMode, type BackendKind, type ThemeColors } from '../types'
import type { NewSessionStepKind } from './new-session-step'

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
const NEW_SESSION_SUMMARY_ROWS = 2
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
    appMode === AppMode.Search
      ? SEARCH_INPUT_ROWS
      : appMode === AppMode.NewSession
        ? SEARCH_INPUT_ROWS + NEW_SESSION_SUMMARY_ROWS
        : 0

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

export function getEmptyStateMessage(
  appMode: AppMode,
  searchQuery: string,
  isGitHubURL: boolean
): string {
  if (appMode === AppMode.NewSession && searchQuery && isGitHubURL) {
    return 'Clone & create session'
  }

  // No match is never an implicit name; the summary row says what Enter can do instead.
  if (appMode === AppMode.NewSession) {
    return searchQuery ? 'No matching projects' : 'No projects found'
  }

  return 'No items found'
}

// Names the New step in the header so the shared text field never looks like the project query.
export function getNewSessionStepTitle(step: NewSessionStepKind): string | undefined {
  switch (step) {
    case 'browse':
      return undefined
    case 'edit-name':
      return 'Name'
    case 'edit-startup':
      return 'Startup command'
    case 'named-here':
      return 'Named here'
    case 'file':
      return 'Open file'
  }
}

export function getNewSessionPlaceholder(step: NewSessionStepKind): string {
  switch (step) {
    case 'browse':
      return 'Type a project name, path, or GitHub URL...'
    case 'edit-name':
      return 'Session name...'
    case 'edit-startup':
      return 'Startup command; leave empty to run nothing...'
    case 'named-here':
      return 'Name for a new session in the current directory...'
    case 'file':
      return 'Type a file name or file path...'
  }
}

export function getFileStepEmptyMessage(query: string): string {
  return query.trim() ? 'No matching files' : 'Type to search files'
}
