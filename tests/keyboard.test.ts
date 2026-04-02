import { describe, expect, mock, test } from 'bun:test'
import {
  handleNormalMode,
  handleOpencodeManageMode,
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
    opencodeSessions: [],
    cursor: 0,
    opencodeCursor: 0,
    searchQuery: '',
    projectItems: [],
    sessionItems: items,
    prefixActive: true,
    prefixTimeoutRef: { current: null },
    setAppMode: mock(() => {}),
    setViewMode: mock(() => {}),
    setCursor: mock(() => 0),
    setOpencodeCursor: mock(() => 0),
    setSearchQuery: mock(() => {}),
    setAllItems: mock(() => items),
    setItems: mock(() => items),
    setPrefixActive: mock(() => {}),
    refreshItems: mock(async () => {}),
    requestKillSession: mock(() => {}),
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

  test('quick-select in normal mode ignores opencode sessions', () => {
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

  test('enters opencode manage mode from standard search prefix action', () => {
    const opencode = createItem({ title: 'opencode-main' })
    const ctx = createContext({
      prefixActive: true,
      opencodeSessions: [opencode],
      setAppMode: mock(() => {}),
      setOpencodeCursor: mock(() => 0),
    })

    handleSearchMode({ name: 'o' }, ctx, 'standard')

    expect(ctx.setAppMode).toHaveBeenCalledWith(AppMode.OpencodeManage)
    expect(ctx.setOpencodeCursor).toHaveBeenCalledWith(0)
    expect(ctx.loadOpencodeStatsForSession).toHaveBeenCalledWith('opencode-main')
  })

  test('opens settings from opencode mode with comma in vim mode', () => {
    const ctx = createContext({
      appMode: AppMode.OpencodeManage,
      prefixActive: false,
    })

    handleOpencodeManageMode({ name: ',' }, ctx, 'vim')

    expect(ctx.clearPendingKill).toHaveBeenCalledTimes(1)
    expect(ctx.openSettingsModal).toHaveBeenCalledTimes(1)
  })
})
