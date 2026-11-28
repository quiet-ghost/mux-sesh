import type { TextareaRenderable } from '@opentui/core'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  getAppTitle,
  getEmptyStateMessage,
  getFileStepEmptyMessage,
  getListStyle,
  getNewSessionPlaceholder,
  getNewSessionStepTitle,
  getResultCount,
  getScreenLayout,
  getSearchNoMatchHint,
  getStatusLabel,
} from './screen-layout'
import { syncTextareaValue } from './textarea'
import { getActionFooter, getActionKeyHint, type ActionContext } from './action-catalog'
import type { FocusOwner } from './focus-owner'
import { getLaunchScope } from './launch-scope'
import { getNewSessionEnterAction, type NewSessionSteps } from './new-session-step'
import type { DetailsInspectorState } from './inspector'
import type { QueuedToast } from './notifications'
import { PendingClose } from './pending-close'
import { AppMode, ViewMode, type Config, type Item, type ThemeColors } from '../types'
import { isGitHubURL } from '../sessions/github-url'
import { shouldShowDetailPanel } from '../ui/terminal-size'
import SearchInput from '../ui/SearchInput'
import SessionList from '../ui/SessionList'
import AgentSessionGroup from '../ui/AgentSessionGroup'
import ResultList from '../ui/ResultList'
import { getListRowWidth, getSessionViewport } from '../ui/session-viewport'
import SessionDetailsPanel from '../ui/SessionDetailsPanel'
import { BusySpinner } from '../ui/Spinner'
import NewSessionSummary from '../ui/NewSessionSummary'
import { getSelectedRowAction } from '../ui/launch-preview'
import Footer from '../ui/Footer'
import { getStatusRows, type StatusLine } from '../ui/status-line'
import { formatVersionBadge } from '../ui/VersionBadge'
import { CURRENT_VERSION } from '../update/version'
import type { MultiplexerBackend } from '../multiplexer'
import type { LaunchPreview } from '../sessions/launch-plan'

interface Props {
  theme: ThemeColors
  actionContext: ActionContext
  focusOwner: FocusOwner
  appMode: AppMode
  viewMode: ViewMode
  config: Config | null
  backend: MultiplexerBackend | null
  items: Item[]
  // The unfiltered rows Search filters; the field counts matches against them.
  allItems: Item[]
  regularSessions: Item[]
  agentSessions: Item[]
  selectedPrimaryItem?: Item
  details: DetailsInspectorState
  cursor: number
  agentCursor: number
  searchQuery: string
  launchPreview: LaunchPreview
  newSession: NewSessionSteps
  prefixActive: boolean
  markedItems: ReadonlyMap<string, Item>
  projectCount: number
  sessionItems: Item[]
  rows: number
  columns: number
  textareaRef: MutableRefObject<TextareaRenderable | null>
  setSearchQuery: Dispatch<SetStateAction<string>>
  // Persistent status, such as stale inventory; transient feedback is a notice in the footer.
  statusLines: readonly StatusLine[]
  toast: QueuedToast | undefined
  moreToasts: number
  updatedVersion: string | null
}

function syncNewSessionField(
  textareaRef: MutableRefObject<TextareaRenderable | null>,
  setField: (text: string) => void
): void {
  const text = textareaRef.current?.plainText

  if (text !== undefined) setField(text)
}

export function AppScreen({
  theme,
  actionContext,
  focusOwner,
  appMode,
  viewMode,
  config,
  backend,
  items,
  allItems,
  regularSessions,
  agentSessions,
  selectedPrimaryItem,
  details,
  cursor,
  agentCursor,
  searchQuery,
  launchPreview,
  newSession,
  prefixActive,
  markedItems,
  projectCount,
  sessionItems,
  rows,
  columns,
  textareaRef,
  setSearchQuery,
  statusLines,
  toast,
  moreToasts,
  updatedVersion,
}: Props) {
  const newSessionActive = appMode === AppMode.NewSession
  const step = newSessionActive ? newSession.step.kind : 'browse'
  const stepTitle = getNewSessionStepTitle(step)
  const baseTitle = getAppTitle(appMode, viewMode, backend?.kind)
  const title = stepTitle ? `${baseTitle} · ${stepTitle}` : baseTitle
  const fileStep = newSession.step.kind === 'file' && newSessionActive ? newSession.step : undefined
  const listItems = fileStep ? [...newSession.fileItems] : items
  const listCursor = fileStep ? fileStep.cursor : cursor
  const listQuery = fileStep ? fileStep.query : searchQuery
  const totalSessions = sessionItems.filter(item => item.isSession).length
  // Unfiltered, so a search never changes the header; the field shows the result count.
  const activeSessions = sessionItems.filter(item => item.isSession && item.isAttached).length
  const searchActive = appMode === AppMode.Search
  const noMatch = searchActive && listItems.length === 0 && searchQuery.trim().length > 0

  const versionLabel = formatVersionBadge(
    CURRENT_VERSION,
    updatedVersion,
    process.env.MUX_SESH_DEV === '1'
  )

  const footer = getActionFooter(
    actionContext,
    getNewSessionEnterAction(step, launchPreview),
    newSessionActive ? newSession.keys : []
  )

  const closingKey = PendingClose.keyOf(actionContext.pendingClose)
  const showDetailPanel = shouldShowDetailPanel(columns, appMode === AppMode.NewSession)
  const showLaunchSummary = getLaunchScope(appMode, viewMode, selectedPrimaryItem) !== 'none'

  const layout = getScreenLayout({
    rows,
    columns,
    appMode,
    showDetailPanel,
    showLaunchSummary,
    statusRows: getStatusRows(toast, moreToasts, statusLines, columns, versionLabel),
  })

  const rowWidth = getListRowWidth(layout.listContentWidth)

  const showSections =
    viewMode === ViewMode.Sessions &&
    (appMode === AppMode.Normal || appMode === AppMode.AgentsManage)

  const agentsActive = appMode === AppMode.AgentsManage

  const viewport = getSessionViewport({
    rows: layout.sectionRows,
    sessions: regularSessions,
    agents: agentSessions,
    cursor,
    agentCursor,
    agentsActive,
  })

  return (
    <>
      <box
        style={{
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: theme.background,
        }}
      >
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'stretch',
            width: '100%',
            flexGrow: 1,
            flexShrink: 1,
            gap: showDetailPanel ? 1 : 0,
          }}
        >
          <box style={getListStyle(theme, layout.listWidth)}>
            <box
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 1,
                flexShrink: 0,
              }}
            >
              <text style={{ wrapMode: 'none' }}>
                <span style={{ fg: theme.text }}>mux-sesh</span>
                <span style={{ fg: theme.textSubtle }}>{`  ${title}`}</span>
              </text>
              <text style={{ fg: theme.textMuted, wrapMode: 'none' }}>
                <BusySpinner />
                {getStatusLabel(viewMode, activeSessions, totalSessions, projectCount)}
              </text>
            </box>

            {(appMode === AppMode.Search || appMode === AppMode.NewSession) && (
              <SearchInput
                key={appMode}
                appMode={appMode}
                searchQuery={newSessionActive ? newSession.field : searchQuery}
                textareaRef={textareaRef}
                focused={focusOwner.kind === 'search-field'}
                placeholder={newSessionActive ? getNewSessionPlaceholder(step) : undefined}
                count={
                  searchActive
                    ? getResultCount(searchQuery, items.length, allItems.length)
                    : undefined
                }
                onContentChange={() =>
                  newSessionActive
                    ? syncNewSessionField(textareaRef, newSession.setField)
                    : syncTextareaValue(textareaRef, setSearchQuery)
                }
              />
            )}

            {showLaunchSummary && (
              <NewSessionSummary preview={launchPreview} width={layout.listContentWidth} />
            )}

            <box
              style={{
                flexDirection: 'column',
                flexGrow: 1,
                flexShrink: 1,
                overflow: 'hidden',
              }}
            >
              {listItems.length === 0 ? (
                <>
                  <text style={{ fg: theme.inactive }}>
                    {fileStep
                      ? getFileStepEmptyMessage(fileStep.query)
                      : getEmptyStateMessage(appMode, searchQuery, isGitHubURL(searchQuery))}
                  </text>
                  {noMatch && (
                    <text style={{ fg: theme.textMuted }}>
                      {getSearchNoMatchHint(actionContext)}
                    </text>
                  )}
                </>
              ) : showSections ? (
                <>
                  <SessionList
                    items={regularSessions}
                    window={viewport.sessions}
                    cursor={cursor}
                    active={!agentsActive}
                    width={rowWidth}
                    emptyLabel={backend?.kind === 'herdr' ? 'No workspaces' : 'No sessions'}
                    searchQuery={searchQuery}
                    icons={config?.icons}
                    marked={markedItems}
                    closingKey={closingKey}
                  />

                  {viewport.agents.kind === 'shown' && (
                    <AgentSessionGroup
                      sessions={agentSessions}
                      window={viewport.agents.window}
                      cursor={agentCursor}
                      active={agentsActive}
                      width={rowWidth}
                      icons={config?.icons}
                      marked={markedItems}
                      closingKey={closingKey}
                    />
                  )}
                </>
              ) : (
                <ResultList
                  items={listItems}
                  cursor={listCursor}
                  maxItems={layout.sectionRows}
                  width={rowWidth}
                  searchQuery={listQuery}
                  actions={
                    newSessionActive
                      ? { kind: 'launch', selected: getSelectedRowAction(launchPreview) }
                      : { kind: 'none' }
                  }
                  icons={config?.icons}
                  marked={markedItems}
                  closingKey={closingKey}
                />
              )}
            </box>
          </box>

          {showDetailPanel && (
            <SessionDetailsPanel
              width={layout.detailPanelWidth}
              selectedItem={selectedPrimaryItem}
              mode={details.mode}
              view={details.view}
              inspectHint={getActionKeyHint(actionContext, 'toggle-details')}
            />
          )}
        </box>

        <box
          style={{
            backgroundColor: theme.surface,
            width: '100%',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          <Footer
            footer={footer}
            width={columns}
            version={versionLabel}
            prefixActive={prefixActive}
            notice={toast}
            moreNotices={moreToasts}
            statusLines={statusLines}
          />
        </box>
      </box>
    </>
  )
}
