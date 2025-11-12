import { useKeyboard } from '@opentui/react'
import { useState, useEffect } from 'react'
import { AppMode, ViewMode, type Item, type Config } from './types'
import { loadConfig } from './lib/config'
import {
  listTmuxSessions,
  switchTmuxSession,
  killTmuxSession,
  renameTmuxSession,
  createTmuxSession,
  createNamedTmuxSession,
} from './lib/tmux'
import { getProjectItems } from './lib/projects'
import { filterAndSortItems } from './lib/search'
import { isGitHubURL, cloneGitHubRepo } from './lib/github'
import { colors, sessionListStyle, sessionListStyleFull, detailPanelStyle } from './styles/theme'
import KeybindHelp from './components/KeybindHelp'
import DetailPanel from './components/DetailPanel'

export function App() {
  const [appMode, setAppMode] = useState(AppMode.Normal)
  const [viewMode, setViewMode] = useState(ViewMode.Sessions)
  const [items, setItems] = useState<Item[]>([])
  const [allItems, setAllItems] = useState<Item[]>([])
  const [projectItems, setProjectItems] = useState<Item[]>([])
  const [cursor, setCursor] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [message, setMessage] = useState('')
  const [renameTarget, setRenameTarget] = useState('')
  const [config, setConfig] = useState<Config | null>(null)

  // Initialize
  useEffect(() => {
    async function init() {
      const cfg = await loadConfig()
      setConfig(cfg)

      // Load initial data
      const sessions = await listTmuxSessions()
      const projects = await getProjectItems(cfg)

      setProjectItems(projects)

      if (sessions.length > 0) {
        setViewMode(ViewMode.Sessions)
        setAllItems(sessions)
        setItems(sessions)
      } else {
        setViewMode(ViewMode.Projects)
        setAllItems(projects)
        setItems(projects)
      }
    }
    init()
  }, [])

  async function refreshItems() {
    if (!config) return

    if (viewMode === ViewMode.Sessions) {
      const sessions = await listTmuxSessions()
      setAllItems(sessions)
      setItems(sessions)
    } else {
      const projects = await getProjectItems(config)
      setProjectItems(projects)
      setAllItems(projects)
      setItems(projects)
    }
    setCursor(0)
  }

  // Keyboard handling
  useKeyboard(key => {
    if (appMode === AppMode.Normal) {
      handleNormalMode(key)
    } else if (appMode === AppMode.Search) {
      handleSearchMode(key)
    } else if (appMode === AppMode.NewSession) {
      handleNewSessionMode(key)
    } else if (appMode === AppMode.Rename) {
      handleRenameMode(key)
    }
  })

  function handleNormalMode(key: any) {
    switch (key.name) {
      case 'q':
      case 'escape':
        process.exit(0)
        break
      case 'i':
        setAppMode(AppMode.Search)
        setSearchQuery('')
        break
      case 'n':
        setAppMode(AppMode.NewSession)
        setViewMode(ViewMode.Projects)
        setAllItems(projectItems)
        setItems(projectItems)
        setCursor(Math.max(0, projectItems.length - 1))
        setSearchQuery('')
        break
      case 'd':
        if (viewMode === ViewMode.Sessions && items[cursor]?.isSession) {
          handleKillSession(items[cursor].title)
        }
        break
      case 'r':
        if (viewMode === ViewMode.Sessions && items[cursor]?.isSession) {
          setAppMode(AppMode.Rename)
          setRenameTarget(items[cursor].title)
          setSearchQuery(items[cursor].title)
        }
        break
      case 'R':
        refreshItems()
        setMessage('Refreshed')
        setTimeout(() => setMessage(''), 2000)
        break
      case 's':
        setViewMode(ViewMode.Sessions)
        refreshItems()
        break
      case 'p':
        setViewMode(ViewMode.Projects)
        refreshItems()
        break
      case 'j':
      case 'down':
        setCursor(c => Math.min(c + 1, items.length - 1))
        break
      case 'k':
      case 'up':
        setCursor(c => Math.max(c - 1, 0))
        break
      case 'return':
        if (items[cursor]) {
          handleSelect(items[cursor])
        }
        break
      default:
        // Handle number keys 1-9
        if (key.name >= '1' && key.name <= '9') {
          const num = parseInt(key.name) - 1
          if (num >= 0 && num < items.length) {
            handleSelect(items[num])
          }
        }
        break
    }
  }

  function handleSearchMode(key: any) {
    switch (key.name) {
      case 'escape':
        setAppMode(AppMode.Normal)
        setSearchQuery('')
        setItems(allItems)
        setCursor(0)
        break
      case 'return':
        if (items.length > 0) {
          handleSelect(items[0])
        }
        break
      case 'down':
        setCursor(c => Math.min(c + 1, items.length - 1))
        break
      case 'up':
        setCursor(c => Math.max(c - 1, 0))
        break
    }
  }

  function handleNewSessionMode(key: any) {
    switch (key.name) {
      case 'escape':
        setAppMode(AppMode.Normal)
        setViewMode(ViewMode.Sessions)
        setSearchQuery('')
        refreshItems()
        break
      case 'return':
        handleNewSessionSubmit()
        break
      case 'down':
        setCursor(c => Math.min(c + 1, items.length - 1))
        break
      case 'up':
        setCursor(c => Math.max(c - 1, 0))
        break
    }
  }

  function handleRenameMode(key: any) {
    switch (key.name) {
      case 'escape':
        setAppMode(AppMode.Normal)
        setSearchQuery('')
        setRenameTarget('')
        break
      case 'return':
        handleRenameSubmit()
        break
    }
  }

  async function handleSelect(item: Item) {
    if (item.isSession) {
      await switchTmuxSession(item.title)
    } else {
      await createTmuxSession(item.title, item.path)
    }
  }

  async function handleKillSession(sessionName: string) {
    try {
      await killTmuxSession(sessionName)
      setMessage(`Session '${sessionName}' killed`)
      setTimeout(() => setMessage(''), 2000)
      await refreshItems()
    } catch (error) {
      setMessage(`Error killing session: ${error}`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  async function handleRenameSubmit() {
    const newName = searchQuery.trim()
    if (newName && newName !== renameTarget) {
      try {
        await renameTmuxSession(renameTarget, newName)
        setMessage(`Session renamed to '${newName}'`)
        setTimeout(() => setMessage(''), 2000)
        await refreshItems()
      } catch (error) {
        setMessage(`Error renaming session: ${error}`)
        setTimeout(() => setMessage(''), 3000)
      }
    }
    setAppMode(AppMode.Normal)
    setSearchQuery('')
    setRenameTarget('')
  }

  async function handleNewSessionSubmit() {
    const searchTerm = searchQuery.trim()

    if (!searchTerm) return

    if (isGitHubURL(searchTerm)) {
      // Clone and create session
      try {
        if (!config) return
        const clonedPath = await cloneGitHubRepo(searchTerm, config)
        await createTmuxSession(clonedPath, clonedPath)
      } catch (error) {
        setMessage(`Error cloning repository: ${error}`)
        setTimeout(() => setMessage(''), 3000)
      }
    } else if (items.length > 0 && cursor < items.length) {
      // Create session from selected project
      const selectedItem = items[cursor]
      await createTmuxSession(selectedItem.title, selectedItem.path)
    } else {
      // Create custom named session
      await createNamedTmuxSession(searchTerm)
    }
  }

  // Filter items based on search query
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

  const title =
    appMode === AppMode.Search
      ? ' Search Sessions'
      : appMode === AppMode.NewSession
        ? ' New Session'
        : appMode === AppMode.Rename
          ? '󰏫  Rename Session'
          : '  Tmux Session Manager'

  const listStyle = appMode === AppMode.NewSession ? sessionListStyleFull : sessionListStyle

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
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
          <box style={{ marginBottom: 1 }}>
            <input
              placeholder={
                appMode === AppMode.NewSession
                  ? 'Type project name, GitHub URL, or custom session name...'
                  : appMode === AppMode.Rename
                    ? 'Enter new session name...'
                    : 'Type to search...'
              }
              value={searchQuery}
              onInput={setSearchQuery}
              focused
            />
          </box>
        )}

        {/* Items list */}
        <box
          style={{
            alignSelf: 'auto',
            flexDirection: 'column',
            flexGrow: 1,
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
          ) : (
            items.slice(0, 50).map((item, i) => (
              <box
                key={i}
                style={{
                  backgroundColor: i === cursor ? colors.backgroundAlt : 'transparent',
                  height: 1,
                  paddingLeft: 2,
                }}
              >
                {i === cursor && <text> </text>}
                <text>
                  {i + 1}{' '}
                  {item.isSession ? (
                    <>
                      <span
                        style={{
                          fg: item.isAttached ? colors.active : colors.inactive,
                        }}
                      >
                        {item.isAttached ? '●' : '○'}
                      </span>{' '}
                      {item.title} <span style={{ fg: colors.inactive }}>({item.windowCount})</span>
                    </>
                  ) : (
                    <>
                      {appMode === AppMode.NewSession ? item.desc : item.title}
                      {appMode !== AppMode.NewSession && item.desc && (
                        <span style={{ fg: colors.inactive }}> {item.desc}</span>
                      )}
                    </>
                  )}
                </text>
              </box>
            ))
          )}
        </box>

        {/* Message */}
        {message && <text style={{ fg: colors.action, marginTop: 1 }}>{message}</text>}

        {/* Keybind help */}
        <box style={{ marginTop: 1 }}>
          <KeybindHelp appMode={appMode} />
        </box>
      </box>

      {/* Right panel - Detail panel (only in non-new-session modes) */}
      {appMode !== AppMode.NewSession && (
        <DetailPanel selectedItem={items[cursor]} appMode={appMode} />
      )}
    </box>
  )
}
