import { useState } from 'react'
import { useAppCoreState } from './core-state'
import { useAutoUpdateScheduler, useAppBehaviors, usePendingCloseReset } from './effects'
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
import { createSettingPaneActions } from './setting-pane-actions'
import { getSettingPaneState } from './setting-panes'
import { useSessionInventory } from './session-inventory'
import { useAppStartup } from './state'
import { useEffectRuntime } from './use-effect-runtime'
import { useLiveResolvedTheme } from './resolved-theme'
import { getConfigPath, getHomeDir, saveConfig } from '../config'
import { shouldShowDetailPanel, useTerminalSize } from '../ui/terminal-size'
import { AppMode } from '../types'
import { anyPending, createPendingFlag } from '../util/pending'
import { mark, measure } from '../util/perf'
import { requestFatalShutdown } from '../lifecycle/shutdown'
import { getSettingEditorTitle, isOptionSetting } from '../settings/settings-catalog'
import { useLaunchPreview } from '../ui/launch-preview'
import { CLONE_SERVICES } from '../sessions/clone-plan'
import {
  getLaunchScope,
  planProjectRow,
  useLaunchRequest,
  type LaunchPlanning,
} from './launch-scope'
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
    liveSessions,
    setLiveSessions,
    cursor,
    setCursor,
    agentCursor,
    setAgentCursor,
    searchQuery,
    setSearchQuery,
    statusLines,
    setInventoryStatus,
    setFileSearchStatus,
    renameTarget,
    setRenameTarget,
    config,
    setConfig,
    backend,
    setBackend,
    markedItems,
    setMarkedItems,
    pendingClose,
    setPendingClose,
    prefixActive,
    setPrefixActive,
    prefixTimeoutRef,
    textareaRef,
    lastSessionSelectionRef,
    lastProjectSelectionRef,
    toast,
    moreToasts,
    showToast,
    acknowledgeToast,
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
    settingFieldDraft,
    setSettingFieldDraft,
    modalTextareaRef,
    commandsSearchTextareaRef,
    settingsSearchTextareaRef,
    settingOptionsSearchTextareaRef,
    settingEditorTextareaRef,
    settingFieldTextareaRef,
  } = useAppModalState()

  const { columns, rows } = useTerminalSize()
  const configPath = getConfigPath()
  const homeDir = getHomeDir()

  const { filteredSettingsEntries, filteredSettingOptions, savedSettingOption, iconsFormEntries } =
    getSettingsState(config, modalState, settingsSearchQuery, settingOptionsSearchQuery, homeDir)

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
    markedItems,
    pendingClose
  )

  usePendingCloseReset(pendingClose, selectedPrimaryItem, modalState !== null, setPendingClose)

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
    setLiveSessions,
    setProjectSourceItems,
    setAllItems,
    setItems,
    setCursor,
    setAgentCursor,
    setMessage: setInventoryStatus,
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
    setMessage: setFileSearchStatus,
    showToast,
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

  const launchPlanning: LaunchPlanning = {
    config,
    backend: backend?.kind,
    invocationCwd,
    liveSessions: sessionItems,
    clone: CLONE_SERVICES,
  }

  const launchPreview = useLaunchPreview({
    ...launchPlanning,
    active: launchScope !== 'none',
    request: launchRequest,
    onDefect: requestFatalShutdown,
  })

  const { refreshItems, refreshList, reloadSessions } = createAppRuntime({
    config,
    backend,
    viewMode,
    inventory,
    showToast,
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
    setPendingClose,
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
    handleSettingStep,
    handleSettingReset,
    handleIconsChange,
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
    showToast,
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
    refreshList,
  })

  const settingPane = getSettingPaneState({
    config,
    modalState,
    draft: settingFieldDraft,
    homeDir,
    liveSessions,
    projects: projectSourceItems,
  })

  const { openSettingPane, handleSettingPaneAction } = createSettingPaneActions({
    config,
    homeDir,
    modalState,
    setModalState,
    readDraft: () => settingFieldTextareaRef.current?.plainText ?? settingFieldDraft,
    setDraft: setSettingFieldDraft,
    openJsonEditor: openSettingEditor,
    returnToSettings: () => setModalState({ type: 'settings', picker: OptionPicker.browsing }),
    saveConfig,
    setConfig,
    refreshItems,
    showToast,
    showOutcome: report => openOutcomeModal(report, setModalState),
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
    settingEditorTextareaRef,
    setSettingEditorValue,
    iconsFormEntries,
    handleIconsChange,
    executeCommand,
    handleSettingOptionSubmit,
    handleSettingsEditorSubmit,
    handleSettingStep,
    handleSettingReset,
    settingsSearchQuery,
    setSettingsSearchQuery,
    handleRenameSubmit,
    newSession: getNewSessionStepControls(
      newSession,
      launchPreview,
      handleNewSessionSubmit,
      showToast
    ),
    handleOutcomeRetry,
    confirmCloseReview,
    setPendingClose,
    confirmBatchClose,
    retryBatchClose,
    onDefect: requestFatalShutdown,
    isOptionSetting,
    openSettingOptions,
    openSettingEditor,
    settingPaneView: settingPane.view,
    openSettingPane,
    handleSettingPaneAction,
    closeModal,
    requestKillSession,
    requestMarkedClose,
    toggleMark,
    togglePinnedSession: handleTogglePinnedSessionWrapper,
    openRenameModal,
    openCommandsModal,
    openSettingsModal,
    refreshItems,
    refreshList,
    handleSelect: handleSelectWrapper,
    launchPlanned: handleNewSessionSubmit,
    launchProjectRow: item => handleNewSessionSubmit(planProjectRow(item, launchPlanning)),
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
    showToast,
    acknowledgeToast,
  })

  useAppBehaviors({
    inventory,
    showToast,
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
    regularSessions,
    searchQuery,
    allItems,
    setUpdatedVersion,
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
      projectCount: projectSourceItems.length,
      sessionItems,
      rows,
      columns,
      textareaRef,
      setSearchQuery,
      statusLines,
      toast,
      moreToasts,
      updatedVersion,
    },
    modalProps: {
      modalState,
      columns,
      rows,
      configPath,
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
      iconsFormEntries,
      settingOptionsCursor,
      settingOptionsSearchQuery,
      setSettingOptionsCursor,
      setSettingOptionsSearchQuery,
      settingEditorValue,
      settingEditorError,
      setSettingEditorValue,
      settingPane,
      settingFieldDraft,
      setSettingFieldDraft,
      settingFieldTextareaRef,
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
