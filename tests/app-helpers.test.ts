import { describe, expect, mock, test } from 'bun:test'
import {
  getActionFooter,
  getActionTarget,
  getCommandEntries,
  type ActionContext,
} from '../src/app/action-catalog'
import { PendingClose } from '../src/app/pending-close'
import { ActionRefused } from '../src/app/action-outcome'
import { createAppControls } from '../src/app/modal-controls'
import { getDefaultConfig } from '../src/config'
import {
  getAgentSelectionIndex,
  getProjectSelectionIndex,
  getSessionSelectionIndex,
  reuseSessionItemIdentities,
} from '../src/app/inventory-load'
import { getSessionCommandState, getSettingsState } from '../src/app/view-state'
import { createAppHandlers, getPinnedSessionsAfterToggle } from '../src/app/action-feedback'
import { persistConfigUpdate, runWithErrorToast } from '../src/app/toast-operations'
import type { ToastInput } from '../src/app/notifications'
import { OptionPicker } from '../src/app/option-picker'
import { createAppRuntime } from '../src/app/list-refresh'
import {
  publishInventory,
  type InventoryOutcome,
  type SessionInventory,
} from '../src/app/session-inventory'
import {
  getAppTitle,
  getEmptyStateMessage,
  getStatusLabel,
  splitVisibleSessions,
} from '../src/app/screen-layout'
import { AppMode, ViewMode, type Item } from '../src/types'
import { createHerdrBackend } from '../src/herdr/backend'
import { getItemKey, workspaceToItem } from '../src/multiplexer/items'
import { MultiplexerError } from '../src/multiplexer/types'
import { filterHiddenSessions } from '../src/sessions/session-filters'
import { INACTIVE_LAUNCH } from '../src/sessions/launch-plan'
import { IDLE } from '../src/util/pending'
import { NO_GIT } from './fixtures/local-github'

function actionContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    appMode: AppMode.Normal,
    viewMode: ViewMode.Sessions,
    keybindMode: 'vim',
    prefixKey: 'ctrl+x',
    backend: { kind: 'tmux', capabilities: { previousWorkspace: true } },
    agentCount: 0,
    target: { kind: 'none' },
    marked: new Map(),
    pendingClose: PendingClose.none,
    ...overrides,
  }
}

describe('app view helpers', () => {
  test('splits regular and agent sessions without losing item shape', () => {
    const items: Item[] = [
      { title: 'dev', desc: '', path: '/tmp/dev', isSession: true },
      { title: 'opencode-dev', desc: '', path: '/tmp/opencode', isSession: true },
      { title: 'pi-main', desc: '', path: '/tmp/pi', isSession: true },
      { title: 'codex-work', desc: '', path: '/tmp/codex', isSession: true },
      { title: 'claude-review', desc: '', path: '/tmp/claude', isSession: true },
      { title: 'tui_chat', desc: '', path: '/tmp/chat', isSession: true },
      {
        title: 'herdr-agent',
        desc: '',
        path: '/tmp/herdr-agent',
        isSession: true,
        itemKind: 'herdr',
        agentStatus: 'working',
        target: { kind: 'agent', tabId: 'w1:t1', paneId: 'w1:p1' },
      },
      {
        title: 'herdr-busy-workspace',
        desc: '',
        path: '/tmp/herdr-busy',
        isSession: true,
        itemKind: 'herdr',
        agentStatus: 'working',
      },
      {
        title: 'herdr-plain',
        desc: '',
        path: '/tmp/herdr-plain',
        isSession: true,
        itemKind: 'herdr',
        agentStatus: 'unknown',
      },
    ]

    const split = splitVisibleSessions(items)

    expect(split.regularSessions.map(item => item.title)).toEqual([
      'dev',
      'herdr-busy-workspace',
      'herdr-plain',
    ])
    expect(split.agentSessions.map(item => item.title)).toEqual([
      'opencode-dev',
      'pi-main',
      'codex-work',
      'claude-review',
      'tui_chat',
      'herdr-agent',
    ])
  })

  test('builds title, footer, status, and empty messages from app state', () => {
    expect(getAppTitle(AppMode.NewSession, ViewMode.Projects)).toBe('New Session')
    expect(getAppTitle(AppMode.AgentsManage, ViewMode.Sessions)).toBe('Agent Sessions')
    expect(getActionFooter(actionContext({ appMode: AppMode.AgentsManage })).global).toContainEqual(
      {
        id: 'prefix',
        label: 'prefix',
        key: 'ctrl+x',
      }
    )
    expect(getActionFooter(actionContext({ agentCount: 1 })).global).toContainEqual({
      id: 'open-agents',
      label: 'agents',
      key: 'o',
    })
    expect(getActionFooter(actionContext()).global.map(hint => hint.id)).not.toContain(
      'open-agents'
    )
    expect(getStatusLabel(ViewMode.Sessions, 2, 5, 9)).toBe('2/5 active')
    expect(getEmptyStateMessage(AppMode.NewSession, 'https://github.com/acme/repo', true)).toBe(
      'Clone & create session'
    )
  })

  test('hides destructive agent controls for a targeted Herdr tab', () => {
    const agent = {
      title: 'opencode-api',
      desc: '',
      path: '/repo/api',
      isSession: true as const,
      itemKind: 'herdr' as const,
      backend: 'herdr' as const,
      sessionId: 'agents',
      target: { kind: 'agent' as const, tabId: 'agents:t1', paneId: 'agents:p1' },
    }

    const entries = getCommandEntries(
      actionContext({
        appMode: AppMode.AgentsManage,
        agentCount: 1,
        target: getActionTarget(agent),
      })
    )

    expect(entries.find(entry => entry.id === 'kill-session')?.availability).toEqual({
      kind: 'unavailable',
      reason: 'Close it in Herdr',
    })
    expect(entries.find(entry => entry.id === 'rename-session')?.availability).toEqual({
      kind: 'unavailable',
      reason: 'Rename it in Herdr',
    })

    const footer = getActionFooter(
      actionContext({
        appMode: AppMode.AgentsManage,
        agentCount: 1,
        target: getActionTarget(agent),
      })
    )

    expect([...footer.global, ...footer.target].map(hint => hint.id)).not.toContain('kill-session')
  })
})

describe('app data helpers', () => {
  test('uses the target pane to identify agents sharing one Herdr workspace', () => {
    const first = workspaceToItem({
      backend: 'herdr',
      id: 'agents',
      title: 'first',
      path: '/repo/first',
      isActive: false,
      unitCount: 1,
      target: { kind: 'agent', tabId: 'agents:t1', paneId: 'agents:p1' },
    })

    const second = workspaceToItem({
      backend: 'herdr',
      id: 'agents',
      title: 'second',
      path: '/repo/second',
      isActive: false,
      unitCount: 1,
      target: { kind: 'agent', tabId: 'agents:t2', paneId: 'agents:p2' },
    })

    expect(getItemKey(first)).not.toBe(getItemKey(second))
    expect(getAgentSelectionIndex([second, first], getItemKey(first), 0)).toBe(1)
    expect(getAgentSelectionIndex([second], getItemKey(first), 1)).toBe(0)
    expect(reuseSessionItemIdentities([first], [{ ...first }])[0]).toBe(first)
    expect(reuseSessionItemIdentities([first], [{ ...first, agentStatus: 'working' }])[0]).not.toBe(
      first
    )
  })

  test('hides expanded Herdr agents by their source workspace title', () => {
    const agent = workspaceToItem({
      backend: 'herdr',
      id: 'agents',
      title: 'opencode-api',
      workspaceTitle: 'Agents',
      path: '/repo/api',
      isActive: false,
      unitCount: 1,
      target: { kind: 'agent', tabId: 'agents:t1', paneId: 'agents:p1' },
    })

    expect(filterHiddenSessions([agent], ['Agents'])).toEqual([])
  })

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
  test.each([
    { appMode: AppMode.Normal, keybindMode: 'vim' },
    { appMode: AppMode.Search, keybindMode: 'vim' },
    { appMode: AppMode.Search, keybindMode: 'standard' },
    { appMode: AppMode.AgentsManage, keybindMode: 'standard' },
  ] as const)(
    'retains native agent targets in $keybindMode $appMode',
    ({ appMode, keybindMode }) => {
      const plain = workspaceToItem({
        backend: 'herdr',
        id: 'plain',
        title: 'opencode-native-unknown',
        path: '/fixture/plain',
        isActive: false,
        unitCount: 1,
        agentStatus: 'unknown',
      })

      const agent = workspaceToItem({
        backend: 'herdr',
        id: 'agents',
        title: 'worker',
        path: '/fixture/worker',
        isActive: false,
        unitCount: 1,
        agentStatus: 'unknown',
        target: { kind: 'agent', tabId: 'agents:t1', paneId: 'agents:p1' },
      })

      const state = getSessionCommandState(
        appMode,
        ViewMode.Sessions,
        [plain, agent],
        0,
        0,
        { ...getDefaultConfig('/fixture'), keybindMode },
        ''
      )

      expect(state.agentSessions).toEqual([agent])
      expect(state.agentSessions[0]).toBe(agent)
      expect(state.regularSessions).toContain(plain)
    }
  )

  test('keeps search list and command targets on the same flat cursor', () => {
    const agent = workspaceToItem({
      backend: 'tmux',
      id: 'pi-agent',
      title: 'pi-agent',
      path: '/fixture/agent',
      isActive: false,
      unitCount: 1,
    })

    const plain = workspaceToItem({
      backend: 'tmux',
      id: 'plain',
      title: 'plain',
      path: '/fixture/plain',
      isActive: false,
      unitCount: 1,
    })

    const items = [agent, plain]

    const state = getSessionCommandState(
      AppMode.Search,
      ViewMode.Sessions,
      items,
      1,
      0,
      { ...getDefaultConfig('/fixture'), keybindMode: 'standard' },
      ''
    )

    expect(state.agentSessions).toEqual([agent])
    expect(state.regularSessions).toBe(items)
    expect(state.regularSessions[1]).toBe(plain)
    expect(state.selectedPrimaryItem).toBe(plain)
  })

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
    expect(state.agentSessions).toHaveLength(1)
    expect(state.selectedPrimaryItem?.title).toBe('alpha')
    expect(state.filteredCommandEntries.some(entry => entry.id === 'refresh')).toBe(true)
  })

  test('command palette search for theme opens Themes', () => {
    const config = getDefaultConfig('/home/tester')
    const entries = getCommandEntries(actionContext())

    const state = getSessionCommandState(
      AppMode.Normal,
      ViewMode.Sessions,
      [{ title: 'alpha', desc: '', path: '/tmp/alpha', isSession: true }],
      0,
      0,
      config,
      'theme'
    )

    expect(entries.some(entry => entry.id === 'open-themes')).toBe(true)
    expect(state.filteredCommandEntries.some(entry => entry.id === 'open-themes')).toBe(true)
    expect(state.filteredCommandEntries.some(entry => entry.id === 'open-settings')).toBe(false)
  })

  test('builds settings state for setting option filtering', () => {
    const config = getDefaultConfig('/home/tester')

    const state = getSettingsState(
      config,
      {
        type: 'setting-options',
        field: 'keybindMode',
        openedFrom: 'settings',
        picker: OptionPicker.browsing,
      },
      'theme',
      'stan',
      '/home/tester'
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

  test('reports a refusal as a warning and a backend failure as an error', async () => {
    const showToast = mock((_toast: ToastInput) => {})

    await runWithErrorToast(async () => {
      throw new ActionRefused({ reason: 'No session or project is selected' })
    }, showToast)

    await runWithErrorToast(async () => {
      throw new MultiplexerError('command-failed', 'tmux exited')
    }, showToast)

    expect(showToast.mock.calls).toEqual([
      [{ kind: 'warning', message: 'No session or project is selected' }],
      [{ kind: 'error', message: 'tmux exited' }],
    ])
  })

  test('lets defects through the shared toast helper to crash recovery', async () => {
    const showMessage = mock(() => {})

    const failure = await runWithErrorToast(async () => {
      throw 'boom'
    }, showMessage).then(
      () => undefined,
      (cause: unknown) => cause
    )

    expect(failure).toBe('boom')
    expect(showMessage).not.toHaveBeenCalled()
  })

  test('persists config updates before refresh and success message', async () => {
    const config = getDefaultConfig('/home/tester')
    const nextConfig = { ...config, keybindMode: 'standard' as const }
    const saveConfig = mock(async () => {})
    const setConfig = mock(() => {})
    const refreshItems = mock(async () => {})

    const outcome = await persistConfigUpdate(
      nextConfig,
      'updated',
      saveConfig,
      setConfig,
      refreshItems
    )

    expect(saveConfig).toHaveBeenCalledWith(nextConfig)
    expect(setConfig).toHaveBeenCalledWith(nextConfig)
    expect(refreshItems).toHaveBeenCalledWith(undefined, nextConfig)
    expect(outcome).toEqual({ kind: 'completed', message: 'updated' })
  })
})

describe('app state helpers', () => {
  function createSink(lastSessionSelection: string | null, lastProjectSelection: string | null) {
    return {
      lastSessionSelectionRef: { current: lastSessionSelection },
      lastProjectSelectionRef: { current: lastProjectSelection },
      setSessionItems: mock(() => {}),
      setLiveSessions: mock(() => {}),
      setProjectSourceItems: mock(() => {}),
      setAllItems: mock(() => {}),
      setItems: mock(() => {}),
      setCursor: mock(() => {}),
      setAgentCursor: mock(() => {}),
    }
  }

  test('publishes a projects inventory to all affected collections', () => {
    const sink = createSink(null, '/tmp/q')
    const refreshedItems = [{ title: 'alpha', desc: '', path: '/tmp/a', isSession: true }]

    const refreshedProjects = [
      { title: 'proj', desc: '', path: '/tmp/p', isSession: false },
      { title: 'other', desc: '', path: '/tmp/q', isSession: false },
    ]

    publishInventory(
      {
        viewMode: ViewMode.Projects,
        liveSessions: refreshedItems,
        sessionItems: refreshedItems,
        projectSourceItems: refreshedProjects,
        projectItems: refreshedProjects,
      },
      { sessionCursor: 0, agentKey: undefined, agentCursor: 0 },
      sink
    )

    expect(sink.setSessionItems).toHaveBeenCalledTimes(1)
    expect(sink.setLiveSessions).toHaveBeenCalledWith(refreshedItems)
    expect(sink.setProjectSourceItems).toHaveBeenCalledWith(refreshedProjects)
    expect(sink.setAllItems).toHaveBeenCalledWith(refreshedProjects)
    expect(sink.setItems).toHaveBeenCalledWith(refreshedProjects)
    expect(sink.setCursor).toHaveBeenCalledWith(1)
  })

  test('publishes a sessions inventory and remembers the fallback selection', () => {
    const sink = createSink('tmux:gone', null)

    const session = (title: string) =>
      workspaceToItem({
        backend: 'tmux',
        id: title,
        title,
        path: `/tmp/${title}`,
        isActive: false,
        unitCount: 1,
      })

    const delta = session('delta')
    const sessions = [session('alpha'), session('beta'), delta]

    publishInventory(
      { viewMode: ViewMode.Sessions, liveSessions: sessions, sessionItems: sessions },
      { sessionCursor: 5, agentKey: undefined, agentCursor: 0 },
      sink
    )

    expect(sink.setSessionItems).toHaveBeenCalledTimes(1)
    expect(sink.setAllItems).toHaveBeenCalledTimes(1)
    expect(sink.setItems).toHaveBeenCalledTimes(1)
    expect(sink.setProjectSourceItems).not.toHaveBeenCalled()
    expect(sink.setCursor).toHaveBeenCalledWith(2)
    expect(sink.setAgentCursor).toHaveBeenCalledWith(0)
    expect(sink.lastSessionSelectionRef.current).toBe(getItemKey(delta))
  })
})

describe('app controls', () => {
  // A request only freezes the exact ref and waits on the row; the second d is the keyboard's,
  // so asking twice here never closes anything.
  test('requesting a kill arms the exact ref on its row and never closes on a second request', () => {
    const item: Item = {
      title: 'alpha',
      desc: '',
      path: '/tmp/alpha',
      isSession: true,
      itemKind: 'tmux',
      backend: 'tmux',
      sessionId: 'alpha',
    }

    const options = {
      config: getDefaultConfig('/home/tester'),
      sessionItems: [item],
      inventoryRevision: () => 7,
      backend: null,
      markedItems: new Map(),
      setMarkedItems: mock(() => {}),
      setPendingClose: mock(() => {}),
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

    const controls = createAppControls(options)
    controls.requestKillSession(item)
    controls.requestKillSession(item)

    const armed = PendingClose.arm({
      key: 'tmux:alpha',
      ref: { backend: 'tmux', id: 'alpha', title: 'alpha' },
      path: '/tmp/alpha',
      units: undefined,
      warnings: [],
      revision: 7,
    })

    expect(options.setPendingClose).toHaveBeenCalledTimes(2)
    expect(options.setPendingClose).toHaveBeenNthCalledWith(1, armed)
    expect(options.setPendingClose).toHaveBeenNthCalledWith(2, armed)
    expect(options.setModalState).not.toHaveBeenCalled()
  })

  test('requesting a kill of an agent pane is refused instead of widening to its workspace', () => {
    const pane: Item = {
      title: 'opencode-api',
      desc: '',
      path: '/tmp/api',
      isSession: true,
      itemKind: 'herdr',
      backend: 'herdr',
      sessionId: 'w1',
      target: { kind: 'agent', tabId: 'w1:t1', paneId: 'w1:p1' },
    }

    const setModalState = mock(() => {})
    const setPendingClose = mock(() => {})

    const controls = createAppControls({
      config: getDefaultConfig('/home/tester'),
      sessionItems: [pane],
      inventoryRevision: () => 1,
      backend: null,
      markedItems: new Map(),
      setMarkedItems: mock(() => {}),
      setPendingClose,
      setRenameTarget: mock(() => {}),
      setModalInputValue: mock(() => {}),
      setModalState,
      setCommandsSearchQuery: mock(() => {}),
      setCommandsCursor: mock(() => {}),
      setSettingEditorError: mock(() => {}),
      setSettingsSearchQuery: mock(() => {}),
      setSettingsCursor: mock(() => {}),
      setSettingOptionsSearchQuery: mock(() => {}),
      setSettingOptionsCursor: mock(() => {}),
      setSettingEditorValue: mock(() => {}),
    })

    expect(() => controls.requestKillSession(pane)).toThrow(ActionRefused)
    expect(setModalState).not.toHaveBeenCalled()
    expect(setPendingClose).not.toHaveBeenCalled()
  })

  test('opening rename seeds modal state', () => {
    const item: Item = { title: 'beta', desc: '', path: '/tmp/beta', isSession: true }

    const options = {
      config: getDefaultConfig('/home/tester'),
      sessionItems: [],
      inventoryRevision: () => 0,
      backend: null,
      markedItems: new Map(),
      setMarkedItems: mock(() => {}),
      setPendingClose: mock(() => {}),
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

    createAppControls(options).openRenameModal(item)

    expect(options.setRenameTarget).toHaveBeenCalledWith(item)
    expect(options.setModalInputValue).toHaveBeenCalledWith('beta')
    expect(options.setModalState).toHaveBeenCalledWith({ type: 'rename', target: 'beta' })
  })
})

const REFRESH_CASES: Array<{
  outcome: 'published' | 'failed' | 'superseded'
  toasts: ToastInput[]
}> = [
  { outcome: 'published', toasts: [{ kind: 'success', message: 'Refreshed' }] },
  { outcome: 'failed', toasts: [] },
  { outcome: 'superseded', toasts: [] },
]

describe('app runtime helpers', () => {
  test.each(REFRESH_CASES)(
    'a manual refresh that is $outcome confirms only a published list',
    async ({ outcome, toasts }) => {
      const showToast = mock((_toast: ToastInput) => {})

      const unusedRunner = mock(async () => {
        throw new Error('The mocked inventory never runs a backend command')
      })

      const results: Record<typeof outcome, InventoryOutcome> = {
        published: {
          kind: 'published',
          generation: 1,
          snapshot: { viewMode: ViewMode.Sessions, liveSessions: [], sessionItems: [] },
        },
        failed: { kind: 'failed', failure: new MultiplexerError('server-stopped', 'stopped') },
        superseded: { kind: 'superseded' },
      }

      const refresh = mock(async () => results[outcome])

      const inventory: SessionInventory = {
        refresh,
        observe: mock(() => {}),
        status: () => ({ kind: 'fresh' }),
        revision: () => 0,
        subscribe: () => () => {},
        loading: IDLE,
        dispose: mock(() => {}),
      }

      const runtime = createAppRuntime({
        config: getDefaultConfig('/home/tester'),
        backend: createHerdrBackend({ runner: { run: unusedRunner }, insideHerdr: true }),
        viewMode: ViewMode.Sessions,
        inventory,
        showToast,
      })

      await runtime.refreshList()

      expect(refresh).toHaveBeenCalledTimes(1)
      expect(showToast.mock.calls.map(([toast]) => toast)).toEqual(toasts)
    }
  )
})

describe('app handler factory', () => {
  test('executes refresh command through shared handler wiring', async () => {
    const config = getDefaultConfig('/home/tester')
    const closeModal = mock(() => {})
    const refreshItems = mock(async () => {})
    const refreshList = mock(async () => {})

    const handlers = createAppHandlers({
      clone: NO_GIT,
      launchGuard: { active: false },
      showOutcome: mock(() => {}),
      viewMode: ViewMode.Sessions,
      config,
      backend: null,
      items: [],
      sessionItems: [],
      cursor: 0,
      showToast: mock(() => {}),
      refreshItems,
      refreshList,
      regularSessions: [],
      agentSessions: [],
      selectedPrimaryItem: undefined,
      sessionCandidateItems: [],
      projectSourceItems: [],
      closeModal,
      openRenameModal: mock(() => {}),
      openSettingsModal: mock(() => {}),
      openSettingOptions: mock(() => {}),
      setModalState: mock(() => {}),
      requestKillSession: mock(() => {}),
      setAppMode: mock(() => {}),
      setViewMode: mock(() => {}),
      setAllItems: mock(() => {}),
      setItems: mock(() => {}),
      setCursor: mock(() => {}),
      setSearchQuery: mock(() => {}),
      setAgentCursor: mock(() => {}),
      requestMarkedClose: mock(async () => {}),
      toggleMark: mock(() => {}),
      clearMarks: mock(() => {}),
      markedItems: new Map(),
      reloadSessions: mock(async () => undefined),
      saveConfig: mock(async () => {}),
      setConfig: mock(() => {}),
      setSettingEditorError: mock(() => {}),
      settingEditorValue: '',
      settingEditorPlainText: undefined,
      renameTarget: null,
      renamedValue: 'alpha-2',
      launchPreview: INACTIVE_LAUNCH,
      rememberedSessions: mock(() => {}),
      inventoryRevision: () => 0,
      toggleDetails: mock(() => {}),
    })

    await handlers.executeCommand('refresh')

    expect(closeModal).toHaveBeenCalled()
    expect(refreshList).toHaveBeenCalled()
  })

  test('rename submit closes modal when name is unchanged', async () => {
    const closeModal = mock(() => {})
    const refreshItems = mock(async () => {})
    const showToast = mock(() => {})

    const run = mock(async () => {
      throw new Error('An unchanged name must not trigger a backend command')
    })

    const backend = createHerdrBackend({ runner: { run }, insideHerdr: true })

    const renameTarget = workspaceToItem({
      backend: 'herdr',
      id: 'w1',
      title: 'alpha',
      path: '/tmp/alpha',
      isActive: false,
      unitCount: 1,
    })

    const handlers = createAppHandlers({
      clone: NO_GIT,
      launchGuard: { active: false },
      showOutcome: mock(() => {}),
      viewMode: ViewMode.Sessions,
      config: getDefaultConfig('/home/tester'),
      backend,
      items: [],
      sessionItems: [],
      cursor: 0,
      showToast,
      refreshItems,
      refreshList: mock(async () => {}),
      regularSessions: [],
      agentSessions: [],
      selectedPrimaryItem: undefined,
      sessionCandidateItems: [],
      projectSourceItems: [],
      closeModal,
      openRenameModal: mock(() => {}),
      openSettingsModal: mock(() => {}),
      openSettingOptions: mock(() => {}),
      setModalState: mock(() => {}),
      requestKillSession: mock(() => {}),
      setAppMode: mock(() => {}),
      setViewMode: mock(() => {}),
      setAllItems: mock(() => {}),
      setItems: mock(() => {}),
      setCursor: mock(() => {}),
      setSearchQuery: mock(() => {}),
      setAgentCursor: mock(() => {}),
      requestMarkedClose: mock(async () => {}),
      toggleMark: mock(() => {}),
      clearMarks: mock(() => {}),
      markedItems: new Map(),
      reloadSessions: mock(async () => undefined),
      saveConfig: mock(async () => {}),
      setConfig: mock(() => {}),
      setSettingEditorError: mock(() => {}),
      settingEditorValue: '',
      settingEditorPlainText: undefined,
      renameTarget,
      renamedValue: 'alpha',
      launchPreview: INACTIVE_LAUNCH,
      rememberedSessions: mock(() => {}),
      inventoryRevision: () => 0,
      toggleDetails: mock(() => {}),
    })

    await handlers.handleRenameSubmit()

    expect(closeModal).toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    expect(refreshItems).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })
})
