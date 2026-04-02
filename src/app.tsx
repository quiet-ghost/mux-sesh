import type { TextareaRenderable } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import { useState, useEffect, useRef } from 'react'
import { executeCommand as runCommand } from './app/commands'
import {
  getProjectSelectionIndex,
  getSessionSelectionIndex,
  loadProjectItemsWithLinks,
  loadSessionCandidateItems,
  loadSessionItems,
} from './app/data'
import { handleModalKeyboard } from './app/modal-keyboard'
import {
  closeModal as resetModalState,
  openCommandsModal as showCommandsModal,
  openRenameModal as showRenameModal,
  openSettingEditor as showSettingEditor,
  openSettingOptions as showSettingOptions,
  openSettingsModal as showSettingsModal,
  type ModalState,
} from './app/modals'
import { showTemporaryMessage, showTemporaryToast } from './app/notifications'
import { AppMode, ViewMode, type Item, type Config, type OpencodeStatsState } from './types'
import { getConfigPath, loadConfig, saveConfig } from './config'
import { filterAndSortItems, clearMatchIndices } from './search'
import { isGitHubURL } from './util/github'
import { getOpencodeSessionStats } from './opencode'
import { ThemeProvider, getPanelStyle, resolveTheme } from './styles/theme'
import { useTerminalSize, shouldShowDetailPanel } from './util/terminal'
import { mark, measure } from './util/perf'
import Toast from './ui/Toast'
import { checkAndUpdate, updateEvents } from './update'
import { CURRENT_VERSION } from './update/version'
import OpencodeStatsPanel from './ui/OpencodeStatsPanel'
import SessionDetailsPanel from './ui/SessionDetailsPanel'
import SessionList from './ui/SessionList'
import OpencodeSessionGroup from './ui/OpencodeSessionGroup'
import SearchInput from './ui/SearchInput'
import ItemList from './ui/ItemList'
import VersionBadge, { formatVersionBadge } from './ui/VersionBadge'
import RenameModal from './ui/RenameModal'
import CommandsModal, { filterCommandEntries, getCommandEntries } from './ui/CommandsModal'
import SettingsModal from './ui/SettingsModal'
import SettingOptionsModal from './ui/SettingOptionsModal'
import SettingEditorModal from './ui/SettingEditorModal'
import {
  applyEditorSetting,
  applyOptionSetting,
  filterSettingsEntries,
  filterSettingsOptions,
  getSettingEditorTitle,
  getSettingsEntries,
  getSettingOptions,
  isOptionSetting,
  type SettingsFieldId,
} from './settings'
import {
  type KeyboardHandlerContext,
  handleNormalMode,
  handleOpencodeManageMode,
  handleSearchMode,
  handleNewSessionMode,
} from './handlers/keyboard'
import {
  handleSelect as actionHandleSelect,
  handleKillSession as actionKillSession,
  handleLastSession as actionHandleLastSession,
  handleRenameSubmit as actionRenameSubmit,
  handleNewSessionSubmit as actionNewSessionSubmit,
  handleRootSession as actionHandleRootSession,
  handleEditTarget as actionHandleEditTarget,
} from './handlers/actions'

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
  const settingsEntries = config ? getSettingsEntries(config) : []
  const filteredSettingsEntries = filterSettingsEntries(settingsEntries, settingsSearchQuery)
  const currentOptionField = modalState?.type === 'setting-options' ? modalState.field : undefined
  const settingOptions =
    config && currentOptionField ? getSettingOptions(config, currentOptionField) : []
  const filteredSettingOptions = filterSettingsOptions(settingOptions, settingOptionsSearchQuery)
  const hasScheduledAutoUpdateRef = useRef(false)

  function updateOpencodeState(sessionName: string, nextState: OpencodeStatsState) {
    const applyState = (existingItems: Item[]) =>
      existingItems.map(item =>
        item.title === sessionName ? { ...item, opencodeState: nextState } : item
      )

    setSessionItems(applyState)
    setAllItems(applyState)
    setItems(applyState)
  }

  useEffect(() => {
    async function init() {
      mark('startup begin')
      const cfg = await measure('loadConfig', loadConfig)
      setConfig(cfg)

      // Standard mode always starts in search mode (non-modal)
      if (cfg.keybindMode === 'standard') {
        setAppMode(AppMode.Search)
      }

      const { visibleSessions, sessionItems: combinedSessions } = await loadSessionItems(
        cfg,
        measure,
        'startup'
      )

      if (combinedSessions.length > 0) {
        setViewMode(ViewMode.Sessions)
        setSessionItems(combinedSessions)
        setAllItems(combinedSessions)
        setItems(combinedSessions)
        setCursor(getSessionSelectionIndex(combinedSessions, lastSessionSelectionRef.current))
      }

      const { projectSourceItems: orderedProjects, projectItems: linkedProjects } =
        await loadProjectItemsWithLinks(cfg, visibleSessions, measure)

      setProjectSourceItems(orderedProjects)

      if (combinedSessions.length === 0) {
        setViewMode(ViewMode.Projects)
        setAllItems(linkedProjects)
        setItems(linkedProjects)
        setCursor(getProjectSelectionIndex(linkedProjects, lastProjectSelectionRef.current))
      }

      mark('startup complete')
    }
    init()
  }, [])

  useEffect(() => {
    if (!config || hasScheduledAutoUpdateRef.current) {
      return
    }

    hasScheduledAutoUpdateRef.current = true

    const timeout = setTimeout(() => {
      checkAndUpdate(config).catch(error => {
        console.error('Auto-update check failed:', error)
      })
    }, 1000)

    return () => clearTimeout(timeout)
  }, [config])
  async function refreshItems(forceViewMode?: ViewMode, nextConfig = config) {
    if (!nextConfig) return

    const targetMode = forceViewMode ?? viewMode

    if (targetMode === ViewMode.Sessions) {
      const { sessionItems: cleanSessions } = await loadSessionItems(nextConfig, measure, 'refresh')
      setSessionItems(cleanSessions)
      setAllItems(cleanSessions)
      setItems(cleanSessions)
      setCursor(getSessionSelectionIndex(cleanSessions, lastSessionSelectionRef.current))
    } else {
      const { visibleSessions } = await loadSessionItems(nextConfig, measure, 'refresh-projects')
      const { projectSourceItems: orderedProjects, projectItems: cleanProjects } =
        await loadProjectItemsWithLinks(nextConfig, visibleSessions, measure)

      setProjectSourceItems(orderedProjects)
      setAllItems(cleanProjects)
      setItems(cleanProjects)
      setCursor(getProjectSelectionIndex(cleanProjects, lastProjectSelectionRef.current))
    }
  }

  function showMessage(message: string, timeout = 2000) {
    showTemporaryMessage(setMessage, message, timeout)
  }

  function showToast(message: string, timeout = 5000) {
    showTemporaryToast(setToastMessage, setToastVisible, message, timeout)
  }

  async function loadOpencodeStatsForSession(sessionName: string) {
    updateOpencodeState(sessionName, { status: 'loading' })

    try {
      const stats = await getOpencodeSessionStats(sessionName)

      if (stats) {
        updateOpencodeState(sessionName, { status: 'ready', stats })
        return stats
      }

      updateOpencodeState(sessionName, {
        status: 'missing',
        message: `No OpenCode stats found for '${sessionName}'`,
      })
      return null
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : `Failed to load stats for '${sessionName}'`
      updateOpencodeState(sessionName, { status: 'error', message: errorMessage })
      showMessage(errorMessage, 4000)
      return null
    }
  }

  const regularSessions =
    viewMode === ViewMode.Sessions &&
    (appMode === AppMode.Normal || appMode === AppMode.OpencodeManage)
      ? items.filter(item => !(item.isSession && item.title.startsWith('opencode-')))
      : items

  const opencodeSessions =
    viewMode === ViewMode.Sessions &&
    (appMode === AppMode.Normal || appMode === AppMode.OpencodeManage)
      ? items.filter(item => item.isSession && item.title.startsWith('opencode-'))
      : []
  const selectedOpencodeSessionName =
    appMode === AppMode.OpencodeManage ? opencodeSessions[opencodeCursor]?.title : undefined
  const selectedPrimaryItem =
    viewMode === ViewMode.Sessions && appMode === AppMode.Normal
      ? regularSessions[cursor]
      : items[cursor]
  const commandEntries = getCommandEntries(
    appMode,
    config?.keybindMode,
    config?.prefixKey,
    selectedPrimaryItem
  )
  const filteredCommandEntries = filterCommandEntries(commandEntries, commandsSearchQuery)

  async function handleKillSessionWrapper(sessionName: string) {
    setPendingKillSessionName(null)

    await actionKillSession(sessionName, {
      onSuccess: msg => showMessage(msg),
      onError: msg => showMessage(msg, 3000),
      refreshItems,
    })
  }

  async function handleSelectWrapper(item: Item) {
    await actionHandleSelect(item, config)
  }

  async function handleLastSessionWrapper() {
    try {
      await actionHandleLastSession(sessionItems)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to switch to the previous session'
      showMessage(errorMessage, 3000)
    }
  }

  async function handleRootSessionWrapper(item?: Item) {
    try {
      await actionHandleRootSession(item, config)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to open the root session'
      showMessage(errorMessage, 3000)
    }
  }

  async function handleEditTargetWrapper(item?: Item) {
    try {
      await actionHandleEditTarget(item, config)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to edit target'
      showMessage(errorMessage, 3000)
    }
  }

  function clearPendingKill() {
    setPendingKillSessionName(null)
  }

  function requestKillSession(sessionName: string) {
    if (pendingKillSessionName === sessionName) {
      void handleKillSessionWrapper(sessionName)
      return
    }

    setPendingKillSessionName(sessionName)
  }

  function openRenameModal(sessionName: string) {
    showRenameModal(
      sessionName,
      clearPendingKill,
      setRenameTarget,
      setModalInputValue,
      setModalState
    )
  }

  function openCommandsModal() {
    showCommandsModal(clearPendingKill, setCommandsSearchQuery, setCommandsCursor, setModalState)
  }

  function openSettingsModal() {
    showSettingsModal(
      config,
      clearPendingKill,
      setSettingEditorError,
      setSettingsSearchQuery,
      setSettingsCursor,
      setModalState
    )
  }

  function openSettingOptions(field: SettingsFieldId) {
    showSettingOptions(field, setSettingOptionsSearchQuery, setSettingOptionsCursor, setModalState)
  }

  function openSettingEditor(field: SettingsFieldId) {
    showSettingEditor(config, field, setSettingEditorError, setSettingEditorValue, setModalState)
  }

  function closeModal() {
    resetModalState({
      setModalState,
      setModalInputValue,
      setCommandsSearchQuery,
      setCommandsCursor,
      setSettingsSearchQuery,
      setSettingsCursor,
      setSettingOptionsSearchQuery,
      setSettingOptionsCursor,
      setSettingEditorValue,
      setSettingEditorError,
      setRenameTarget,
    })
  }

  async function handleRenameSubmit() {
    const newName = (modalTextareaRef.current?.plainText ?? modalInputValue).trim()
    if (newName && newName !== renameTarget) {
      await actionRenameSubmit(renameTarget, newName, {
        onSuccess: msg => showMessage(msg),
        onError: msg => showMessage(msg, 3000),
        refreshItems,
      })
    }

    closeModal()
  }

  async function handleNewSessionSubmit() {
    const searchTerm = searchQuery.trim()
    if (!searchTerm) return

    try {
      await actionNewSessionSubmit(searchTerm, config, items, cursor)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create session'
      showMessage(errorMessage, 3000)
    }
  }

  async function applyAndPersistConfig(nextConfig: Config, successMessage: string) {
    await saveConfig(nextConfig)
    setConfig(nextConfig)
    await refreshItems(undefined, nextConfig)
    showMessage(successMessage)
  }

  async function handleSettingsEditorSubmit(field: SettingsFieldId) {
    if (!config) {
      return
    }

    try {
      const rawText = settingEditorTextareaRef.current?.plainText ?? settingEditorValue
      const nextConfig = applyEditorSetting(config, field, rawText, process.env.HOME || '~')

      setSettingEditorError('')
      await applyAndPersistConfig(nextConfig, `${getSettingEditorTitle(field)} updated`)
      openSettingsModal()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save settings'
      setSettingEditorError(errorMessage)
    }
  }

  async function handleSettingOptionSubmit(field: SettingsFieldId, value: string) {
    if (!config) {
      return
    }

    const nextConfig = applyOptionSetting(config, field, value)
    await applyAndPersistConfig(nextConfig, `${getSettingEditorTitle(field)} updated`)
  }

  async function executeCommand(commandID: Parameters<typeof runCommand>[0]) {
    await runCommand(commandID, {
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

  const keyboardContext: KeyboardHandlerContext = {
    appMode,
    viewMode,
    items,
    regularSessions,
    opencodeSessions,
    cursor,
    opencodeCursor,
    searchQuery,
    prefixKey: config?.prefixKey,
    projectItems: sessionCandidateItems.length > 0 ? sessionCandidateItems : projectSourceItems,
    sessionItems,
    prefixActive,
    prefixTimeoutRef,
    setAppMode,
    setViewMode,
    setCursor,
    setOpencodeCursor,
    setSearchQuery,
    setAllItems,
    setItems,
    setPrefixActive,
    refreshItems,
    requestKillSession,
    clearPendingKill,
    handleSelect: handleSelectWrapper,
    handleKillSession: handleKillSessionWrapper,
    handleLastSession: handleLastSessionWrapper,
    handleRootSession: handleRootSessionWrapper,
    handleEditTarget: handleEditTargetWrapper,
    openRenameModal,
    openCommandsModal,
    openSettingsModal,
    loadOpencodeStatsForSession,
    setMessage,
  }

  useKeyboard(key => {
    const keybindMode = config?.keybindMode || 'vim'

    if (
      handleModalKeyboard(key, {
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
        closeModal,
        openSettingOptions,
        openSettingEditor,
        isOptionSetting,
        setModalState,
        setSettingEditorError,
        executeCommand,
        handleSettingOptionSubmit,
        handleSettingsEditorSubmit,
        handleRenameSubmit,
      })
    ) {
      return
    }

    if (appMode === AppMode.Normal) {
      handleNormalMode(key, keyboardContext, keybindMode)
    } else if (appMode === AppMode.Search) {
      handleSearchMode(key, keyboardContext, keybindMode)
    } else if (appMode === AppMode.NewSession) {
      if (key.name === 'return') {
        void handleNewSessionSubmit()
      } else {
        handleNewSessionMode(key, keyboardContext, keybindMode)
      }
    } else if (appMode === AppMode.OpencodeManage) {
      handleOpencodeManageMode(key, keyboardContext, keybindMode)
    }
  })

  useEffect(() => {
    const unsubscribe = updateEvents.on(event => {
      if (event.kind === 'updated') {
        setUpdatedVersion(event.version)
        showToast(`Updated in background to v${event.version}. Restart mux-sesh to use it.`)
      } else if (event.kind === 'available') {
        showToast(`Update available: v${event.version}`)
      } else {
        showToast(`Background update to v${event.version} failed.`)
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (appMode === AppMode.Search && searchQuery === '') {
      setItems(allItems)
    }
  }, [appMode, searchQuery, allItems])

  useEffect(() => {
    if (appMode === AppMode.Normal && viewMode === ViewMode.Sessions) {
      // Clear match indices when returning to normal mode
      const cleanSessions = clearMatchIndices(sessionItems)
      setAllItems(cleanSessions)
      setItems(cleanSessions)
      setCursor(getSessionSelectionIndex(cleanSessions, lastSessionSelectionRef.current))
    }
  }, [appMode, viewMode, sessionItems])

  useEffect(() => {
    if (appMode === AppMode.NewSession && viewMode === ViewMode.Projects) {
      setCursor(
        getProjectSelectionIndex(
          sessionCandidateItems.length > 0 ? sessionCandidateItems : projectSourceItems,
          lastProjectSelectionRef.current
        )
      )
    }
  }, [appMode, viewMode, projectSourceItems, sessionCandidateItems])

  useEffect(() => {
    if (appMode !== AppMode.NewSession || !config) {
      return
    }

    const nextConfig = config
    let cancelled = false

    async function loadSessionCandidates() {
      const linkedCandidates = await loadSessionCandidateItems(nextConfig, measure)
      if (cancelled) {
        return
      }

      setSessionCandidateItems(linkedCandidates)
      setAllItems(linkedCandidates)
      setItems(linkedCandidates)
      setCursor(getProjectSelectionIndex(linkedCandidates, lastProjectSelectionRef.current))
    }

    void loadSessionCandidates()

    return () => {
      cancelled = true
    }
  }, [appMode, config])

  useEffect(() => {
    if (filteredCommandEntries.length === 0) {
      setCommandsCursor(0)
      return
    }

    setCommandsCursor(current => Math.min(current, filteredCommandEntries.length - 1))
  }, [filteredCommandEntries.length])

  useEffect(() => {
    setCommandsCursor(0)
  }, [commandsSearchQuery])

  useEffect(() => {
    if (filteredSettingsEntries.length === 0) {
      setSettingsCursor(0)
      return
    }

    setSettingsCursor(current => Math.min(current, filteredSettingsEntries.length - 1))
  }, [filteredSettingsEntries.length])

  useEffect(() => {
    if (filteredSettingOptions.length === 0) {
      setSettingOptionsCursor(0)
      return
    }

    setSettingOptionsCursor(current => Math.min(current, filteredSettingOptions.length - 1))
  }, [filteredSettingOptions.length])

  useEffect(() => {
    const selectedItem = appMode === AppMode.NewSession ? items[cursor] : selectedPrimaryItem

    if (!selectedItem) {
      return
    }

    if (appMode === AppMode.NewSession || viewMode === ViewMode.Projects) {
      if (!selectedItem.isSession) {
        lastProjectSelectionRef.current = selectedItem.path
      }
      return
    }

    if (viewMode === ViewMode.Sessions && appMode === AppMode.Normal) {
      lastSessionSelectionRef.current = selectedItem.title
    }
  }, [appMode, viewMode, cursor, items, selectedPrimaryItem])

  useEffect(() => {
    if (!pendingKillSessionName) {
      return
    }

    const selectedSessionName =
      appMode === AppMode.OpencodeManage
        ? opencodeSessions[opencodeCursor]?.title
        : viewMode === ViewMode.Sessions
          ? regularSessions[cursor]?.title
          : undefined

    if (selectedSessionName !== pendingKillSessionName) {
      setPendingKillSessionName(null)
    }
  }, [
    appMode,
    cursor,
    opencodeCursor,
    opencodeSessions,
    pendingKillSessionName,
    regularSessions,
    viewMode,
  ])

  useEffect(() => {
    if (appMode === AppMode.Search || appMode === AppMode.NewSession) {
      if (searchQuery.trim()) {
        const filtered = filterAndSortItems(allItems, searchQuery)
        setItems(filtered)
        setCursor(0)
      } else {
        setItems(allItems)
        setCursor(0)
      }
    }
  }, [searchQuery, appMode, allItems])

  useEffect(() => {
    if (!selectedOpencodeSessionName) {
      return
    }

    void loadOpencodeStatsForSession(selectedOpencodeSessionName)

    const interval = setInterval(() => {
      void loadOpencodeStatsForSession(selectedOpencodeSessionName)
    }, 2000)

    return () => {
      clearInterval(interval)
    }
  }, [selectedOpencodeSessionName])

  const title =
    appMode === AppMode.Search
      ? 'Search'
      : appMode === AppMode.NewSession
        ? 'New Session'
        : appMode === AppMode.OpencodeManage
          ? 'OpenCode Sessions'
          : viewMode === ViewMode.Projects
            ? 'Projects'
            : 'Sessions'

  const listStyle =
    appMode === AppMode.NewSession
      ? {
          ...getPanelStyle(theme, 'full'),
          flexGrow: 1,
          flexShrink: 1,
        }
      : {
          ...getPanelStyle(theme, 'split'),
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 40,
        }

  const totalSessions = sessionItems.filter(item => item.isSession).length
  const activeSessions = items.filter(item => item.isSession && item.isAttached).length
  const maxVisibleItems = Math.max(8, rows - (appMode === AppMode.NewSession ? 10 : 12))
  const prefixLabel = config?.prefixKey ? `${config.prefixKey} ...` : 'direct keys'
  const versionLabel = formatVersionBadge(CURRENT_VERSION, updatedVersion)
  const footerHint =
    appMode === AppMode.OpencodeManage
      ? `o back  d kill  ctrl+p commands  ${prefixLabel}`
      : appMode === AppMode.NewSession
        ? 'enter create  esc cancel'
        : appMode === AppMode.Search
          ? 'enter select  esc cancel'
          : `enter select  i search  n new  o opencode  d kill  ctrl+p commands  ${prefixLabel}`

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
                  {viewMode === ViewMode.Sessions
                    ? `${activeSessions}/${totalSessions} active`
                    : `${projectSourceItems.length} projects`}
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
                onContentChange={() => {
                  if (textareaRef.current && textareaRef.current.plainText !== undefined) {
                    setSearchQuery(textareaRef.current.plainText)
                  }
                }}
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
                  {appMode === AppMode.NewSession && searchQuery && isGitHubURL(searchQuery)
                    ? 'Clone & create session'
                    : appMode === AppMode.NewSession && searchQuery
                      ? `Create session: ${searchQuery}`
                      : 'No items found'}
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

        {modalState?.type === 'rename' && (
          <RenameModal
            target={modalState.target}
            initialValue={modalInputValue}
            columns={columns}
            textareaRef={modalTextareaRef}
            onContentChange={() => {
              if (modalTextareaRef.current?.plainText !== undefined) {
                setModalInputValue(modalTextareaRef.current.plainText)
              }
            }}
          />
        )}

        {modalState?.type === 'commands' && (
          <CommandsModal
            columns={columns}
            themeId={resolvedTheme.id}
            entries={filteredCommandEntries}
            cursor={commandsCursor}
            searchQuery={commandsSearchQuery}
            textareaRef={commandsSearchTextareaRef}
            onContentChange={() => {
              if (commandsSearchTextareaRef.current?.plainText !== undefined) {
                setCommandsSearchQuery(commandsSearchTextareaRef.current.plainText)
                setCommandsCursor(0)
              }
            }}
          />
        )}

        {modalState?.type === 'settings' && config && (
          <SettingsModal
            configPath={configPath}
            themeName={resolvedTheme.name}
            colorMode={resolvedTheme.mode}
            columns={columns}
            entries={filteredSettingsEntries}
            cursor={settingsCursor}
            searchQuery={settingsSearchQuery}
            textareaRef={settingsSearchTextareaRef}
            onContentChange={() => {
              if (settingsSearchTextareaRef.current?.plainText !== undefined) {
                setSettingsSearchQuery(settingsSearchTextareaRef.current.plainText)
                setSettingsCursor(0)
              }
            }}
          />
        )}

        {modalState?.type === 'setting-options' && (
          <SettingOptionsModal
            title={getSettingEditorTitle(modalState.field)}
            description="Select an option to apply it immediately"
            columns={columns}
            options={filteredSettingOptions}
            cursor={settingOptionsCursor}
            searchQuery={settingOptionsSearchQuery}
            textareaRef={settingOptionsSearchTextareaRef}
            onContentChange={() => {
              if (settingOptionsSearchTextareaRef.current?.plainText !== undefined) {
                setSettingOptionsSearchQuery(settingOptionsSearchTextareaRef.current.plainText)
                setSettingOptionsCursor(0)
              }
            }}
          />
        )}

        {modalState?.type === 'setting-editor' && (
          <SettingEditorModal
            title={getSettingEditorTitle(modalState.field)}
            description="Edit value and press Enter to apply immediately"
            value={settingEditorValue}
            error={settingEditorError}
            columns={columns}
            rows={rows}
            textareaRef={settingEditorTextareaRef}
            onContentChange={() => {
              if (settingEditorTextareaRef.current?.plainText !== undefined) {
                setSettingEditorValue(settingEditorTextareaRef.current.plainText)
              }
            }}
          />
        )}

        <Toast message={toastMessage} visible={toastVisible} />
        <VersionBadge currentVersion={CURRENT_VERSION} updatedVersion={updatedVersion} />
      </box>
    </ThemeProvider>
  )
}
