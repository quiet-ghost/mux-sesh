import type { TextareaRenderable } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import { useState, useEffect, useRef } from 'react'
import { AppMode, ViewMode, type Item, type Config, type OpencodeStatsState } from './types'
import { getConfigPath, loadConfig, saveConfig } from './config'
import { getListedSessionItems, mergeSessionItems } from './config/listed-sessions'
import { orderProjectItems, orderSessionItems } from './items/order'
import { annotateProjectItemsWithSessionLinks } from './projects/session-links'
import { listTmuxSessions } from './tmux'
import { filterHiddenSessions } from './tmux/workflows'
import { getProjectItems } from './tmux/projects'
import { filterAndSortItems, clearMatchIndices } from './search'
import { isGitHubURL } from './util/github'
import { getOpencodeSessionStats } from './opencode'
import { ThemeProvider, getPanelStyle, resolveTheme } from './styles/theme'
import { useTerminalSize, shouldShowDetailPanel } from './util/terminal'
import Toast from './ui/Toast'
import { checkAndUpdate, updateEvents } from './update'
import OpencodeStatsPanel from './ui/OpencodeStatsPanel'
import SessionDetailsPanel from './ui/SessionDetailsPanel'
import SessionList from './ui/SessionList'
import OpencodeSessionGroup from './ui/OpencodeSessionGroup'
import SearchInput from './ui/SearchInput'
import ItemList from './ui/ItemList'
import RenameModal from './ui/RenameModal'
import CommandsModal, { filterCommandEntries, getCommandEntries, type CommandId } from './ui/CommandsModal'
import SettingsModal from './ui/SettingsModal'
import SettingOptionsModal from './ui/SettingOptionsModal'
import SettingEditorModal from './ui/SettingEditorModal'
import {
  applyEditorSetting,
  applyOptionSetting,
  filterSettingsEntries,
  filterSettingsOptions,
  getSettingEditorTitle,
  getSettingEditorValue,
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

type ModalState =
  | { type: 'rename'; target: string }
  | { type: 'commands' }
  | { type: 'settings' }
  | { type: 'setting-options'; field: SettingsFieldId }
  | { type: 'setting-editor'; field: SettingsFieldId }
  | null

export function App() {
  const [appMode, setAppMode] = useState(AppMode.Normal)
  const [viewMode, setViewMode] = useState(ViewMode.Sessions)
  const [items, setItems] = useState<Item[]>([])
  const [allItems, setAllItems] = useState<Item[]>([])
  const [projectItems, setProjectItems] = useState<Item[]>([])
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
  const configPath = getConfigPath()
  const resolvedTheme = resolveTheme(config?.theme, config?.themes, config?.colorScheme)
  const theme = resolvedTheme.colors
  const settingsEntries = config ? getSettingsEntries(config) : []
  const filteredSettingsEntries = filterSettingsEntries(settingsEntries, settingsSearchQuery)
  const currentOptionField = modalState?.type === 'setting-options' ? modalState.field : undefined
  const settingOptions = config && currentOptionField ? getSettingOptions(config, currentOptionField) : []
  const filteredSettingOptions = filterSettingsOptions(settingOptions, settingOptionsSearchQuery)

  function getSessionSelectionIndex(nextItems: Item[]): number {
    const regularItems = nextItems.filter(item => !(item.isSession && item.title.startsWith('opencode-')))
    if (regularItems.length === 0) {
      return 0
    }

    const selection = lastSessionSelectionRef.current
    if (!selection) {
      return 0
    }

    const index = regularItems.findIndex(item => item.title === selection)
    return index >= 0 ? index : 0
  }

  function getProjectSelectionIndex(nextItems: Item[]): number {
    if (nextItems.length === 0) {
      return 0
    }

    const selection = lastProjectSelectionRef.current
    if (!selection) {
      return 0
    }

    const index = nextItems.findIndex(item => item.path === selection)
    return index >= 0 ? index : 0
  }

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
      const cfg = await loadConfig()
      setConfig(cfg)

      // Standard mode always starts in search mode (non-modal)
      if (cfg.keybindMode === 'standard') {
        setAppMode(AppMode.Search)
      }

      const [sessions, listedSessions] = await Promise.all([listTmuxSessions(), getListedSessionItems(cfg)])
      const visibleSessions = filterHiddenSessions(sessions, cfg.hiddenSessions)
      const combinedSessions = orderSessionItems(mergeSessionItems(visibleSessions, listedSessions), cfg.sortOrder)

      if (combinedSessions.length > 0) {
        setViewMode(ViewMode.Sessions)
        setSessionItems(combinedSessions)
        setAllItems(combinedSessions)
        setItems(combinedSessions)
        setCursor(getSessionSelectionIndex(combinedSessions))
      }

      const rawProjects = await getProjectItems(cfg)
      const projects = orderProjectItems(
        await annotateProjectItemsWithSessionLinks(rawProjects, visibleSessions, cfg),
        cfg.sortOrder
      )

      setProjectItems(projects)

      if (combinedSessions.length === 0) {
        setViewMode(ViewMode.Projects)
        setAllItems(projects)
        setItems(projects)
        setCursor(getProjectSelectionIndex(projects))
      }

      checkAndUpdate(cfg).catch(error => {
        console.error('Auto-update check failed:', error)
      })
    }
    init()
  }, [])

  async function refreshItems(forceViewMode?: ViewMode, nextConfig = config) {
    if (!nextConfig) return

    const targetMode = forceViewMode ?? viewMode

    if (targetMode === ViewMode.Sessions) {
      const sessions = await listTmuxSessions()
      const visibleSessions = filterHiddenSessions(sessions, nextConfig.hiddenSessions)
      const listedSessions = await getListedSessionItems(nextConfig)
      const cleanSessions = clearMatchIndices(
        orderSessionItems(mergeSessionItems(visibleSessions, listedSessions), nextConfig.sortOrder)
      )
      const linkedProjects = orderProjectItems(
        await annotateProjectItemsWithSessionLinks(projectItems, visibleSessions, nextConfig),
        nextConfig.sortOrder
      )
      setSessionItems(cleanSessions)
      setProjectItems(linkedProjects)
      setAllItems(cleanSessions)
      setItems(cleanSessions)
      setCursor(getSessionSelectionIndex(cleanSessions))
    } else {
      const sessions = await listTmuxSessions()
      const visibleSessions = filterHiddenSessions(sessions, nextConfig.hiddenSessions)
      const projects = orderProjectItems(
        await annotateProjectItemsWithSessionLinks(await getProjectItems(nextConfig), visibleSessions, nextConfig),
        nextConfig.sortOrder
      )
      const cleanProjects = clearMatchIndices(projects)
      setProjectItems(cleanProjects)
      setAllItems(cleanProjects)
      setItems(cleanProjects)
      setCursor(getProjectSelectionIndex(cleanProjects))
    }
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
      const errorMessage = error instanceof Error ? error.message : `Failed to load stats for '${sessionName}'`
      updateOpencodeState(sessionName, { status: 'error', message: errorMessage })
      setMessage(errorMessage)
      setTimeout(() => setMessage(''), 4000)
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
    viewMode === ViewMode.Sessions && appMode === AppMode.Normal ? regularSessions[cursor] : items[cursor]
  const commandEntries = getCommandEntries(appMode, config?.keybindMode, config?.prefixKey, selectedPrimaryItem)
  const filteredCommandEntries = filterCommandEntries(commandEntries, commandsSearchQuery)

  async function handleKillSessionWrapper(sessionName: string) {
    setPendingKillSessionName(null)

    await actionKillSession(sessionName, {
      onSuccess: msg => {
        setMessage(msg)
        setTimeout(() => setMessage(''), 2000)
      },
      onError: msg => {
        setMessage(msg)
        setTimeout(() => setMessage(''), 3000)
      },
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to switch to the previous session'
      setMessage(errorMessage)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  async function handleRootSessionWrapper(item?: Item) {
    try {
      await actionHandleRootSession(item, config)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to open the root session'
      setMessage(errorMessage)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  async function handleEditTargetWrapper(item?: Item) {
    try {
      await actionHandleEditTarget(item, config)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to edit target'
      setMessage(errorMessage)
      setTimeout(() => setMessage(''), 3000)
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
    clearPendingKill()
    setRenameTarget(sessionName)
    setModalInputValue(sessionName)
    setModalState({ type: 'rename', target: sessionName })
  }

  function openCommandsModal() {
    clearPendingKill()
    setCommandsSearchQuery('')
    setCommandsCursor(0)
    setModalState({ type: 'commands' })
  }

  function openSettingsModal() {
    if (!config) {
      return
    }

    clearPendingKill()
    setSettingEditorError('')
    setSettingsSearchQuery('')
    setSettingsCursor(0)
    setModalState({ type: 'settings' })
  }

  function openSettingOptions(field: SettingsFieldId) {
    setSettingOptionsSearchQuery('')
    setSettingOptionsCursor(0)
    setModalState({ type: 'setting-options', field })
  }

  function openSettingEditor(field: SettingsFieldId) {
    if (!config) {
      return
    }

    setSettingEditorError('')
    setSettingEditorValue(getSettingEditorValue(config, field))
    setModalState({ type: 'setting-editor', field })
  }

  function closeModal() {
    setModalState(null)
    setModalInputValue('')
    setCommandsSearchQuery('')
    setCommandsCursor(0)
    setSettingsSearchQuery('')
    setSettingOptionsSearchQuery('')
    setSettingEditorValue('')
    setSettingEditorError('')
    setRenameTarget('')
  }

  async function handleRenameSubmit() {
    const newName = (modalTextareaRef.current?.plainText ?? modalInputValue).trim()
    if (newName && newName !== renameTarget) {
      await actionRenameSubmit(renameTarget, newName, {
        onSuccess: msg => {
          setMessage(msg)
          setTimeout(() => setMessage(''), 2000)
        },
        onError: msg => {
          setMessage(msg)
          setTimeout(() => setMessage(''), 3000)
        },
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
      setMessage(errorMessage)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  async function executeCommand(commandID: CommandId) {
    switch (commandID) {
      case 'search':
        closeModal()
        setAppMode(AppMode.Search)
        setSearchQuery('')
        return
      case 'new-session':
        closeModal()
        setAppMode(AppMode.NewSession)
        setViewMode(ViewMode.Projects)
        setAllItems(projectItems)
        setItems(projectItems)
        setCursor(Math.max(0, projectItems.length - 1))
        setSearchQuery('')
        return
      case 'open-settings':
        openSettingsModal()
        return
      case 'view-projects':
        closeModal()
        setViewMode(ViewMode.Projects)
        await refreshItems(ViewMode.Projects)
        return
      case 'view-sessions':
        closeModal()
        setViewMode(ViewMode.Sessions)
        await refreshItems(ViewMode.Sessions)
        return
      case 'rename-session': {
        const target =
          appMode === AppMode.OpencodeManage ? opencodeSessions[opencodeCursor] : viewMode === ViewMode.Sessions ? regularSessions[cursor] : undefined
        if (target?.isSession) {
          openRenameModal(target.title)
        }
        return
      }
      case 'kill-session': {
        const target =
          appMode === AppMode.OpencodeManage ? opencodeSessions[opencodeCursor] : viewMode === ViewMode.Sessions ? regularSessions[cursor] : undefined
        if (target?.isSession) {
          closeModal()
          requestKillSession(target.title)
        }
        return
      }
      case 'last-session':
        closeModal()
        await handleLastSessionWrapper()
        return
      case 'root-session':
        closeModal()
        await handleRootSessionWrapper(selectedPrimaryItem)
        return
      case 'edit-target':
        closeModal()
        await handleEditTargetWrapper(selectedPrimaryItem)
        return
      case 'open-opencode':
        closeModal()
        if (viewMode === ViewMode.Sessions && opencodeSessions.length > 0) {
          setAppMode(AppMode.OpencodeManage)
          setOpencodeCursor(0)
          await loadOpencodeStatsForSession(opencodeSessions[0].title)
        }
        return
      case 'refresh':
        closeModal()
        await refreshItems()
        setMessage('Refreshed')
        setTimeout(() => setMessage(''), 2000)
        return
      case 'back':
        closeModal()
        setAppMode(AppMode.Normal)
        return
    }
  }

  async function applyAndPersistConfig(nextConfig: Config, successMessage: string) {
    await saveConfig(nextConfig)
    setConfig(nextConfig)
    await refreshItems(undefined, nextConfig)
    setMessage(successMessage)
    setTimeout(() => setMessage(''), 2000)
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

  const keyboardContext: KeyboardHandlerContext = {
    appMode,
    viewMode,
    items,
    regularSessions,
    opencodeSessions,
    cursor,
    opencodeCursor,
    searchQuery,
    renameTarget,
    prefixKey: config?.prefixKey,
    projectItems,
    sessionItems,
    prefixActive,
    prefixTimeoutRef,
    textareaRef,
    setAppMode,
    setViewMode,
    setCursor,
    setOpencodeCursor,
    setSearchQuery,
    setRenameTarget,
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

    if (modalState?.type === 'rename') {
      if (key.name === 'return') {
        void handleRenameSubmit()
      } else if (key.name === 'escape') {
        closeModal()
      }
      return
    }

    if (modalState?.type === 'commands') {
      if (key.name === 'escape' || key.name === 'q') {
        closeModal()
      } else if (key.name === 'down' || key.name === 'j') {
        setCommandsCursor(current => Math.min(current + 1, filteredCommandEntries.length - 1))
      } else if (key.name === 'up' || key.name === 'k') {
        setCommandsCursor(current => Math.max(current - 1, 0))
      } else if (key.name === 'return') {
        const command = filteredCommandEntries[commandsCursor]
        if (!command) {
          return
        }
        void executeCommand(command.id)
      }
      return
    }

    if (modalState?.type === 'settings') {
      if (key.name === 'escape') {
        closeModal()
      } else if (key.name === 'down' || key.name === 'j') {
        setSettingsCursor(current => Math.min(current + 1, filteredSettingsEntries.length - 1))
      } else if (key.name === 'up' || key.name === 'k') {
        setSettingsCursor(current => Math.max(current - 1, 0))
      } else if (key.name === 'return') {
        const entry = filteredSettingsEntries[settingsCursor]
        if (!entry) {
          return
        }

        if (isOptionSetting(entry.id)) {
          openSettingOptions(entry.id)
        } else {
          openSettingEditor(entry.id)
        }
      } else if (key.name === 'e') {
        const entry = filteredSettingsEntries[settingsCursor]
        if (!entry) return
        if (isOptionSetting(entry.id)) {
          openSettingOptions(entry.id)
        } else {
          openSettingEditor(entry.id)
        }
      }
      return
    }

    if (modalState?.type === 'setting-options') {
      if (key.name === 'escape') {
        setModalState({ type: 'settings' })
      } else if (key.name === 'down' || key.name === 'j') {
        setSettingOptionsCursor(current => Math.min(current + 1, filteredSettingOptions.length - 1))
      } else if (key.name === 'up' || key.name === 'k') {
        setSettingOptionsCursor(current => Math.max(current - 1, 0))
      } else if (key.name === 'return') {
        const option = filteredSettingOptions[settingOptionsCursor]
        if (!option) return
        void handleSettingOptionSubmit(modalState.field, option.value)
      }
      return
    }

    if (modalState?.type === 'setting-editor') {
      if (key.name === 'escape') {
        setModalState({ type: 'settings' })
        setSettingEditorError('')
      } else if (key.name === 'return') {
        void handleSettingsEditorSubmit(modalState.field)
      }
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
      setToastMessage(`Update ready ${event.version}`)
      setToastVisible(true)
      setTimeout(() => {
        setToastVisible(false)
      }, 5000)
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
      setCursor(getSessionSelectionIndex(cleanSessions))
    }
  }, [appMode, viewMode, sessionItems])

  useEffect(() => {
    if (appMode === AppMode.NewSession && viewMode === ViewMode.Projects) {
      setCursor(getProjectSelectionIndex(projectItems))
    }
  }, [appMode, viewMode, projectItems])

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
  }, [appMode, cursor, opencodeCursor, opencodeSessions, pendingKillSessionName, regularSessions, viewMode])

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
          flexDirection: 'row',
          alignItems: 'stretch',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          gap: 1,
          backgroundColor: theme.background,
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
                {viewMode === ViewMode.Sessions ? `${activeSessions}/${totalSessions} active` : `${projectItems.length} projects`}
              </text>
              <text style={{ fg: theme.textSubtle }}>{`${resolvedTheme.name} · ${resolvedTheme.mode}`}</text>
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
                viewMode === ViewMode.Sessions && (appMode === AppMode.Normal || appMode === AppMode.OpencodeManage)
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
            ) : viewMode === ViewMode.Sessions && (appMode === AppMode.Normal || appMode === AppMode.OpencodeManage) ? (
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

          {(message || columns < 80 || footerHint) && (
            <box style={{ flexDirection: 'column', marginTop: 1 }}>
              {message && <text style={{ fg: theme.action }}>{message}</text>}
              {columns < 80 && appMode !== AppMode.NewSession && (
                <text style={{ fg: theme.textSubtle }}>Resize for the detail pane.</text>
              )}
              <text style={{ fg: theme.textSubtle }}>{footerHint}</text>
            </box>
          )}
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
            description='Select an option to apply it immediately'
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
            description='Edit value and press Enter to apply immediately'
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
      </box>
    </ThemeProvider>
  )
}
