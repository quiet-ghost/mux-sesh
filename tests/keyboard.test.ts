import { describe, expect, mock, test } from 'bun:test'
import {
  handleNormalMode,
  handleAgentsManageMode,
  handleSearchMode,
  type KeyboardHandlerContext,
  type KeyboardInput,
} from '../src/handlers/keyboard'
import { getActionTarget, type ActionContext } from '../src/app/action-catalog'
import { PendingClose } from '../src/app/pending-close'
import { AppMode, ViewMode, type Item } from '../src/types'

function createItem(overrides: Partial<Item> = {}): Item {
  return {
    title: 'session-1',
    desc: '',
    path: '/tmp/session-1',
    isSession: true,
    itemKind: 'tmux',
    backend: 'tmux',
    sessionId: overrides.title ?? 'session-1',
    ...overrides,
  }
}

function selectedItem(ctx: BaseContext): Item | undefined {
  if (ctx.appMode === AppMode.AgentsManage) return ctx.agentSessions[ctx.agentCursor]

  if (ctx.appMode === AppMode.Normal && ctx.viewMode === ViewMode.Sessions) {
    return ctx.regularSessions[ctx.cursor]
  }

  return ctx.items[ctx.cursor]
}

type BaseContext = Omit<KeyboardHandlerContext, 'actionContext'>

function actionContextOf(ctx: BaseContext): ActionContext {
  return {
    appMode: ctx.appMode,
    viewMode: ctx.viewMode,
    keybindMode: 'vim',
    prefixKey: ctx.prefixKey,
    backend: { kind: 'tmux', capabilities: { previousWorkspace: true } },
    agentCount: ctx.agentSessions.length,
    target: getActionTarget(selectedItem(ctx)),
    marked: new Map(),
    pendingClose: PendingClose.none,
  }
}

function createContext(overrides: Partial<KeyboardHandlerContext> = {}): KeyboardHandlerContext {
  const ctx = createBaseContext(overrides)

  return { ...ctx, actionContext: overrides.actionContext ?? actionContextOf(ctx) }
}

function createBaseContext(overrides: Partial<KeyboardHandlerContext>): BaseContext {
  const items = [createItem()]

  return {
    appMode: AppMode.Search,
    viewMode: ViewMode.Sessions,
    items,
    regularSessions: items,
    agentSessions: [],
    cursor: 0,
    agentCursor: 0,
    searchQuery: '',
    prefixKey: 'ctrl+x',
    projectItems: [],
    sessionItems: items,
    prefixActive: true,
    prefixTimeoutRef: { current: null },
    // Runs the task as the production owner would; these handler mocks never reject.
    runAction: mock((task: () => Promise<void>) => {
      task().catch(cause => {
        throw cause
      })
    }),
    setAppMode: mock(() => {}),
    setViewMode: mock(() => {}),
    setCursor: mock(() => 0),
    setAgentCursor: mock(() => 0),
    setSearchQuery: mock(() => {}),
    setAllItems: mock(() => items),
    setItems: mock(() => items),
    setPrefixActive: mock(() => {}),
    refreshItems: mock(async () => {}),
    refreshList: mock(async () => {}),
    requestKillSession: mock(() => {}),
    requestMarkedClose: mock(async () => {}),
    toggleMark: mock(() => {}),
    togglePinnedSession: mock(async () => {}),
    handleSelect: mock(async () => {}),
    launchPlanned: mock(async () => {}),
    launchProjectRow: mock(async () => {}),
    handleLastSession: mock(async () => {}),
    handleRootSession: mock(async () => {}),
    handleEditTarget: mock(async () => {}),
    openRenameModal: mock(() => {}),
    openCommandsModal: mock(() => {}),
    openSettingsModal: mock(() => {}),
    toggleDetails: mock(() => {}),
    showToast: mock(() => {}),
    ...overrides,
  }
}

describe('keyboard shortcuts', () => {
  test('handles Ctrl+X Shift+R refresh in standard search mode', () => {
    const ctx = createContext()
    const key: KeyboardInput = { name: 'r', shift: true }

    handleSearchMode(key, ctx, 'standard')

    expect(ctx.refreshList).toHaveBeenCalledTimes(1)
    expect(ctx.showToast).not.toHaveBeenCalled()
    expect(ctx.setPrefixActive).toHaveBeenCalledWith(false)
  })

  test('opens command palette from normal mode with Ctrl+P', () => {
    const ctx = createContext({
      appMode: AppMode.Normal,
      prefixActive: false,
    })

    handleNormalMode({ name: 'p', ctrl: true }, ctx, 'standard')

    expect(ctx.openCommandsModal).toHaveBeenCalledTimes(1)
  })

  test('activates configured prefix in standard normal mode', () => {
    const ctx = createContext({
      appMode: AppMode.Normal,
      prefixActive: false,
      prefixKey: 'ctrl+x',
    })

    handleNormalMode({ name: 'x', ctrl: true }, ctx, 'standard')

    expect(ctx.setPrefixActive).toHaveBeenCalledWith(true)
  })

  test('quick-select in normal mode ignores agent sessions', () => {
    const regular = createItem({ title: 'regular-1' })
    const opencode = createItem({ title: 'opencode-1' })
    const secondRegular = createItem({ title: 'regular-2' })

    const ctx = createContext({
      appMode: AppMode.Normal,
      prefixActive: false,
      viewMode: ViewMode.Sessions,
      items: [regular, opencode, secondRegular],
      regularSessions: [regular, secondRegular],
    })

    handleNormalMode({ name: '2' }, ctx, 'vim')

    expect(ctx.handleSelect).toHaveBeenCalledWith(secondRegular)
  })

  test('toggles pinned session from normal mode with Ctrl+F', () => {
    const ctx = createContext({
      appMode: AppMode.Normal,
      prefixActive: false,
      viewMode: ViewMode.Sessions,
    })

    handleNormalMode({ name: 'f', ctrl: true }, ctx, 'vim')

    expect(ctx.togglePinnedSession).toHaveBeenCalledWith('session-1')
  })

  test('enters agents manage mode from standard search prefix action', () => {
    const opencode = createItem({ title: 'opencode-main' })

    const ctx = createContext({
      prefixActive: true,
      agentSessions: [opencode],
      setAppMode: mock(() => {}),
      setAgentCursor: mock(() => 0),
    })

    handleSearchMode({ name: 'o' }, ctx, 'standard')

    expect(ctx.setAppMode).toHaveBeenCalledWith(AppMode.AgentsManage)
    expect(ctx.setAgentCursor).toHaveBeenCalledWith(0)
  })

  test('opens the selected Herdr workspace from agents mode', () => {
    const herdrAgent = createItem({
      title: 'api',
      itemKind: 'herdr',
      agentStatus: 'working',
    })

    const ctx = createContext({
      appMode: AppMode.AgentsManage,
      prefixActive: false,
      agentSessions: [herdrAgent],
    })

    handleAgentsManageMode({ name: 'return' }, ctx, 'vim')

    expect(ctx.handleSelect).toHaveBeenCalledWith(herdrAgent)
  })

  test('does not kill or rename a targeted Herdr agent tab', () => {
    const herdrAgent = {
      ...createItem({ title: 'opencode-api', itemKind: 'herdr', agentStatus: 'working' }),
      backend: 'herdr' as const,
      sessionId: 'agents',
      target: { kind: 'agent' as const, tabId: 'agents:t1', paneId: 'agents:p1' },
    }

    const directCtx = createContext({
      appMode: AppMode.AgentsManage,
      prefixActive: false,
      agentSessions: [herdrAgent],
    })

    const prefixCtx = createContext({
      appMode: AppMode.AgentsManage,
      prefixActive: true,
      agentSessions: [herdrAgent],
    })

    // Rename has no direct key in Agents; vim reaches it through the prefix, like standard.
    handleAgentsManageMode({ name: 'd' }, directCtx, 'vim')
    handleAgentsManageMode({ name: 'r' }, prefixCtx, 'vim')
    handleAgentsManageMode({ name: 'd' }, prefixCtx, 'standard')
    handleAgentsManageMode({ name: 'r' }, prefixCtx, 'standard')

    expect(directCtx.requestKillSession).not.toHaveBeenCalled()
    expect(prefixCtx.requestKillSession).not.toHaveBeenCalled()
    expect(prefixCtx.openRenameModal).not.toHaveBeenCalled()

    expect(directCtx.showToast).toHaveBeenCalledWith({
      kind: 'warning',
      message: 'Close session unavailable: Close it in Herdr',
    })
    expect(prefixCtx.showToast).toHaveBeenCalledWith({
      kind: 'warning',
      message: 'Close session unavailable: Close it in Herdr',
    })
    expect(prefixCtx.showToast).toHaveBeenCalledWith({
      kind: 'warning',
      message: 'Rename session unavailable: Rename it in Herdr',
    })
    expect(prefixCtx.showToast).toHaveBeenCalledTimes(3)
  })

  test('selects highlighted search result with Enter', () => {
    const first = createItem({ title: 'first' })
    const second = createItem({ title: 'second' })

    const ctx = createContext({
      prefixActive: false,
      items: [first, second],
      cursor: 1,
    })

    handleSearchMode({ name: 'return' }, ctx, 'vim')

    expect(ctx.handleSelect).toHaveBeenCalledWith(second)
  })

  test.each([
    ['vim normal', 'vim', AppMode.Normal],
    ['standard normal', 'standard', AppMode.Normal],
    ['vim search', 'vim', AppMode.Search],
    ['standard search', 'standard', AppMode.Search],
  ] as const)('%s: Enter on a Projects row runs the frozen launch plan', (_, mode, appMode) => {
    const project = createItem({ title: 'api', isSession: false, itemKind: 'project' })

    const ctx = createContext({
      appMode,
      viewMode: ViewMode.Projects,
      prefixActive: false,
      items: [project],
    })

    if (appMode === AppMode.Normal) handleNormalMode({ name: 'return' }, ctx, mode)
    else handleSearchMode({ name: 'return' }, ctx, mode)

    expect(ctx.launchPlanned).toHaveBeenCalledTimes(1)
    expect(ctx.handleSelect).not.toHaveBeenCalled()
  })

  test('Enter on an empty Projects view launches nothing', () => {
    const ctx = createContext({
      appMode: AppMode.Normal,
      viewMode: ViewMode.Projects,
      prefixActive: false,
      items: [],
    })

    handleNormalMode({ name: 'return' }, ctx, 'vim')

    expect(ctx.launchPlanned).not.toHaveBeenCalled()
    expect(ctx.handleSelect).not.toHaveBeenCalled()
  })

  test('a number key in Projects highlights that row and runs its own plan', () => {
    const api = createItem({ title: 'api', isSession: false, itemKind: 'project' })
    const beta = createItem({ title: 'beta', isSession: false, itemKind: 'project' })

    const ctx = createContext({
      appMode: AppMode.Normal,
      viewMode: ViewMode.Projects,
      prefixActive: false,
      items: [api, beta],
    })

    handleNormalMode({ name: '2' }, ctx, 'vim')

    expect(ctx.setCursor).toHaveBeenCalledWith(1)
    expect(ctx.launchProjectRow).toHaveBeenCalledWith(beta)
    expect(ctx.launchPlanned).not.toHaveBeenCalled()
    expect(ctx.handleSelect).not.toHaveBeenCalled()
  })

  test('a number key on the highlighted Projects row runs the plan the screen shows', () => {
    const api = createItem({ title: 'api', isSession: false, itemKind: 'project' })

    const ctx = createContext({
      appMode: AppMode.Normal,
      viewMode: ViewMode.Projects,
      prefixActive: false,
      items: [api],
    })

    handleNormalMode({ name: '1' }, ctx, 'vim')
    handleNormalMode({ name: '3' }, ctx, 'vim')

    expect(ctx.launchPlanned).toHaveBeenCalledTimes(1)
    expect(ctx.launchProjectRow).not.toHaveBeenCalled()
    expect(ctx.handleSelect).not.toHaveBeenCalled()
  })

  test('Enter in the Sessions view still opens the selected session directly', () => {
    const ctx = createContext({ appMode: AppMode.Normal, prefixActive: false })

    handleNormalMode({ name: 'return' }, ctx, 'vim')

    expect(ctx.handleSelect).toHaveBeenCalledWith(ctx.regularSessions[0])
    expect(ctx.launchPlanned).not.toHaveBeenCalled()
  })
})
