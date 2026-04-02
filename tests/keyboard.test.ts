import { describe, expect, mock, test } from 'bun:test'
import {
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
    setRenameTarget: mock(() => {}),
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
})
