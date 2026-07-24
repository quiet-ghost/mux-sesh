import type { TextareaRenderable } from '@opentui/core'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  getAppTitle,
  getEmptyStateMessage,
  getFooterHint,
  getListStyle,
  getStatusLabel,
} from './view'
import { syncTextareaValue } from './textarea'
import { isOpencodeSessionItem } from '../opencode/session-name'
import { AppMode, ViewMode, type Config, type Item, type ThemeColors } from '../types'
import { isGitHubURL } from '../util/github'
import { shouldShowDetailPanel } from '../util/terminal'
import SearchInput from '../ui/SearchInput'
import SessionList from '../ui/SessionList'
import AgentSessionGroup from '../ui/AgentSessionGroup'
import ItemList from '../ui/ItemList'
import OpencodeStatsPanel from '../ui/OpencodeStatsPanel'
import SessionDetailsPanel from '../ui/SessionDetailsPanel'
import Toast from '../ui/Toast'
import VersionBadge, { formatVersionBadge } from '../ui/VersionBadge'
import { CURRENT_VERSION } from '../update/version'

interface Props {
  theme: ThemeColors
  appMode: AppMode
  viewMode: ViewMode
  config: Config | null
  items: Item[]
  regularSessions: Item[]
  agentSessions: Item[]
  selectedPrimaryItem?: Item
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
  appMode,
  viewMode,
  config,
  items,
  regularSessions,
  agentSessions,
  selectedPrimaryItem,
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
  const title = getAppTitle(appMode, viewMode)
  const listStyle = getListStyle(theme, appMode)
  const totalSessions = sessionItems.filter(item => item.isSession).length
  const activeSessions = items.filter(item => item.isSession && item.isAttached).length
  const maxVisibleItems = Math.max(8, rows - (appMode === AppMode.NewSession ? 10 : 12))
  const versionLabel = formatVersionBadge(CURRENT_VERSION, updatedVersion)
  const selectedAgentSession = agentSessions[agentCursor]
  const showOpencodeStats =
    viewMode === ViewMode.Sessions &&
    appMode === AppMode.AgentsManage &&
    selectedAgentSession !== undefined &&
    isOpencodeSessionItem(selectedAgentSession)
  const footerHint = getFooterHint(appMode, config?.prefixKey)

  return (
    <>
      <box
        style={{
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          gap: 1,
          backgroundColor: theme.background,
        }}
      >
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'stretch',
            justifyContent: 'center',
            width: '100%',
            flexGrow: 1,
            flexShrink: 1,
            gap: 1,
          }}
        >
          <box style={listStyle}>
            <box style={{ justifyContent: 'space-between', marginBottom: 1 }}>
              <box style={{ flexDirection: 'column' }}>
                <text style={{ fg: theme.text }}>mux-sesh</text>
                <text style={{ fg: theme.textSubtle }}>{title}</text>
              </box>
              <box style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
                <text style={{ fg: theme.textMuted }}>
                  {getStatusLabel(viewMode, activeSessions, totalSessions, projectCount)}
                </text>
              </box>
            </box>

            {(appMode === AppMode.Search || appMode === AppMode.NewSession) && (
              <SearchInput
                key={appMode}
                appMode={appMode}
                searchQuery={searchQuery}
                textareaRef={textareaRef}
                prefixActive={prefixActive}
                onContentChange={() => syncTextareaValue(textareaRef, setSearchQuery)}
              />
            )}

            <box
              style={{
                alignSelf: 'auto',
                flexDirection: 'column',
                flexGrow: 0,
                flexShrink: 0,
                marginTop:
                  viewMode === ViewMode.Sessions &&
                  (appMode === AppMode.Normal || appMode === AppMode.AgentsManage)
                    ? 1
                    : 0,
              }}
            >
              {items.length === 0 ? (
                <text style={{ fg: theme.inactive }}>
                  {getEmptyStateMessage(appMode, searchQuery, isGitHubURL(searchQuery))}
                </text>
              ) : viewMode === ViewMode.Sessions &&
                (appMode === AppMode.Normal || appMode === AppMode.AgentsManage) ? (
                <>
                  <SessionList
                    items={regularSessions}
                    cursor={cursor}
                    searchQuery={searchQuery}
                    maxItems={maxVisibleItems}
                    icons={config?.icons}
                    pendingKillSessionName={pendingKillSessionName}
                  />

                  <AgentSessionGroup
                    sessions={agentSessions}
                    appMode={appMode}
                    cursor={agentCursor}
                    icons={config?.icons}
                    pendingKillSessionName={pendingKillSessionName}
                  />
                </>
              ) : (
                <ItemList
                  items={items}
                  cursor={cursor}
                  appMode={appMode}
                  searchQuery={searchQuery}
                  maxItems={maxVisibleItems}
                  icons={config?.icons}
                  pendingKillSessionName={pendingKillSessionName}
                />
              )}
            </box>
          </box>

          {shouldShowDetailPanel(columns, appMode === AppMode.NewSession) &&
            (showOpencodeStats ? (
              <OpencodeStatsPanel selectedItem={selectedAgentSession} />
            ) : (
              <SessionDetailsPanel selectedItem={selectedPrimaryItem} config={config} />
            ))}
        </box>

        {(message || columns < 80 || footerHint) && (
          <box
            style={{
              backgroundColor: theme.surface,
              position: 'absolute',
              bottom: 0,
              left: 0,
              paddingTop: 0.4,
              paddingBottom: 0.4,
              paddingLeft: 1,
              paddingRight: versionLabel.length + 3,
              width: '100%',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            {message && <text style={{ fg: theme.action }}>{message}</text>}
            {columns < 80 && appMode !== AppMode.NewSession && (
              <text style={{ fg: theme.textSubtle }}>Resize for the detail pane.</text>
            )}
            <text style={{ fg: theme.textSubtle }}>{footerHint}</text>
          </box>
        )}

        <Toast message={toastMessage} visible={toastVisible} />
        <VersionBadge currentVersion={CURRENT_VERSION} updatedVersion={updatedVersion} />
      </box>
    </>
  )
}
