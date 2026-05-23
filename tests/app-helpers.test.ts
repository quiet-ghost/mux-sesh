import { describe, expect, mock, test } from 'bun:test'
import { createAppControls } from '../src/app/controls'
import { getDefaultConfig } from '../src/config'
import { getProjectSelectionIndex, getSessionSelectionIndex } from '../src/app/data'
import { getSessionCommandState, getSettingsState } from '../src/app/derived'
import { createAppHandlers, getPinnedSessionsAfterToggle } from '../src/app/handlers'
import { applyOpencodeState, loadOpencodeSessionStats } from '../src/app/opencode'
import { persistConfigUpdate, runWithErrorMessage } from '../src/app/operations'
import { createAppRuntime } from '../src/app/runtime'
import { applyRefreshedViewState } from '../src/app/state'
import {
  getAppTitle,
  getEmptyStateMessage,
  getFooterHint,
  getStatusLabel,
  splitVisibleSessions,
} from '../src/app/view'
import { AppMode, ViewMode, type Item } from '../src/types'

describe('app view helpers', () => {
  test('splits regular and opencode sessions without losing item shape', () => {
    const items: Item[] = [
      { title: 'dev', desc: '', path: '/tmp/dev', isSession: true },
      { title: 'opencode-dev', desc: '', path: '/tmp/opencode', isSession: true },
    ]

    const split = splitVisibleSessions(items)

    expect(split.regularSessions).toHaveLength(1)
    expect(split.regularSessions[0]?.path).toBe('/tmp/dev')
    expect(split.opencodeSessions).toHaveLength(1)
    expect(split.opencodeSessions[0]?.title).toBe('opencode-dev')
  })

  test('builds title, footer, status, and empty messages from app state', () => {
    expect(getAppTitle(AppMode.NewSession, ViewMode.Projects)).toBe('New Session')
    expect(getFooterHint(AppMode.OpencodeManage, 'ctrl+x')).toContain('ctrl+x')
    expect(getStatusLabel(ViewMode.Sessions, 2, 5, 9)).toBe('2/5 active')
    expect(getEmptyStateMessage(AppMode.NewSession, 'https://github.com/acme/repo', true)).toBe(
      'Clone & create session'
    )
  })
})

describe('app data helpers', () => {
  test('restores selection indexes from remembered session and project identifiers', () => {
    const items: Item[] = [
      { title: 'alpha', desc: '', path: '/tmp/alpha', isSession: true },
      { title: 'opencode-alpha', desc: '', path: '/tmp/opencode', isSession: true },
      { title: 'beta', desc: '', path: '/tmp/beta', isSession: true },
    ]

    expect(getSessionSelectionIndex(items, 'beta')).toBe(1)
    expect(getProjectSelectionIndex(items, '/tmp/opencode')).toBe(1)
    expect(getProjectSelectionIndex([], '/tmp/missing')).toBe(0)
  })
})

describe('app derived helpers', () => {
  test('builds session command state from current app view', () => {
    const config = getDefaultConfig('/home/tester')
    const items: Item[] = [
      { title: 'alpha', desc: '', path: '/tmp/alpha', isSession: true },
      { title: 'opencode-alpha', desc: '', path: '/tmp/opencode', isSession: true },
    ]

    const state = getSessionCommandState(
      AppMode.Normal,
      ViewMode.Sessions,
      items,
      0,
      0,
      config,
      'ref'
    )

    expect(state.regularSessions).toHaveLength(1)
    expect(state.opencodeSessions).toHaveLength(1)
    expect(state.selectedPrimaryItem?.title).toBe('alpha')
    expect(state.filteredCommandEntries.some(entry => entry.id === 'refresh')).toBe(true)
  })

  test('builds settings state for setting option filtering', () => {
    const config = getDefaultConfig('/home/tester')
    const state = getSettingsState(
      config,
      { type: 'setting-options', field: 'keybindMode' },
      'theme',
      'stan'
    )

    expect(state.filteredSettingsEntries.some(entry => entry.id === 'theme')).toBe(true)
    expect(state.filteredSettingOptions).toEqual([
      {
        value: 'standard',
        label: 'standard',
        description: 'Arrow keys with prefixed commands',
      },
    ])
  })
})

describe('app operation helpers', () => {
  test('toggles pinned session names while preserving order', () => {
    const config = {
      ...getDefaultConfig('/home/tester'),
      pinnedSessions: ['main'],
    }

    expect(getPinnedSessionsAfterToggle(config, 'work')).toEqual(['main', 'work'])
    expect(getPinnedSessionsAfterToggle(config, 'main')).toEqual([])
  })

  test('reports fallback errors through the shared message helper', async () => {
    const showMessage = mock(() => {})

    await runWithErrorMessage(
      async () => {
        throw 'boom'
      },
      'fallback message',
      showMessage
    )

    expect(showMessage).toHaveBeenCalledWith('fallback message', 3000)
  })

  test('persists config updates before refresh and success message', async () => {
    const config = getDefaultConfig('/home/tester')
    const nextConfig = { ...config, keybindMode: 'standard' as const }
    const saveConfig = mock(async () => {})
    const setConfig = mock(() => {})
    const refreshItems = mock(async () => {})
    const showMessage = mock(() => {})

    await persistConfigUpdate(
      nextConfig,
      'updated',
      saveConfig,
      setConfig,
      refreshItems,
      showMessage
    )

    expect(saveConfig).toHaveBeenCalledWith(nextConfig)
    expect(setConfig).toHaveBeenCalledWith(nextConfig)
    expect(refreshItems).toHaveBeenCalledWith(undefined, nextConfig)
    expect(showMessage).toHaveBeenCalledWith('updated')
  })
})

describe('app state helpers', () => {
  test('applies refreshed state to all affected collections', () => {
    const setSessionItems = mock(() => {})
    const setProjectSourceItems = mock(() => {})
    const setAllItems = mock(() => {})
    const setItems = mock(() => {})
    const setCursor = mock(() => {})
    const refreshedItems = [{ title: 'alpha', desc: '', path: '/tmp/a', isSession: true }]
    const refreshedProjects = [{ title: 'proj', desc: '', path: '/tmp/p', isSession: false }]

    applyRefreshedViewState(
      {
        items: refreshedItems,
        cursor: 2,
        sessionItems: refreshedItems,
        projectSourceItems: refreshedProjects,
      },
      setSessionItems,
      setProjectSourceItems,
      setAllItems,
      setItems,
      setCursor
    )

    expect(setSessionItems).toHaveBeenCalledWith(refreshedItems)
    expect(setProjectSourceItems).toHaveBeenCalledWith(refreshedProjects)
    expect(setAllItems).toHaveBeenCalledWith(refreshedItems)
    expect(setItems).toHaveBeenCalledWith(refreshedItems)
    expect(setCursor).toHaveBeenCalledWith(2)
  })
})

describe('app controls', () => {
  test('requests kill on first press and confirms on second press', async () => {
    const baseOptions = {
      config: getDefaultConfig('/home/tester'),
      handleKillSession: mock(async () => {}),
      setPendingKillSessionName: mock(() => {}),
      setRenameTarget: mock(() => {}),
      setModalInputValue: mock(() => {}),
      setModalState: mock(() => {}),
      setCommandsSearchQuery: mock(() => {}),
      setCommandsCursor: mock(() => {}),
      setSettingEditorError: mock(() => {}),
      setSettingsSearchQuery: mock(() => {}),
      setSettingsCursor: mock(() => {}),
      setSettingOptionsSearchQuery: mock(() => {}),
      setSettingOptionsCursor: mock(() => {}),
      setSettingEditorValue: mock(() => {}),
    }

    const firstControls = createAppControls({
      ...baseOptions,
      pendingKillSessionName: null,
    })
    firstControls.requestKillSession('alpha')
    expect(baseOptions.setPendingKillSessionName).toHaveBeenCalledWith('alpha')

    const secondControls = createAppControls({
      ...baseOptions,
      pendingKillSessionName: 'alpha',
    })
    secondControls.requestKillSession('alpha')
    await Promise.resolve()
    expect(baseOptions.handleKillSession).toHaveBeenCalledWith('alpha')
  })

  test('opening rename clears pending kill and seeds modal state', () => {
    const options = {
      config: getDefaultConfig('/home/tester'),
      pendingKillSessionName: null,
      handleKillSession: mock(async () => {}),
      setPendingKillSessionName: mock(() => {}),
      setRenameTarget: mock(() => {}),
      setModalInputValue: mock(() => {}),
      setModalState: mock(() => {}),
      setCommandsSearchQuery: mock(() => {}),
      setCommandsCursor: mock(() => {}),
      setSettingEditorError: mock(() => {}),
      setSettingsSearchQuery: mock(() => {}),
      setSettingsCursor: mock(() => {}),
      setSettingOptionsSearchQuery: mock(() => {}),
      setSettingOptionsCursor: mock(() => {}),
      setSettingEditorValue: mock(() => {}),
    }

    createAppControls(options).openRenameModal('beta')

    expect(options.setPendingKillSessionName).toHaveBeenCalledWith(null)
    expect(options.setRenameTarget).toHaveBeenCalledWith('beta')
    expect(options.setModalInputValue).toHaveBeenCalledWith('beta')
    expect(options.setModalState).toHaveBeenCalledWith({ type: 'rename', target: 'beta' })
  })
})

describe('app opencode helpers', () => {
  test('applies opencode state across all item collections', () => {
    let sessionItems: Item[] = [{ title: 'alpha', desc: '', path: '/tmp/a', isSession: true }]
    let allItems: Item[] = [{ title: 'alpha', desc: '', path: '/tmp/a', isSession: true }]
    let items: Item[] = [{ title: 'alpha', desc: '', path: '/tmp/a', isSession: true }]

    applyOpencodeState(
      'alpha',
      { status: 'missing', message: 'not found' },
      update => {
        sessionItems = typeof update === 'function' ? update(sessionItems) : update
      },
      update => {
        allItems = typeof update === 'function' ? update(allItems) : update
      },
      update => {
        items = typeof update === 'function' ? update(items) : update
      }
    )

    expect(sessionItems[0]?.opencodeState).toEqual({ status: 'missing', message: 'not found' })
    expect(allItems[0]?.opencodeState).toEqual({ status: 'missing', message: 'not found' })
    expect(items[0]?.opencodeState).toEqual({ status: 'missing', message: 'not found' })
  })

  test('loads opencode stats and reports failures through shared callbacks', async () => {
    const updateState = mock(() => {})
    const showMessage = mock(() => {})

    const stats = await loadOpencodeSessionStats(
      'alpha',
      async () => ({ sessionID: '1', title: 'alpha' }),
      updateState,
      showMessage
    )

    expect(stats).toEqual({ sessionID: '1', title: 'alpha' })
    expect(updateState).toHaveBeenCalledWith('alpha', { status: 'loading' })
    expect(updateState).toHaveBeenCalledWith('alpha', {
      status: 'ready',
      stats: { sessionID: '1', title: 'alpha' },
    })

    const failingUpdateState = mock(() => {})
    const failingShowMessage = mock(() => {})
    await loadOpencodeSessionStats(
      'beta',
      async () => {
        throw new Error('boom')
      },
      failingUpdateState,
      failingShowMessage
    )

    expect(failingUpdateState).toHaveBeenCalledWith('beta', { status: 'loading' })
    expect(failingUpdateState).toHaveBeenCalledWith('beta', {
      status: 'error',
      message: 'boom',
    })
    expect(failingShowMessage).toHaveBeenCalledWith('boom', 4000)
  })
})

describe('app runtime helpers', () => {
  test('shows messages through shared setter timing helper', () => {
    const setMessage = mock(() => {})
    const runtime = createAppRuntime({
      config: getDefaultConfig('/home/tester'),
      viewMode: ViewMode.Sessions,
      measure: async (_name, fn) => fn(),
      lastSessionSelectionRef: { current: null },
      lastProjectSelectionRef: { current: null },
      setSessionItems: mock(() => {}),
      setProjectSourceItems: mock(() => {}),
      setAllItems: mock(() => {}),
      setItems: mock(() => {}),
      setCursor: mock(() => {}),
      setMessage,
      getOpencodeSessionStats: async () => null,
    })

    runtime.showMessage('hello')

    expect(setMessage).toHaveBeenCalledWith('hello')
  })

  test('loads opencode stats through shared runtime callbacks', async () => {
    const setSessionItems = mock(() => {})
    const setAllItems = mock(() => {})
    const setItems = mock(() => {})

    const runtime = createAppRuntime({
      config: getDefaultConfig('/home/tester'),
      viewMode: ViewMode.Sessions,
      measure: async (_name, fn) => fn(),
      lastSessionSelectionRef: { current: null },
      lastProjectSelectionRef: { current: null },
      setSessionItems,
      setProjectSourceItems: mock(() => {}),
      setAllItems,
      setItems,
      setCursor: mock(() => {}),
      setMessage: mock(() => {}),
      getOpencodeSessionStats: async () => ({ sessionID: '1', title: 'alpha' }),
    })

    const stats = await runtime.loadOpencodeStatsForSession('alpha')

    expect(stats).toEqual({ sessionID: '1', title: 'alpha' })
    expect(setSessionItems).toHaveBeenCalled()
    expect(setAllItems).toHaveBeenCalled()
    expect(setItems).toHaveBeenCalled()
  })
})

describe('app handler factory', () => {
  test('executes refresh command through shared handler wiring', async () => {
    const config = getDefaultConfig('/home/tester')
    const closeModal = mock(() => {})
    const refreshItems = mock(async () => {})
    const showMessage = mock(() => {})

    const handlers = createAppHandlers({
      appMode: AppMode.Normal,
      viewMode: ViewMode.Sessions,
      config,
      items: [],
      sessionItems: [],
      cursor: 0,
      showMessage,
      refreshItems,
      opencodeCursor: 0,
      regularSessions: [],
      opencodeSessions: [],
      selectedPrimaryItem: undefined,
      sessionCandidateItems: [],
      projectSourceItems: [],
      closeModal,
      openRenameModal: mock(() => {}),
      openSettingsModal: mock(() => {}),
      requestKillSession: mock(() => {}),
      setAppMode: mock(() => {}),
      setViewMode: mock(() => {}),
      setAllItems: mock(() => {}),
      setItems: mock(() => {}),
      setCursor: mock(() => {}),
      setSearchQuery: mock(() => {}),
      setOpencodeCursor: mock(() => {}),
      setPendingKillSessionName: mock(() => {}),
      saveConfig: mock(async () => {}),
      setConfig: mock(() => {}),
      setSettingEditorError: mock(() => {}),
      settingEditorValue: '',
      settingEditorPlainText: undefined,
      renameTarget: 'alpha',
      renamedValue: 'alpha-2',
      searchTerm: '',
      loadOpencodeStatsForSession: mock(async () => null),
    })

    await handlers.executeCommand('refresh')

    expect(closeModal).toHaveBeenCalled()
    expect(refreshItems).toHaveBeenCalled()
    expect(showMessage).toHaveBeenCalledWith('Refreshed')
  })

  test('rename submit closes modal when name is unchanged', async () => {
    const closeModal = mock(() => {})

    const handlers = createAppHandlers({
      appMode: AppMode.Normal,
      viewMode: ViewMode.Sessions,
      config: getDefaultConfig('/home/tester'),
      items: [],
      sessionItems: [],
      cursor: 0,
      showMessage: mock(() => {}),
      refreshItems: mock(async () => {}),
      opencodeCursor: 0,
      regularSessions: [],
      opencodeSessions: [],
      selectedPrimaryItem: undefined,
      sessionCandidateItems: [],
      projectSourceItems: [],
      closeModal,
      openRenameModal: mock(() => {}),
      openSettingsModal: mock(() => {}),
      requestKillSession: mock(() => {}),
      setAppMode: mock(() => {}),
      setViewMode: mock(() => {}),
      setAllItems: mock(() => {}),
      setItems: mock(() => {}),
      setCursor: mock(() => {}),
      setSearchQuery: mock(() => {}),
      setOpencodeCursor: mock(() => {}),
      setPendingKillSessionName: mock(() => {}),
      saveConfig: mock(async () => {}),
      setConfig: mock(() => {}),
      setSettingEditorError: mock(() => {}),
      settingEditorValue: '',
      settingEditorPlainText: undefined,
      renameTarget: 'alpha',
      renamedValue: 'alpha',
      searchTerm: '',
      loadOpencodeStatsForSession: mock(async () => null),
    })

    await handlers.handleRenameSubmit()

    expect(closeModal).toHaveBeenCalled()
  })
})
