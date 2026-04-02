import type { TextareaRenderable } from '@opentui/core'
import { useState, useEffect, useRef } from 'react'
import { executeCommand as runCommand } from './app/commands'
import {
  useAutoUpdateScheduler,
  useBoundedCursor,
  useNewSessionProjectCursor,
  useNormalModeSessionReset,
  useOpencodeStatsPolling,
  usePendingKillReset,
  useResetCursorOnValue,
  useSearchFiltering,
  useSelectionMemory,
  useSessionCandidateLoader,
  useUpdateEventToasts,
} from './app/effects'
import { createAppControls } from './app/controls'
import { getSessionCommandState, getSettingsState } from './app/derived'
import { useAppKeyboard } from './app/keyboard'
import { AppModalsLayer } from './app/modals-layer'
import { type ModalState } from './app/modals'
import { showTemporaryMessage } from './app/notifications'
import { applyOpencodeState, loadOpencodeSessionStats } from './app/opencode'
import {
  executeAppCommand,
  handleEditTargetWithFeedback,
  handleKillSessionWithFeedback,
  handleLastSessionWithFeedback,
  handleNewSessionSubmitWithSearch,
  handleRenameSubmitWithFeedback,
  handleRootSessionWithFeedback,
  handleSelectItem,
  handleSettingOptionSubmitWithFeedback,
  handleSettingsEditorSubmitWithFeedback,
} from './app/handlers'
import { loadRefreshedViewState, loadStartupState } from './app/state'
import { syncTextareaValue } from './app/textarea'
import {
  getAppTitle,
  getEmptyStateMessage,
  getFooterHint,
  getListStyle,
  getStatusLabel,
} from './app/view'
import { AppMode, ViewMode, type Item, type Config, type OpencodeStatsState } from './types'
import { getConfigPath, saveConfig } from './config'
import { isGitHubURL } from './util/github'
import { getOpencodeSessionStats } from './opencode'
import { ThemeProvider, resolveTheme } from './styles/theme'
import { useTerminalSize, shouldShowDetailPanel } from './util/terminal'
import { mark, measure } from './util/perf'
import Toast from './ui/Toast'
import { CURRENT_VERSION } from './update/version'
import OpencodeStatsPanel from './ui/OpencodeStatsPanel'
import SessionDetailsPanel from './ui/SessionDetailsPanel'
import SessionList from './ui/SessionList'
import OpencodeSessionGroup from './ui/OpencodeSessionGroup'
import SearchInput from './ui/SearchInput'
import ItemList from './ui/ItemList'
import VersionBadge, { formatVersionBadge } from './ui/VersionBadge'
import { getSettingEditorTitle, isOptionSetting, type SettingsFieldId } from './settings'

export function App() {
  const [appMode, setAppMode] = useState(AppMode.Normal)
  const [viewMode, setViewMode] = useState(ViewMode.Sessions)
  const [items, setItems] = useState<Item[]>([])
  const [allItems, setAllItems] = useState<Item[]>([])
  const [projectSourceItems, setProjectSourceItems] = useState<Item[]>([])
  const [sessionCandidateItems, setSessionCandidateItems] = useState<Item[]>([])
  const [sessionItems, setSessionItems] = useState<Item[]>([])
  const [cursor, setCursor] = useState(0)
  const [opencodeCursor, setOpencodeCursor] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [message, setMessage] = useState('')
  const [renameTarget, setRenameTarget] = useState('')
  const [config, setConfig] = useState<Config | null>(null)
  const [modalState, setModalState] = useState<ModalState>(null)
  const [modalInputValue, setModalInputValue] = useState('')
  const [commandsCursor, setCommandsCursor] = useState(0)
  const [commandsSearchQuery, setCommandsSearchQuery] = useState('')
  const [settingsCursor, setSettingsCursor] = useState(0)
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('')
  const [settingOptionsCursor, setSettingOptionsCursor] = useState(0)
  const [settingOptionsSearchQuery, setSettingOptionsSearchQuery] = useState('')
  const [settingEditorValue, setSettingEditorValue] = useState('')
  const [settingEditorError, setSettingEditorError] = useState('')
  const [pendingKillSessionName, setPendingKillSessionName] = useState<string | null>(null)
  const [prefixActive, setPrefixActive] = useState(false)
  const prefixTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const modalTextareaRef = useRef<TextareaRenderable | null>(null)
  const commandsSearchTextareaRef = useRef<TextareaRenderable | null>(null)
  const settingsSearchTextareaRef = useRef<TextareaRenderable | null>(null)
  const settingOptionsSearchTextareaRef = useRef<TextareaRenderable | null>(null)
  const settingEditorTextareaRef = useRef<TextareaRenderable | null>(null)
  const lastSessionSelectionRef = useRef<string | null>(null)
  const lastProjectSelectionRef = useRef<string | null>(null)
  const { columns, rows } = useTerminalSize()
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [updatedVersion, setUpdatedVersion] = useState<string | null>(null)
  const configPath = getConfigPath()
  const resolvedTheme = resolveTheme(config?.theme, config?.themes, config?.colorScheme)
  const theme = resolvedTheme.colors
  const { filteredSettingsEntries, filteredSettingOptions } = getSettingsState(
    config,
    modalState,
    settingsSearchQuery,
    settingOptionsSearchQuery
  )
  const hasScheduledAutoUpdateRef = useRef(false)

  function updateOpencodeState(sessionName: string, nextState: OpencodeStatsState) {
    applyOpencodeState(sessionName, nextState, setSessionItems, setAllItems, setItems)
  }

  useEffect(() => {
    async function init() {
      mark('startup begin')
      const startupState = await loadStartupState(
        measure,
        lastSessionSelectionRef.current,
        lastProjectSelectionRef.current
      )

      setConfig(startupState.config)
      setAppMode(startupState.appMode)
      setViewMode(startupState.viewMode)
      setSessionItems(startupState.sessionItems)
      setProjectSourceItems(startupState.projectSourceItems)
      setAllItems(startupState.items)
      setItems(startupState.items)
      setCursor(startupState.cursor)

      mark('startup complete')
    }
    init()
  }, [])

  useAutoUpdateScheduler(config, hasScheduledAutoUpdateRef)
  async function refreshItems(forceViewMode?: ViewMode, nextConfig = config) {
    if (!nextConfig) return

    const targetMode = forceViewMode ?? viewMode

    const refreshedState = await loadRefreshedViewState(
      targetMode,
      nextConfig,
      measure,
      lastSessionSelectionRef.current,
      lastProjectSelectionRef.current
    )

    if (refreshedState.sessionItems) {
      setSessionItems(refreshedState.sessionItems)
    }

    if (refreshedState.projectSourceItems) {
      setProjectSourceItems(refreshedState.projectSourceItems)
    }

    setAllItems(refreshedState.items)
    setItems(refreshedState.items)
    setCursor(refreshedState.cursor)
  }

  function showMessage(message: string, timeout = 2000) {
    showTemporaryMessage(setMessage, message, timeout)
  }

  async function loadOpencodeStatsForSession(sessionName: string) {
    return loadOpencodeSessionStats(
      sessionName,
      getOpencodeSessionStats,
      updateOpencodeState,
      showMessage
    )
  }

  const {
    regularSessions,
    opencodeSessions,
    selectedOpencodeSessionName,
    selectedPrimaryItem,
    filteredCommandEntries,
  } = getSessionCommandState(
    appMode,
    viewMode,
    items,
    cursor,
    opencodeCursor,
    config,
    commandsSearchQuery
  )

  async function handleKillSessionWrapper(sessionName: string) {
    await handleKillSessionWithFeedback(sessionName, {
      config,
      items,
      sessionItems,
      cursor,
      showMessage,
      refreshItems,
      setPendingKillSessionName,
    })
  }

  async function handleSelectWrapper(item: Item) {
    await handleSelectItem(item, config)
  }

  async function handleLastSessionWrapper() {
    await handleLastSessionWithFeedback({
      config,
      items,
      sessionItems,
      cursor,
      showMessage,
      refreshItems,
    })
  }

  async function handleRootSessionWrapper(item?: Item) {
    await handleRootSessionWithFeedback(item, {
      config,
      items,
      sessionItems,
      cursor,
      showMessage,
      refreshItems,
    })
  }

  async function handleEditTargetWrapper(item?: Item) {
    await handleEditTargetWithFeedback(item, {
      config,
      items,
      sessionItems,
      cursor,
      showMessage,
      refreshItems,
    })
  }

  const {
    clearPendingKill,
    requestKillSession,
    openRenameModal,
    openCommandsModal,
    openSettingsModal,
    openSettingOptions,
    openSettingEditor,
    closeModal,
  } = createAppControls({
    config,
    pendingKillSessionName,
    handleKillSession: handleKillSessionWrapper,
    setPendingKillSessionName,
    setRenameTarget,
    setModalInputValue,
    setModalState,
    setCommandsSearchQuery,
    setCommandsCursor,
    setSettingEditorError,
    setSettingsSearchQuery,
    setSettingsCursor,
    setSettingOptionsSearchQuery,
    setSettingOptionsCursor,
    setSettingEditorValue,
  })

  async function handleRenameSubmit() {
    const newName = (modalTextareaRef.current?.plainText ?? modalInputValue).trim()
    await handleRenameSubmitWithFeedback(renameTarget, newName, closeModal, {
      showMessage,
      refreshItems,
    })
  }

  async function handleNewSessionSubmit() {
    const searchTerm = searchQuery.trim()
    await handleNewSessionSubmitWithSearch(searchTerm, {
      config,
      items,
      sessionItems,
      cursor,
      showMessage,
      refreshItems,
    })
  }

  async function handleSettingsEditorSubmit(field: SettingsFieldId) {
    await handleSettingsEditorSubmitWithFeedback(field, {
      config,
      saveConfig,
      setConfig,
      setSettingEditorError,
      openSettingsModal,
      settingEditorValue,
      settingEditorPlainText: settingEditorTextareaRef.current?.plainText,
      refreshItems,
      showMessage,
    })
  }

  async function handleSettingOptionSubmit(field: SettingsFieldId, value: string) {
    await handleSettingOptionSubmitWithFeedback(field, value, {
      config,
      saveConfig,
      setConfig,
      setSettingEditorError,
      openSettingsModal,
      settingEditorValue,
      refreshItems,
      showMessage,
    })
  }

  async function executeCommand(commandID: Parameters<typeof executeAppCommand>[0]) {
    await executeAppCommand(commandID, {
      appMode,
      viewMode,
      cursor,
      opencodeCursor,
      regularSessions,
      opencodeSessions,
      selectedPrimaryItem,
      sessionCandidateItems,
      projectSourceItems,
      closeModal,
      openRenameModal,
      openSettingsModal,
      requestKillSession,
      setAppMode,
      setViewMode,
      setAllItems,
      setItems,
      setCursor,
      setSearchQuery,
      setOpencodeCursor,
      refreshItems,
      handleLastSession: handleLastSessionWrapper,
      handleRootSession: handleRootSessionWrapper,
      handleEditTarget: handleEditTargetWrapper,
      loadOpencodeStatsForSession,
      showMessage,
    })
  }

  useAppKeyboard({
    appMode,
    viewMode,
    config,
    items,
    regularSessions,
    opencodeSessions,
    sessionItems,
    sessionCandidateItems,
    projectSourceItems,
    cursor,
    opencodeCursor,
    searchQuery,
    prefixActive,
    prefixTimeoutRef,
    modalState,
    filteredCommandEntries,
    commandsCursor,
    setCommandsCursor,
    filteredSettingsEntries,
    settingsCursor,
    setSettingsCursor,
    filteredSettingOptions,
    settingOptionsCursor,
    setSettingOptionsCursor,
    setModalState,
    setSettingEditorError,
    executeCommand,
    handleSettingOptionSubmit,
    handleSettingsEditorSubmit,
    handleRenameSubmit,
    handleNewSessionSubmit,
    isOptionSetting,
    openSettingOptions,
    openSettingEditor,
    closeModal,
    clearPendingKill,
    requestKillSession,
    openRenameModal,
    openCommandsModal,
    openSettingsModal,
    refreshItems,
    handleSelect: handleSelectWrapper,
    handleKillSession: handleKillSessionWrapper,
    handleLastSession: handleLastSessionWrapper,
    handleRootSession: handleRootSessionWrapper,
    handleEditTarget: handleEditTargetWrapper,
    loadOpencodeStatsForSession,
    setAppMode,
    setViewMode,
    setCursor,
    setOpencodeCursor,
    setSearchQuery,
    setAllItems,
    setItems,
    setPrefixActive,
    setMessage,
  })

  useUpdateEventToasts(setUpdatedVersion, setToastMessage, setToastVisible)
  useNormalModeSessionReset(
    appMode,
    viewMode,
    sessionItems,
    lastSessionSelectionRef,
    setAllItems,
    setItems,
    setCursor
  )
  useNewSessionProjectCursor(
    appMode,
    viewMode,
    projectSourceItems,
    sessionCandidateItems,
    lastProjectSelectionRef,
    setCursor
  )
  useSessionCandidateLoader(
    appMode,
    config,
    lastProjectSelectionRef,
    setSessionCandidateItems,
    setAllItems,
    setItems,
    setCursor
  )
  useBoundedCursor(filteredCommandEntries.length, setCommandsCursor)
  useResetCursorOnValue(commandsSearchQuery, setCommandsCursor)
  useBoundedCursor(filteredSettingsEntries.length, setSettingsCursor)
  useBoundedCursor(filteredSettingOptions.length, setSettingOptionsCursor)
  useSelectionMemory(
    appMode,
    viewMode,
    cursor,
    items,
    selectedPrimaryItem,
    lastProjectSelectionRef,
    lastSessionSelectionRef
  )
  usePendingKillReset(
    pendingKillSessionName,
    appMode,
    viewMode,
    opencodeSessions,
    opencodeCursor,
    regularSessions,
    cursor,
    setPendingKillSessionName
  )
  useSearchFiltering(appMode, searchQuery, allItems, setItems, setCursor)

  useOpencodeStatsPolling(selectedOpencodeSessionName, loadOpencodeStatsForSession)

  const title = getAppTitle(appMode, viewMode)
  const listStyle = getListStyle(theme, appMode)

  const totalSessions = sessionItems.filter(item => item.isSession).length
  const activeSessions = items.filter(item => item.isSession && item.isAttached).length
  const maxVisibleItems = Math.max(8, rows - (appMode === AppMode.NewSession ? 10 : 12))
  const versionLabel = formatVersionBadge(CURRENT_VERSION, updatedVersion)
  const footerHint = getFooterHint(appMode, config?.prefixKey)

  return (
    <ThemeProvider theme={theme}>
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
                  {getStatusLabel(
                    viewMode,
                    activeSessions,
                    totalSessions,
                    projectSourceItems.length
                  )}
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
                  (appMode === AppMode.Normal || appMode === AppMode.OpencodeManage)
                    ? 1
                    : 0,
              }}
            >
              {items.length === 0 ? (
                <text style={{ fg: theme.inactive }}>
                  {getEmptyStateMessage(appMode, searchQuery, isGitHubURL(searchQuery))}
                </text>
              ) : viewMode === ViewMode.Sessions &&
                (appMode === AppMode.Normal || appMode === AppMode.OpencodeManage) ? (
                <>
                  <SessionList
                    items={regularSessions}
                    cursor={cursor}
                    searchQuery={searchQuery}
                    maxItems={maxVisibleItems}
                    icons={config?.icons}
                    pendingKillSessionName={pendingKillSessionName}
                  />

                  <OpencodeSessionGroup
                    sessions={opencodeSessions}
                    appMode={appMode}
                    cursor={opencodeCursor}
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

          {shouldShowDetailPanel(columns, appMode === AppMode.NewSession) && (
            <>
              {viewMode === ViewMode.Sessions && appMode === AppMode.OpencodeManage ? (
                <OpencodeStatsPanel selectedItem={opencodeSessions[opencodeCursor]} />
              ) : (
                <SessionDetailsPanel selectedItem={selectedPrimaryItem} config={config} />
              )}
            </>
          )}
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

        <AppModalsLayer
          modalState={modalState}
          columns={columns}
          rows={rows}
          configPath={configPath}
          themeId={resolvedTheme.id}
          themeName={resolvedTheme.name}
          colorMode={resolvedTheme.mode}
          filteredCommandEntries={filteredCommandEntries}
          commandsCursor={commandsCursor}
          commandsSearchQuery={commandsSearchQuery}
          setCommandsCursor={setCommandsCursor}
          setCommandsSearchQuery={setCommandsSearchQuery}
          filteredSettingsEntries={filteredSettingsEntries}
          settingsCursor={settingsCursor}
          settingsSearchQuery={settingsSearchQuery}
          setSettingsCursor={setSettingsCursor}
          setSettingsSearchQuery={setSettingsSearchQuery}
          filteredSettingOptions={filteredSettingOptions}
          settingOptionsCursor={settingOptionsCursor}
          settingOptionsSearchQuery={settingOptionsSearchQuery}
          setSettingOptionsCursor={setSettingOptionsCursor}
          setSettingOptionsSearchQuery={setSettingOptionsSearchQuery}
          settingEditorValue={settingEditorValue}
          settingEditorError={settingEditorError}
          setSettingEditorValue={setSettingEditorValue}
          modalInputValue={modalInputValue}
          setModalInputValue={setModalInputValue}
          commandsSearchTextareaRef={commandsSearchTextareaRef}
          settingsSearchTextareaRef={settingsSearchTextareaRef}
          settingOptionsSearchTextareaRef={settingOptionsSearchTextareaRef}
          settingEditorTextareaRef={settingEditorTextareaRef}
          modalTextareaRef={modalTextareaRef}
          getSettingEditorTitle={getSettingEditorTitle}
        />

        <Toast message={toastMessage} visible={toastVisible} />
        <VersionBadge currentVersion={CURRENT_VERSION} updatedVersion={updatedVersion} />
      </box>
    </ThemeProvider>
  )
}
