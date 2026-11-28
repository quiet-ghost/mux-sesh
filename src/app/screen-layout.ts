import { isAgentSessionItem } from '../agents/session-name'
import { getPanelStyle } from '../styles/theme'
import { getNoMatchMessage } from '../ui/dialog-layout'
import { workspaceNoun } from '../multiplexer/types'
import { AppMode, ViewMode, type BackendKind, type ThemeColors } from '../types'
import { getActionKeyHint, type ActionContext } from './action-catalog'
import { getActionFooter } from './action-footer'
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
const SEARCH_INPUT_ROWS = 2
const LAUNCH_SUMMARY_ROWS = 2
const FOOTER_HINT_ROWS = 1
const LIST_PADDING_COLUMNS = 2

export interface ScreenLayoutInput {
  rows: number
  columns: number
  appMode: AppMode
  showDetailPanel: boolean
  // The row naming what Enter's frozen launch plan will do.
  showLaunchSummary: boolean
  // Rows the status line takes above and beyond the footer's own row.
  statusRows: number
}

export interface ScreenLayout {
  listWidth: number
  listContentWidth: number
  detailPanelWidth: number
  sectionRows: number
}

export function getScreenLayout({
  rows,
  columns,
  appMode,
  showDetailPanel,
  showLaunchSummary,
  statusRows,
}: ScreenLayoutInput): ScreenLayout {
  const detailPanelWidth = showDetailPanel ? Math.floor(columns * DETAIL_PANEL_SHARE) : 0

  const listWidth = Math.max(
    1,
    columns - (showDetailPanel ? detailPanelWidth + DETAIL_PANEL_GAP_COLUMNS : 0)
  )

  const searchRows =
    (appMode === AppMode.Search || appMode === AppMode.NewSession ? SEARCH_INPUT_ROWS : 0) +
    (showLaunchSummary ? LAUNCH_SUMMARY_ROWS : 0)

  return {
    listWidth,
    listContentWidth: Math.max(1, listWidth - LIST_PADDING_COLUMNS),
    detailPanelWidth,
    sectionRows: Math.max(1, rows - HEADER_ROWS - searchRows - statusRows - FOOTER_HINT_ROWS),
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

  return getNoMatchMessage(searchQuery, 'No items found')
}

// Search's next step when nothing matches: New, under the key that reaches it from here.
export function getSearchNoMatchHint(context: ActionContext): string {
  const noun = context.backend ? workspaceNoun(context.backend.kind) : 'session'
  const direct = getActionKeyHint(context, 'new-session')

  if (direct) return `${direct} to start a new ${noun}`

  const cancel = getActionFooter(context).global.find(hint => hint.id === 'cancel')?.key
  const fromNormal = getActionKeyHint({ ...context, appMode: AppMode.Normal }, 'new-session')

  return cancel && fromNormal ? `${cancel}, then ${fromNormal} to start a new ${noun}` : ''
}

// The search field's count: every row while the query is blank, else matches of every row.
export function getResultCount(query: string, matches: number, total: number): string {
  return query.trim() ? `${matches} of ${total}` : `${total}`
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
