import type { TextareaRenderable } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import { useState, useEffect, useRef } from 'react'
import { AppMode, ViewMode, type Item, type Config, type OpencodeStatsState } from './types'
import { loadConfig } from './config'
import { getListedSessionItems, mergeSessionItems } from './config/listed-sessions'
import { annotateProjectItemsWithSessionLinks } from './projects/session-links'
import { listTmuxSessions } from './tmux'
import { filterHiddenSessions } from './tmux/workflows'
import { getProjectItems } from './tmux/projects'
import { filterAndSortItems, clearMatchIndices } from './search'
import { isGitHubURL } from './util/github'
import { getOpencodeSessionStats } from './opencode'
import { formatSessionAge } from './util/time'
import { colors, sessionListStyle, sessionListStyleFull } from './styles/theme'
import { useTerminalSize, shouldShowDetailPanel } from './util/terminal'
import Toast from './ui/Toast'
import { checkAndUpdate, updateEvents } from './update'
import KeybindHelp from './components/KeybindHelp'
import OpencodeStatsPanel from './ui/OpencodeStatsPanel'
import SessionDetailsPanel from './ui/SessionDetailsPanel'
import SessionList from './ui/SessionList'
import OpencodeSessionGroup from './ui/OpencodeSessionGroup'
import SearchInput from './ui/SearchInput'
import SessionStats from './ui/SessionStats'
import ItemList from './ui/ItemList'
import {
  type KeyboardHandlerContext,
  handleNormalMode,
  handleOpencodeManageMode,
  handleSearchMode,
  handleNewSessionMode,
  handleRenameMode,
} from './handlers/keyboard'
import {
  handleSelect as actionHandleSelect,
  handleKillSession as actionKillSession,
  handleLastSession as actionHandleLastSession,
  handleRenameSubmit as actionRenameSubmit,
  handleNewSessionSubmit as actionNewSessionSubmit,
  handleRootSession as actionHandleRootSession,
} from './handlers/actions'

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
  const [prefixActive, setPrefixActive] = useState(false)
  const prefixTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const { columns, rows } = useTerminalSize()
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

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

      const sessions = await listTmuxSessions()
      const visibleSessions = filterHiddenSessions(sessions, cfg.hiddenSessions)
      const listedSessions = await getListedSessionItems(cfg)
      const combinedSessions = mergeSessionItems(visibleSessions, listedSessions)
      const projects = await annotateProjectItemsWithSessionLinks(await getProjectItems(cfg), visibleSessions, cfg)

      setProjectItems(projects)

      if (combinedSessions.length > 0) {
        setViewMode(ViewMode.Sessions)
        setSessionItems(combinedSessions)
        setAllItems(combinedSessions)
        setItems(combinedSessions)
      } else {
        setViewMode(ViewMode.Projects)
        setAllItems(projects)
        setItems(projects)
      }
      checkAndUpdate(cfg).catch(error => {
        console.error('Auto-update check failed:', error)
      })
    }
    init()
  }, [])

  async function refreshItems(forceViewMode?: ViewMode) {
    if (!config) return

    const targetMode = forceViewMode ?? viewMode

    if (targetMode === ViewMode.Sessions) {
      const sessions = await listTmuxSessions()
      const visibleSessions = filterHiddenSessions(sessions, config.hiddenSessions)
      const listedSessions = await getListedSessionItems(config)
      const cleanSessions = clearMatchIndices(mergeSessionItems(visibleSessions, listedSessions))
      const linkedProjects = await annotateProjectItemsWithSessionLinks(projectItems, visibleSessions, config)
      setSessionItems(cleanSessions)
      setProjectItems(linkedProjects)
      setAllItems(cleanSessions)
      setItems(cleanSessions)
    } else {
      const sessions = await listTmuxSessions()
      const visibleSessions = filterHiddenSessions(sessions, config.hiddenSessions)
      const projects = await annotateProjectItemsWithSessionLinks(await getProjectItems(config), visibleSessions, config)
      const cleanProjects = clearMatchIndices(projects)
      setProjectItems(cleanProjects)
      setAllItems(cleanProjects)
      setItems(cleanProjects)
    }
    setCursor(0)
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

  async function handleKillSessionWrapper(sessionName: string) {
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

  async function handleRenameSubmit() {
    const newName = searchQuery.trim()
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
    setAppMode(AppMode.Normal)
    setSearchQuery('')
    setRenameTarget('')
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
    handleSelect: handleSelectWrapper,
    handleKillSession: handleKillSessionWrapper,
    handleLastSession: handleLastSessionWrapper,
    handleRootSession: handleRootSessionWrapper,
    loadOpencodeStatsForSession,
    setMessage,
  }

  useKeyboard(key => {
    const keybindMode = config?.keybindMode || 'vim'
    if (appMode === AppMode.Normal) {
      handleNormalMode(key, keyboardContext, keybindMode)
    } else if (appMode === AppMode.Search) {
      handleSearchMode(key, keyboardContext, keybindMode)
    } else if (appMode === AppMode.NewSession) {
      if (key.name === 'return') {
        handleNewSessionSubmit()
      } else {
        handleNewSessionMode(key, keyboardContext, keybindMode)
      }
    } else if (appMode === AppMode.Rename) {
      if (key.name === 'return') {
        handleRenameSubmit()
      } else {
        handleRenameMode(key, keyboardContext, keybindMode)
      }
    } else if (appMode === AppMode.OpencodeManage) {
      handleOpencodeManageMode(key, keyboardContext, keybindMode)
    }
  })

  useEffect(() => {
    const unsubscribe = updateEvents.on(event => {
      setToastMessage(`v${event.version}`)
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
    }
  }, [appMode, viewMode, sessionItems])

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
      ? ' Search Sessions'
      : appMode === AppMode.NewSession
        ? '󰏌 New Session'
        : appMode === AppMode.Rename
          ? '󰏫 Rename Session'
          : appMode === AppMode.OpencodeManage
            ? ' Opencode Sessions'
            : ' Tmux Session Manager'

  const listStyle =
    appMode === AppMode.NewSession
      ? {
          ...sessionListStyleFull,
          flexGrow: 1,
          flexShrink: 1,
        }
      : {
          ...sessionListStyle,
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 40,
        }

  const totalSessions =
    viewMode === ViewMode.Sessions && appMode === AppMode.Normal
      ? items.filter(item => item.isSession).length
      : 0
  const activeSessions = items.filter(item => item.isSession && item.isAttached).length
  const idleSessions = totalSessions - activeSessions

  const sessionsWithAges = items
    .filter(item => item.isSession && item.createdAt)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))

  const oldestSession =
    sessionsWithAges.length > 0 ? formatSessionAge(sessionsWithAges[0].createdAt!) : 'N/A'
  const newestSession =
    sessionsWithAges.length > 0
      ? formatSessionAge(sessionsWithAges[sessionsWithAges.length - 1].createdAt!)
      : 'N/A'
  const maxVisibleItems = Math.max(8, rows - (appMode === AppMode.NewSession ? 10 : 16))

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        gap: 1,
      }}
    >
      {/* Left panel - Session/Project list */}
      <box style={listStyle}>
        <box style={{ alignItems: 'center', justifyContent: 'center' }}>
          <text style={{ fg: colors.primary, marginBottom: 1, marginTop: 1 }}>{title}</text>
        </box>

        {/* Search input */}
        {(appMode === AppMode.Search ||
          appMode === AppMode.NewSession ||
          appMode === AppMode.Rename) && (
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

        {/* Items list */}
        <box
          style={{
            alignSelf: 'auto',
            flexDirection: 'column',
            flexGrow: 0,
            flexShrink: 0,
            marginTop:
              viewMode === ViewMode.Sessions &&
              (appMode === AppMode.Normal || appMode === AppMode.OpencodeManage)
                ? 2
                : 0,
          }}
        >
          {items.length === 0 ? (
            <text style={{ fg: colors.inactive }}>
              {appMode === AppMode.NewSession && searchQuery && isGitHubURL(searchQuery)
                ? `Clone & create session`
                : appMode === AppMode.NewSession && searchQuery
                  ? `Create session: ${searchQuery}`
                  : 'No items found'}
            </text>
          ) : viewMode === ViewMode.Sessions &&
            (appMode === AppMode.Normal || appMode === AppMode.OpencodeManage) ? (
            <>
              {/* Regular sessions */}
              <SessionList
                items={regularSessions}
                cursor={cursor}
                searchQuery={searchQuery}
                maxItems={maxVisibleItems}
              />

              {/* Opencode sessions group */}
              <OpencodeSessionGroup
                sessions={opencodeSessions}
                appMode={appMode}
                cursor={opencodeCursor}
              />

              {/* Session statistics */}
              <SessionStats
                totalSessions={totalSessions}
                activeSessions={activeSessions}
                idleSessions={idleSessions}
                oldestSession={oldestSession}
                newestSession={newestSession}
              />
            </>
          ) : (
            <ItemList
              items={items}
              cursor={cursor}
              appMode={appMode}
              searchQuery={searchQuery}
              maxItems={maxVisibleItems}
            />
          )}
        </box>

        {/* Message */}
        {message && <text style={{ fg: colors.action, marginTop: 1 }}>{message}</text>}

        {/* Terminal size warning */}
        {columns < 80 && appMode !== AppMode.NewSession && (
          <text style={{ fg: colors.inactive, marginTop: 1 }}>
            Terminal too small. Resize for full view.
          </text>
        )}

        {/* Keybind help */}
        <box style={{ marginTop: 1, flexDirection: 'column' }}>
          <KeybindHelp appMode={appMode} keybindMode={config?.keybindMode} />
        </box>
      </box>

      {/* Right panel - Detail panel (only in non-new-session modes) */}
      {shouldShowDetailPanel(columns, appMode === AppMode.NewSession) && (
        <>
          {viewMode === ViewMode.Sessions && appMode === AppMode.OpencodeManage ? (
            <OpencodeStatsPanel selectedItem={opencodeSessions[opencodeCursor]} />
          ) : (
            <SessionDetailsPanel
              selectedItem={
                viewMode === ViewMode.Sessions && appMode === AppMode.Normal
                  ? regularSessions[cursor]
                  : items[cursor]
              }
              config={config}
            />
          )}
        </>
      )}
      <Toast message={toastMessage} visible={toastVisible} />
    </box>
  )
}
