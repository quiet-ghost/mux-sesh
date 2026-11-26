import type { TextareaRenderable } from '@opentui/core'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  getAppTitle,
  getEmptyStateMessage,
  getListStyle,
  getScreenLayout,
  getStatusLabel,
} from './view'
import { syncTextareaValue } from './textarea'
import { getActionFooter, getActionKeyHint, type ActionContext } from './action-catalog'
import type { FocusOwner } from './focus-owner'
import type { DetailsInspectorState } from './inspector'
import { AppMode, ViewMode, type Config, type Item, type ThemeColors } from '../types'
import { isGitHubURL } from '../util/github'
import { shouldShowDetailPanel } from '../util/terminal'
import SearchInput from '../ui/SearchInput'
import SessionList from '../ui/SessionList'
import AgentSessionGroup from '../ui/AgentSessionGroup'
import ItemList from '../ui/ItemList'
import { truncateDialogText } from '../ui/dialog-layout'
import { getListRowWidth, getSessionViewport } from '../ui/session-viewport'
import SessionDetailsPanel from '../ui/SessionDetailsPanel'
import Toast from '../ui/Toast'
import VersionBadge, { formatVersionBadge } from '../ui/VersionBadge'
import { CURRENT_VERSION } from '../update/version'
import type { MultiplexerBackend } from '../multiplexer'

interface Props {
  theme: ThemeColors
  actionContext: ActionContext
  focusOwner: FocusOwner
  appMode: AppMode
  viewMode: ViewMode
  config: Config | null
  backend: MultiplexerBackend | null
  items: Item[]
  regularSessions: Item[]
  agentSessions: Item[]
  selectedPrimaryItem?: Item
  details: DetailsInspectorState
  cursor: number
  agentCursor: number
  searchQuery: string
  prefixActive: boolean
  pendingKillSessionName: string | null
  projectCount: number
  sessionItems: Item[]
  rows: number
  columns: number
  textareaRef: MutableRefObject<TextareaRenderable | null>
  setSearchQuery: Dispatch<SetStateAction<string>>
  message: string
  toastMessage: string
  toastVisible: boolean
  updatedVersion: string | null
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
  regularSessions,
  agentSessions,
  selectedPrimaryItem,
  details,
  cursor,
  agentCursor,
  searchQuery,
  prefixActive,
  pendingKillSessionName,
  projectCount,
  sessionItems,
  rows,
  columns,
  textareaRef,
  setSearchQuery,
  message,
  toastMessage,
  toastVisible,
  updatedVersion,
}: Props) {
  const title = getAppTitle(appMode, viewMode, backend?.kind)
  const totalSessions = sessionItems.filter(item => item.isSession).length
  const activeSessions = items.filter(item => item.isSession && item.isAttached).length

  const versionLabel = formatVersionBadge(
    CURRENT_VERSION,
    updatedVersion,
    process.env.MUX_SESH_DEV === '1'
  )

  const footerHint = getActionFooter(actionContext)
  const showDetailPanel = shouldShowDetailPanel(columns, appMode === AppMode.NewSession)

  const layout = getScreenLayout({
    rows,
    columns,
    appMode,
    showDetailPanel,
    message,
    versionLabel,
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
                {getStatusLabel(viewMode, activeSessions, totalSessions, projectCount)}
              </text>
            </box>

            {(appMode === AppMode.Search || appMode === AppMode.NewSession) && (
              <SearchInput
                key={appMode}
                appMode={appMode}
                searchQuery={searchQuery}
                textareaRef={textareaRef}
                focused={focusOwner.kind === 'search-field'}
                prefixActive={prefixActive}
                onContentChange={() => syncTextareaValue(textareaRef, setSearchQuery)}
              />
            )}

            <box
              style={{
                flexDirection: 'column',
                flexGrow: 1,
                flexShrink: 1,
                overflow: 'hidden',
              }}
            >
              {items.length === 0 ? (
                <text style={{ fg: theme.inactive }}>
                  {getEmptyStateMessage(appMode, searchQuery, isGitHubURL(searchQuery))}
                </text>
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
                    pendingKillSessionName={pendingKillSessionName}
                  />

                  {viewport.agents.kind === 'shown' && (
                    <AgentSessionGroup
                      sessions={agentSessions}
                      window={viewport.agents.window}
                      cursor={agentCursor}
                      active={agentsActive}
                      width={rowWidth}
                      icons={config?.icons}
                      pendingKillSessionName={pendingKillSessionName}
                    />
                  )}
                </>
              ) : (
                <ItemList
                  items={items}
                  cursor={cursor}
                  appMode={appMode}
                  maxItems={layout.sectionRows}
                  width={rowWidth}
                  searchQuery={searchQuery}
                  icons={config?.icons}
                  pendingKillSessionName={pendingKillSessionName}
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
            paddingLeft: 1,
            paddingRight: versionLabel.length + 3,
            width: '100%',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          {message && <text style={{ fg: theme.action }}>{message}</text>}
          <text style={{ fg: theme.textSubtle, wrapMode: 'none' }}>
            {truncateDialogText(footerHint, layout.footerWidth)}
          </text>
        </box>

        <Toast message={toastMessage} visible={toastVisible} />
        <VersionBadge
          currentVersion={CURRENT_VERSION}
          updatedVersion={updatedVersion}
          isDev={process.env.MUX_SESH_DEV === '1'}
        />
      </box>
    </>
  )
}
