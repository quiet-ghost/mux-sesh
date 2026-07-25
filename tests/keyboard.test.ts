import { describe, expect, mock, test } from 'bun:test'
import {
  handleNormalMode,
  handleAgentsManageMode,
  handleSearchMode,
  type KeyboardHandlerContext,
  type KeyboardInput,
} from '../src/handlers/keyboard'
import { AppMode, ViewMode, type Item } from '../src/types'

function createItem(overrides: Partial<Item> = {}): Item {
  return {
    title: 'session-1',
    desc: '',
    path: '/tmp/session-1',
    isSession: true,
    ...overrides,
  }
}

function createContext(overrides: Partial<KeyboardHandlerContext> = {}): KeyboardHandlerContext {
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
    projectItems: [],
    sessionItems: items,
    prefixActive: true,
    prefixTimeoutRef: { current: null },
    setAppMode: mock(() => {}),
    setViewMode: mock(() => {}),
    setCursor: mock(() => 0),
    setAgentCursor: mock(() => 0),
    setSearchQuery: mock(() => {}),
    setAllItems: mock(() => items),
    setItems: mock(() => items),
    setPrefixActive: mock(() => {}),
    refreshItems: mock(async () => {}),
    requestKillSession: mock(() => {}),
    togglePinnedSession: mock(async () => {}),
    clearPendingKill: mock(() => {}),
    handleSelect: mock(async () => {}),
    handleKillSession: mock(async () => {}),
    handleLastSession: mock(async () => {}),
    handleRootSession: mock(async () => {}),
    handleEditTarget: mock(async () => {}),
    openRenameModal: mock(() => {}),
    openCommandsModal: mock(() => {}),
    openSettingsModal: mock(() => {}),
    loadOpencodeStatsForSession: mock(async () => null),
    setMessage: mock(() => {}),
    ...overrides,
  }
}

describe('keyboard shortcuts', () => {
  test('handles Ctrl+X Shift+R refresh in standard search mode', () => {
    const ctx = createContext()
    const key: KeyboardInput = { name: 'r', shift: true }

    handleSearchMode(key, ctx, 'standard')

    expect(ctx.refreshItems).toHaveBeenCalledTimes(1)
    expect(ctx.setMessage).toHaveBeenCalledWith('Refreshed')
    expect(ctx.setPrefixActive).toHaveBeenCalledWith(false)
  })

  test('opens command palette from normal mode with Ctrl+P', () => {
    const ctx = createContext({
      appMode: AppMode.Normal,
      prefixActive: false,
    })

    handleNormalMode({ name: 'p', ctrl: true }, ctx, 'standard')

    expect(ctx.clearPendingKill).toHaveBeenCalledTimes(1)
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

    expect(ctx.clearPendingKill).toHaveBeenCalledTimes(1)
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
    expect(ctx.loadOpencodeStatsForSession).toHaveBeenCalledWith('opencode-main')
  })

  test('enters agents manage mode for pi without loading OpenCode stats', () => {
    const pi = createItem({ title: 'pi-main' })
    const ctx = createContext({
      prefixActive: true,
      agentSessions: [pi],
      setAppMode: mock(() => {}),
      setAgentCursor: mock(() => 0),
    })

    handleSearchMode({ name: 'o' }, ctx, 'standard')

    expect(ctx.setAppMode).toHaveBeenCalledWith(AppMode.AgentsManage)
    expect(ctx.setAgentCursor).toHaveBeenCalledWith(0)
    expect(ctx.loadOpencodeStatsForSession).not.toHaveBeenCalled()
  })

  test('does not load tmux OpenCode stats for a Herdr agent workspace', () => {
    const herdrAgent = createItem({
      title: 'opencode-main',
      itemKind: 'herdr',
      agentStatus: 'working',
    })
    const ctx = createContext({
      prefixActive: true,
      agentSessions: [herdrAgent],
    })

    handleSearchMode({ name: 'o' }, ctx, 'standard')

    expect(ctx.loadOpencodeStatsForSession).not.toHaveBeenCalled()
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

  test('opens settings from agents mode with comma in vim mode', () => {
    const ctx = createContext({
      appMode: AppMode.AgentsManage,
      prefixActive: false,
    })

    handleAgentsManageMode({ name: ',' }, ctx, 'vim')

    expect(ctx.clearPendingKill).toHaveBeenCalledTimes(1)
    expect(ctx.openSettingsModal).toHaveBeenCalledTimes(1)
  })
})
