import { useState } from 'react'
import { useAppCoreState } from './core-state'
import { useAutoUpdateScheduler, useAppBehaviors } from './effects'
import { createAppControls } from './controls'
import { getSessionCommandState, getSettingsState } from './derived'
import { FocusOwner } from './focus-owner'
import { useDetailsInspector } from './inspector'
import { useAppKeyboard } from './keyboard'
import { useAppModalState } from './modal-state'
import { openOutcomeModal } from './modals'
import { OptionPicker } from './option-picker'
import { createAppRuntime } from './runtime'
import { createAppHandlers } from './handlers'
import { useSessionInventory } from './session-inventory'
import { useAppStartup } from './state'
import { useEffectRuntime } from './use-effect-runtime'
import { useLiveResolvedTheme } from './resolved-theme'
import { getConfigPath, getHomeDir, saveConfig } from '../config'
import { shouldShowDetailPanel, useTerminalSize } from '../util/terminal'
import { AppMode } from '../types'
import { anyPending, createPendingFlag } from '../util/pending'
import { mark, measure } from '../util/perf'
import { requestFatalShutdown } from '../util/shutdown'
import { getSettingEditorTitle, isOptionSetting } from '../settings'
import { useLaunchPreview } from '../ui/launch-preview'
import { CLONE_SERVICES } from '../sessions/clone-plan'
import { getLaunchScope, useLaunchRequest } from './launch-scope'
import { useLauncherQuery } from './launcher-query'
import { getNewSessionStepControls, useNewSessionSteps } from './new-session-step'

export function useAppController(invocationCwd: string) {
  const effects = useEffectRuntime()

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
    agentCursor,
    setAgentCursor,
    searchQuery,
    setSearchQuery,
    message,
    setMessage,
    renameTarget,
    setRenameTarget,
    config,
    setConfig,
    backend,
    setBackend,
    markedItems,
    setMarkedItems,
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
  const homeDir = getHomeDir()

  const { filteredSettingsEntries, filteredSettingOptions, savedSettingOption } = getSettingsState(
    config,
    modalState,
    settingsSearchQuery,
    settingOptionsSearchQuery
  )

  const resolvedTheme = useLiveResolvedTheme({
    themeId:
      OptionPicker.previewedThemeId(modalState, filteredSettingOptions, settingOptionsCursor) ??
      config?.theme,
    customThemes: config?.themes,
    colorScheme: config?.colorScheme,
    homeDir,
  })

  const theme = resolvedTheme.colors

  // Also the busy signal: a running clone or launch keeps the header spinner going.
  const [launchGuard] = useState(createPendingFlag)

  const {
    regularSessions,
    agentSessions,
    selectedAgentSession,
    selectedPrimaryItem,
    actionContext,
    filteredCommandEntries,
  } = getSessionCommandState(
    appMode,
    viewMode,
    items,
    cursor,
    agentCursor,
    config,
    commandsSearchQuery,
    backend,
    markedItems
  )

  const inventory = useSessionInventory(effects, measure, {
    viewMode,
    config,
    backend,
    cursor,
    agentCursor,
    selectedAgentSession,
    lastSessionSelectionRef,
    lastProjectSelectionRef,
    setViewMode,
    setSessionItems,
    setProjectSourceItems,
    setAllItems,
    setItems,
    setCursor,
    setAgentCursor,
    setMessage,
  })

  const [busy] = useState(() => anyPending([inventory.loading, launchGuard]))

  const { startup, retryStartup } = useAppStartup(
    effects,
    measure,
    inventory,
    mark,
    setConfig,
    setBackend,
    setAppMode,
    setProjectSourceItems
  )

  useAutoUpdateScheduler(config)

  const details = useDetailsInspector({
    effects,
    inventory,
    visible: shouldShowDetailPanel(columns, appMode === AppMode.NewSession),
    item: selectedPrimaryItem,
    config,
    backend,
  })

  const launcherFiles = useLauncherQuery({
    appMode,
    config,
    backend,
    searchQuery,
    allItems,
    sessionItems,
    items,
    cursor,
    setAllItems,
    setItems,
    setCursor,
    setSessionCandidateItems,
    setMessage,
  })

  const newSession = useNewSessionSteps({
    active: appMode === AppMode.NewSession,
    config,
    searchQuery,
    setSearchQuery,
    selected: selectedPrimaryItem,
    files: launcherFiles,
    onDefect: requestFatalShutdown,
  })

  const launchScope = getLaunchScope(appMode, viewMode, selectedPrimaryItem)
  const launchRequest = useLaunchRequest(launchScope, newSession.request, selectedPrimaryItem)

  const launchPreview = useLaunchPreview({
    active: launchScope !== 'none',
    request: launchRequest,
    config,
    backend: backend?.kind,
    invocationCwd,
    liveSessions: sessionItems,
    clone: CLONE_SERVICES,
    onDefect: requestFatalShutdown,
  })

  const { showMessage, refreshItems, reloadSessions } = createAppRuntime({
    config,
    backend,
    viewMode,
    inventory,
    setMessage,
  })

  const {
    requestKillSession,
    toggleMark,
    clearMarks,
    requestMarkedClose,
    openRenameModal,
    openCommandsModal,
    openSettingsModal,
    openSettingOptions: openSettingOptionsAtFirst,
    openSettingEditor,
    closeModal,
  } = createAppControls({
    config,
    backend,
    sessionItems,
    inventoryRevision: () => inventory.revision(),
    markedItems,
    setMarkedItems,
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

  const openSettingOptions = OptionPicker.openAtSaved(
    config,
    openSettingOptionsAtFirst,
    setSettingOptionsCursor
  )

  const {
    confirmCloseReview,
    confirmBatchClose,
    retryBatchClose,
    handleSelectWrapper,
    handleLastSessionWrapper,
    handleRootSessionWrapper,
    handleEditTargetWrapper,
    handleRenameSubmit,
    handleNewSessionSubmit,
    handleOutcomeRetry,
    handleSettingsEditorSubmit,
    handleSettingOptionSubmit,
    handleTogglePinnedSessionWrapper,
    executeCommand,
  } = createAppHandlers({
    clone: CLONE_SERVICES,
    launchGuard,
    backend,
    viewMode,
    config,
    items,
    sessionItems,
    cursor,
    showMessage,
    showOutcome: report => openOutcomeModal(report, setModalState),
    refreshItems,
    regularSessions,
    rememberedSessions: (key: string | null) => {
      lastSessionSelectionRef.current = key
    },
    inventoryRevision: () => inventory.revision(),
    agentSessions,
    selectedPrimaryItem,
    sessionCandidateItems,
    projectSourceItems,
    closeModal,
    openRenameModal,
    openSettingsModal,
    openSettingOptions,
    setModalState,
    requestKillSession,
    requestMarkedClose,
    toggleMark,
    clearMarks,
    markedItems,
    reloadSessions,
    setAppMode,
    setViewMode,
    setAllItems,
    setItems,
    setCursor,
    setSearchQuery,
    setAgentCursor,
    saveConfig,
    setConfig,
    setSettingEditorError,
    settingEditorValue,
    settingEditorPlainText: settingEditorTextareaRef.current?.plainText,
    renameTarget,
    renamedValue: (modalTextareaRef.current?.plainText ?? modalInputValue).trim(),
    launchPreview,
    toggleDetails: details.toggle,
  })

  useAppKeyboard({
    active: startup.kind === 'loading' || startup.kind === 'ready',
    toggleDetails: details.toggle,
    appMode,
    viewMode,
    config,
    items,
    regularSessions,
    agentSessions,
    sessionItems,
    sessionCandidateItems,
    projectSourceItems,
    cursor,
    agentCursor,
    searchQuery,
    actionContext,
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
    newSession: getNewSessionStepControls(
      newSession,
      launchPreview,
      handleNewSessionSubmit,
      showMessage
    ),
    handleOutcomeRetry,
    confirmCloseReview,
    confirmBatchClose,
    retryBatchClose,
    onDefect: requestFatalShutdown,
    isOptionSetting,
    openSettingOptions,
    openSettingEditor,
    closeModal,
    requestKillSession,
    requestMarkedClose,
    toggleMark,
    togglePinnedSession: handleTogglePinnedSessionWrapper,
    openRenameModal,
    openCommandsModal,
    openSettingsModal,
    refreshItems,
    handleSelect: handleSelectWrapper,
    launchPlanned: handleNewSessionSubmit,
    handleLastSession: handleLastSessionWrapper,
    handleRootSession: handleRootSessionWrapper,
    handleEditTarget: handleEditTargetWrapper,
    setAppMode,
    setViewMode,
    setCursor,
    setAgentCursor,
    setSearchQuery,
    setAllItems,
    setItems,
    setPrefixActive,
    setMessage,
  })

  useAppBehaviors({
    inventory,
    setMessage,
    appMode,
    viewMode,
    config,
    backend,
    sessionItems,
    lastSessionSelectionRef,
    lastProjectSelectionRef,
    setAllItems,
    setItems,
    setCursor,
    setSessionCandidateItems,
    filteredCommandEntriesLength: filteredCommandEntries.length,
    setCommandsCursor,
    filteredSettingsEntriesLength: filteredSettingsEntries.length,
    setSettingsCursor,
    filteredSettingOptionsLength: filteredSettingOptions.length,
    setSettingOptionsCursor,
    cursor,
    items,
    selectedPrimaryItem,
    searchQuery,
    allItems,
    setUpdatedVersion,
    setToastMessage,
    setToastVisible,
  })

  return {
    startup,
    retryStartup,
    theme,
    resolvedTheme,
    columns,
    rows,
    busy,
    screenProps: {
      theme,
      actionContext,
      focusOwner: FocusOwner.of({ appMode, modalState, prefixActive }),
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
      launchPreview,
      newSession,
      prefixActive,
      markedItems,
      projectCount: projectSourceItems.length,
      sessionItems,
      rows,
      columns,
      textareaRef,
      setSearchQuery,
      message,
      toastMessage,
      toastVisible,
      updatedVersion,
    },
    modalProps: {
      modalState,
      columns,
      rows,
      configPath,
      themeId: resolvedTheme.id,
      themeName: resolvedTheme.name,
      colorMode: resolvedTheme.mode,
      filteredCommandEntries,
      commandsCursor,
      commandsSearchQuery,
      setCommandsCursor,
      setCommandsSearchQuery,
      filteredSettingsEntries,
      settingsCursor,
      settingsSearchQuery,
      setSettingsCursor,
      setSettingsSearchQuery,
      filteredSettingOptions,
      savedSettingOption,
      settingOptionsCursor,
      settingOptionsSearchQuery,
      setSettingOptionsCursor,
      setSettingOptionsSearchQuery,
      settingEditorValue,
      settingEditorError,
      setSettingEditorValue,
      modalInputValue,
      setModalInputValue,
      commandsSearchTextareaRef,
      settingsSearchTextareaRef,
      settingOptionsSearchTextareaRef,
      settingEditorTextareaRef,
      modalTextareaRef,
      getSettingEditorTitle,
    },
  }
}
