import { useRef } from 'react'
import { useAppCoreState } from './app/core-state'
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
import { useAppModalState } from './app/modal-state'
import { AppModalsLayer } from './app/modals-layer'
import { AppScreen } from './app/screen'
import { createAppRuntime } from './app/runtime'
import { createAppHandlers, handleKillSessionWithFeedback } from './app/handlers'
import { useAppStartup } from './app/state'
import { AppMode, ViewMode } from './types'
import { getConfigPath, saveConfig } from './config'
import { getOpencodeSessionStats } from './opencode'
import { ThemeProvider, resolveTheme } from './styles/theme'
import { useTerminalSize } from './util/terminal'
import { mark, measure } from './util/perf'
import { getSettingEditorTitle, isOptionSetting, type SettingsFieldId } from './settings'

export function App() {
  const {
    appMode,
    setAppMode,
    viewMode,
    setViewMode,
    items,
    setItems,
    allItems,
    setAllItems,
    projectSourceItems,
    setProjectSourceItems,
    sessionCandidateItems,
    setSessionCandidateItems,
    sessionItems,
    setSessionItems,
    cursor,
    setCursor,
    opencodeCursor,
    setOpencodeCursor,
    searchQuery,
    setSearchQuery,
    message,
    setMessage,
    renameTarget,
    setRenameTarget,
    config,
    setConfig,
    pendingKillSessionName,
    setPendingKillSessionName,
    prefixActive,
    setPrefixActive,
    prefixTimeoutRef,
    textareaRef,
    lastSessionSelectionRef,
    lastProjectSelectionRef,
    toastMessage,
    setToastMessage,
    toastVisible,
    setToastVisible,
    updatedVersion,
    setUpdatedVersion,
  } = useAppCoreState()
  const {
    modalState,
    setModalState,
    modalInputValue,
    setModalInputValue,
    commandsCursor,
    setCommandsCursor,
    commandsSearchQuery,
    setCommandsSearchQuery,
    settingsCursor,
    setSettingsCursor,
    settingsSearchQuery,
    setSettingsSearchQuery,
    settingOptionsCursor,
    setSettingOptionsCursor,
    settingOptionsSearchQuery,
    setSettingOptionsSearchQuery,
    settingEditorValue,
    setSettingEditorValue,
    settingEditorError,
    setSettingEditorError,
    modalTextareaRef,
    commandsSearchTextareaRef,
    settingsSearchTextareaRef,
    settingOptionsSearchTextareaRef,
    settingEditorTextareaRef,
  } = useAppModalState()
  const { columns, rows } = useTerminalSize()
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

  useAppStartup(
    measure,
    lastSessionSelectionRef,
    lastProjectSelectionRef,
    mark,
    setConfig,
    setAppMode,
    setViewMode,
    setSessionItems,
    setProjectSourceItems,
    setAllItems,
    setItems,
    setCursor
  )

  useAutoUpdateScheduler(config, hasScheduledAutoUpdateRef)
  const { showMessage, refreshItems, loadOpencodeStatsForSession } = createAppRuntime({
    config,
    viewMode,
    measure,
    lastSessionSelectionRef,
    lastProjectSelectionRef,
    setSessionItems,
    setProjectSourceItems,
    setAllItems,
    setItems,
    setCursor,
    setMessage,
    getOpencodeSessionStats,
  })

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
    handleKillSession: sessionName =>
      handleKillSessionWithFeedback(sessionName, {
        config,
        items,
        sessionItems,
        cursor,
        showMessage,
        refreshItems,
        setPendingKillSessionName,
      }),
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
  const {
    handleKillSessionWrapper,
    handleSelectWrapper,
    handleLastSessionWrapper,
    handleRootSessionWrapper,
    handleEditTargetWrapper,
    handleRenameSubmit,
    handleNewSessionSubmit,
    handleSettingsEditorSubmit,
    handleSettingOptionSubmit,
    executeCommand,
  } = createAppHandlers({
    appMode,
    viewMode,
    config,
    items,
    sessionItems,
    cursor,
    showMessage,
    refreshItems,
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
    setPendingKillSessionName,
    saveConfig,
    setConfig,
    setSettingEditorError,
    settingEditorValue,
    settingEditorPlainText: settingEditorTextareaRef.current?.plainText,
    renameTarget,
    renamedValue: (modalTextareaRef.current?.plainText ?? modalInputValue).trim(),
    searchTerm: searchQuery.trim(),
    loadOpencodeStatsForSession,
  })

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

  return (
    <ThemeProvider theme={theme}>
      <AppScreen
        theme={theme}
        appMode={appMode}
        viewMode={viewMode}
        config={config}
        items={items}
        regularSessions={regularSessions}
        opencodeSessions={opencodeSessions}
        selectedPrimaryItem={selectedPrimaryItem}
        cursor={cursor}
        opencodeCursor={opencodeCursor}
        searchQuery={searchQuery}
        prefixActive={prefixActive}
        pendingKillSessionName={pendingKillSessionName}
        projectCount={projectSourceItems.length}
        sessionItems={sessionItems}
        rows={rows}
        columns={columns}
        textareaRef={textareaRef}
        setSearchQuery={setSearchQuery}
        message={message}
        toastMessage={toastMessage}
        toastVisible={toastVisible}
        updatedVersion={updatedVersion}
      />

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
    </ThemeProvider>
  )
}
