import type { TextareaRenderable } from '@opentui/core'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { AppMode, ViewMode, KeybindMode, type Config, type Item, type OpencodeSessionStats } from '../types'
import { requestShutdown } from '../util/shutdown'

export interface KeyboardInput {
  name?: string
  ctrl?: boolean
  shift?: boolean
}

export interface KeyboardHandlerContext {
  appMode: AppMode
  viewMode: ViewMode
  items: Item[]
  regularSessions: Item[]
  opencodeSessions: Item[]
  cursor: number
  opencodeCursor: number
  searchQuery: string
  renameTarget: string
  prefixKey?: string
  projectItems: Item[]
  sessionItems: Item[]
  prefixActive: boolean
  prefixTimeoutRef: MutableRefObject<NodeJS.Timeout | null>
  textareaRef: MutableRefObject<TextareaRenderable | null>

  setAppMode: (mode: AppMode) => void
  setViewMode: (mode: ViewMode) => void
  setCursor: Dispatch<SetStateAction<number>>
  setOpencodeCursor: Dispatch<SetStateAction<number>>
  setSearchQuery: (query: string) => void
  setRenameTarget: (target: string) => void
  setAllItems: Dispatch<SetStateAction<Item[]>>
  setItems: Dispatch<SetStateAction<Item[]>>
  setPrefixActive: (active: boolean) => void

  refreshItems: (forceViewMode?: ViewMode, nextConfig?: Config) => Promise<void>
  requestKillSession: (sessionName: string) => void
  clearPendingKill: () => void
  handleSelect: (item: Item) => Promise<void>
  handleKillSession: (sessionName: string) => Promise<void>
  handleLastSession: () => Promise<void>
  handleRootSession: (item?: Item) => Promise<void>
  handleEditTarget: (item?: Item) => Promise<void>
  openRenameModal: (sessionName: string) => void
  openCommandsModal: () => void
  openSettingsModal: () => void
  loadOpencodeStatsForSession: (sessionName: string) => Promise<OpencodeSessionStats | null>
  setMessage: (message: string) => void
}

function getKeyName(key: KeyboardInput): string {
  return key.name ?? ''
}

function matchesPrefixKey(key: KeyboardInput, prefixKey = 'ctrl+x'): boolean {
  const parts = prefixKey.toLowerCase().split('+')
  const keyPart = parts.at(-1) ?? prefixKey.toLowerCase()
  const expectsCtrl = parts.includes('ctrl')
  const expectsShift = parts.includes('shift')

  return Boolean(key.ctrl) === expectsCtrl && Boolean(key.shift) === expectsShift && getKeyName(key).toLowerCase() === keyPart
}

export function handleNormalMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  // Standard mode requires Ctrl for most actions
  const isStandard = keybindMode === 'standard'

  if (ctx.prefixActive) {
    if (ctx.prefixTimeoutRef.current) {
      clearTimeout(ctx.prefixTimeoutRef.current)
      ctx.prefixTimeoutRef.current = null
    }
    ctx.setPrefixActive(false)

    if (key.shift && keyName.toLowerCase() === 'r') {
      ctx.clearPendingKill()
      ctx.refreshItems()
      ctx.setMessage('Refreshed')
      setTimeout(() => ctx.setMessage(''), 2000)
      return
    }

    switch (keyName) {
      case 'l':
        ctx.clearPendingKill()
        void ctx.handleLastSession()
        return
      case 'g': {
        ctx.clearPendingKill()
        const selectedItem =
          ctx.viewMode === ViewMode.Sessions ? ctx.regularSessions[ctx.cursor] : ctx.items[ctx.cursor]
        void ctx.handleRootSession(selectedItem)
        return
      }
      case 'e': {
        ctx.clearPendingKill()
        const selectedItem =
          ctx.viewMode === ViewMode.Sessions ? ctx.regularSessions[ctx.cursor] : ctx.items[ctx.cursor]
        if (selectedItem?.itemKind === 'configured') {
          void ctx.handleEditTarget(selectedItem)
        }
        return
      }
      case 'd':
        if (ctx.viewMode === ViewMode.Sessions && ctx.regularSessions[ctx.cursor]?.isSession) {
          ctx.requestKillSession(ctx.regularSessions[ctx.cursor].title)
        }
        return
      case 'r':
        if (ctx.viewMode === ViewMode.Sessions && ctx.regularSessions[ctx.cursor]?.isSession) {
          ctx.clearPendingKill()
          ctx.openRenameModal(ctx.regularSessions[ctx.cursor].title)
        }
        return
      case 's':
        ctx.clearPendingKill()
        ctx.setViewMode(ViewMode.Sessions)
        ctx.refreshItems(ViewMode.Sessions)
        return
      case 'p':
        ctx.clearPendingKill()
        ctx.setViewMode(ViewMode.Projects)
        ctx.refreshItems(ViewMode.Projects)
        return
    }

    return
  }

  if (ctx.prefixKey && matchesPrefixKey(key, ctx.prefixKey)) {
    ctx.setPrefixActive(true)
    const timeout = setTimeout(() => {
      ctx.setPrefixActive(false)
    }, 2000)
    ctx.prefixTimeoutRef.current = timeout
    return
  }

  // Handle quit (q for vim, Ctrl+Q or Escape for standard)
  if (
    (isStandard && ((key.ctrl && keyName === 'q') || keyName === 'escape')) ||
    (!isStandard && (keyName === 'q' || keyName === 'escape'))
  ) {
    void requestShutdown(0)
    return
  }

  // Handle search mode (i for vim, Ctrl+I for standard)
  if (!isStandard && keyName === 'i') {
    ctx.clearPendingKill()
    ctx.setAppMode(AppMode.Search)
    ctx.setSearchQuery('')
    return
  }

  // Handle new session (n for vim, Ctrl+N for standard)
  if (!isStandard && keyName === 'n') {
    ctx.clearPendingKill()
    ctx.setAppMode(AppMode.NewSession)
    if (ctx.viewMode === ViewMode.Sessions) {
    }
    ctx.setViewMode(ViewMode.Projects)
    ctx.setAllItems(ctx.projectItems)
    ctx.setItems(ctx.projectItems)
    ctx.setCursor(Math.max(0, ctx.projectItems.length - 1))
    ctx.setSearchQuery('')
    return
  }

  // Handle opencode mode (o for vim, Ctrl+O for standard)
  if (!isStandard && keyName === 'o') {
    ctx.clearPendingKill()
    if (ctx.viewMode === ViewMode.Sessions && ctx.opencodeSessions.length > 0) {
      ctx.setAppMode(AppMode.OpencodeManage)
      ctx.setOpencodeCursor(0)
      ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[0].title)
    }
    return
  }

  if (key.ctrl && keyName === 'p') {
    ctx.clearPendingKill()
    ctx.openCommandsModal()
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'l') {
    ctx.clearPendingKill()
    void ctx.handleLastSession()
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'g') {
    ctx.clearPendingKill()
    const selectedItem =
      ctx.viewMode === ViewMode.Sessions ? ctx.regularSessions[ctx.cursor] : ctx.items[ctx.cursor]
    void ctx.handleRootSession(selectedItem)
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'e') {
    ctx.clearPendingKill()
    const selectedItem = ctx.viewMode === ViewMode.Sessions ? ctx.regularSessions[ctx.cursor] : ctx.items[ctx.cursor]
    if (selectedItem?.itemKind === 'configured') {
      void ctx.handleEditTarget(selectedItem)
    }
    return
  }

  // Handle delete/kill (d for vim, Ctrl+D for standard)
  if (!isStandard && keyName === 'd') {
    if (ctx.viewMode === ViewMode.Sessions && ctx.regularSessions[ctx.cursor]?.isSession) {
      ctx.requestKillSession(ctx.regularSessions[ctx.cursor].title)
    }
    return
  }

  // Handle rename (r for vim, Ctrl+R for standard)
  if (
    !ctx.prefixKey && !isStandard && keyName === 'r'
  ) {
    if (ctx.viewMode === ViewMode.Sessions && ctx.regularSessions[ctx.cursor]?.isSession) {
      ctx.clearPendingKill()
      ctx.openRenameModal(ctx.regularSessions[ctx.cursor].title)
    }
    return
  }

  // Handle refresh (R for vim, Ctrl+Shift+R for standard)
  if (
    !ctx.prefixKey && !isStandard && keyName === 'R'
  ) {
    ctx.clearPendingKill()
    ctx.refreshItems()
    ctx.setMessage('Refreshed')
    setTimeout(() => ctx.setMessage(''), 2000)
    return
  }

  // Handle view mode switches (vim only)
  if (!isStandard) {
    if (keyName === 's') {
      ctx.clearPendingKill()
      ctx.setViewMode(ViewMode.Sessions)
      ctx.refreshItems(ViewMode.Sessions)
      return
    }
    if (keyName === 'p') {
      ctx.clearPendingKill()
      ctx.setViewMode(ViewMode.Projects)
      ctx.refreshItems(ViewMode.Projects)
      return
    }
  }

  // Handle navigation
  if (keyName === 'down' || (!isStandard && keyName === 'j')) {
    ctx.clearPendingKill()
    if (ctx.viewMode === ViewMode.Sessions) {
      ctx.setCursor(c => Math.min(c + 1, ctx.regularSessions.length - 1))
    } else {
      ctx.setCursor(c => Math.min(c + 1, ctx.items.length - 1))
    }
    return
  }

  if (keyName === 'up' || (!isStandard && keyName === 'k')) {
    ctx.clearPendingKill()
    ctx.setCursor(c => Math.max(c - 1, 0))
    return
  }

  // Handle selection
  if (keyName === 'return') {
    ctx.clearPendingKill()
    if (ctx.regularSessions[ctx.cursor]) {
      ctx.handleSelect(ctx.regularSessions[ctx.cursor])
    }
    return
  }

  // Handle number shortcuts (vim only)
  if (!isStandard && keyName >= '1' && keyName <= '9') {
    ctx.clearPendingKill()
    const num = parseInt(keyName, 10) - 1
    if (num >= 0 && num < ctx.regularSessions.length) {
      ctx.handleSelect(ctx.regularSessions[num])
    }
  }
}

export function handleOpencodeManageMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'

  if (key.ctrl && keyName === 'p') {
    ctx.clearPendingKill()
    ctx.openCommandsModal()
    return
  }

  if (ctx.prefixActive) {
    if (ctx.prefixTimeoutRef.current) {
      clearTimeout(ctx.prefixTimeoutRef.current)
      ctx.prefixTimeoutRef.current = null
    }
    ctx.setPrefixActive(false)

    switch (keyName) {
      case 'o':
        ctx.clearPendingKill()
        ctx.setAppMode(AppMode.Normal)
        return
      case 'd':
        if (ctx.opencodeSessions[ctx.opencodeCursor]) {
          ctx.requestKillSession(ctx.opencodeSessions[ctx.opencodeCursor].title)
        }
        return
      case 'r':
        if (ctx.opencodeSessions[ctx.opencodeCursor]) {
          ctx.clearPendingKill()
          ctx.openRenameModal(ctx.opencodeSessions[ctx.opencodeCursor].title)
        }
        return
    }

    return
  }

  if (ctx.prefixKey && matchesPrefixKey(key, ctx.prefixKey)) {
    ctx.setPrefixActive(true)
    const timeout = setTimeout(() => {
      ctx.setPrefixActive(false)
    }, 2000)
    ctx.prefixTimeoutRef.current = timeout
    return
  }

  // Handle back/exit (o/Esc for vim, Ctrl+O/Esc for standard)
  if (
    keyName === 'escape' ||
    (!ctx.prefixKey && !isStandard && keyName === 'o')
  ) {
    ctx.clearPendingKill()
    ctx.setAppMode(AppMode.Normal)
    return
  }

  // Handle navigation down
  if (keyName === 'down' || (!isStandard && keyName === 'j')) {
    ctx.clearPendingKill()
    ctx.setOpencodeCursor(c => {
      const newCursor = Math.min(c + 1, ctx.opencodeSessions.length - 1)
      if (newCursor !== c && ctx.opencodeSessions[newCursor]) {
        ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[newCursor].title)
      }
      return newCursor
    })
    return
  }

  // Handle navigation up
  if (keyName === 'up' || (!isStandard && keyName === 'k')) {
    ctx.clearPendingKill()
    ctx.setOpencodeCursor(c => {
      const newCursor = Math.max(c - 1, 0)
      if (newCursor !== c && ctx.opencodeSessions[newCursor]) {
        ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[newCursor].title)
      }
      return newCursor
    })
    return
  }

  // Handle delete/kill (d for vim, Ctrl+D for standard)
  if (!isStandard && keyName === 'd') {
    if (ctx.opencodeSessions[ctx.opencodeCursor]) {
      ctx.requestKillSession(ctx.opencodeSessions[ctx.opencodeCursor].title)
    }
    return
  }

  // Handle rename (r for vim, Ctrl+R for standard)
  if (!ctx.prefixKey && !isStandard && keyName === 'r') {
    if (ctx.opencodeSessions[ctx.opencodeCursor]) {
      ctx.clearPendingKill()
      ctx.openRenameModal(ctx.opencodeSessions[ctx.opencodeCursor].title)
    }
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === ',') {
    ctx.clearPendingKill()
    ctx.openSettingsModal()
    return
  }
}

export function handleSearchMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'

  // Standard mode: Prefix key system with Ctrl+X
  if (isStandard) {
    // If prefix is active, handle single-letter commands
    if (ctx.prefixActive) {
      // Clear prefix timeout
      if (ctx.prefixTimeoutRef.current) {
        clearTimeout(ctx.prefixTimeoutRef.current)
        ctx.prefixTimeoutRef.current = null
      }
      ctx.setPrefixActive(false)

      switch (keyName) {
        case 'd': // Ctrl+X d - delete/kill
          if (ctx.viewMode === ViewMode.Sessions && ctx.items[ctx.cursor]?.isSession) {
            ctx.requestKillSession(ctx.items[ctx.cursor].title)
          }
          return
        case 'n': // Ctrl+X n - new session
          ctx.clearPendingKill()
          ctx.setSearchQuery('')
          ctx.setAppMode(AppMode.NewSession)
          ctx.setViewMode(ViewMode.Projects)
          ctx.setAllItems(ctx.projectItems)
          ctx.setItems(ctx.projectItems)
          ctx.setCursor(Math.max(0, ctx.projectItems.length - 1))
          return
        case 'o': // Ctrl+X o - opencode
          ctx.clearPendingKill()
          if (ctx.viewMode === ViewMode.Sessions && ctx.opencodeSessions.length > 0) {
            ctx.setAppMode(AppMode.OpencodeManage)
            ctx.setOpencodeCursor(0)
            ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[0].title)
          }
          return
        case 's':
          ctx.clearPendingKill()
          ctx.openSettingsModal()
          return
        case 'l': // Ctrl+X l - last session
          ctx.clearPendingKill()
          void ctx.handleLastSession()
          return
        case 'g': { // Ctrl+X g - root session
          ctx.clearPendingKill()
          const selectedItem = ctx.viewMode === ViewMode.Sessions ? ctx.items[ctx.cursor] : ctx.items[ctx.cursor]
          void ctx.handleRootSession(selectedItem)
          return
        }
        case 'r':
          if (key.shift) {
            ctx.refreshItems()
            ctx.setMessage('Refreshed')
            setTimeout(() => ctx.setMessage(''), 2000)
            return
          }

          if (ctx.viewMode === ViewMode.Sessions && ctx.items[ctx.cursor]?.isSession) {
            ctx.clearPendingKill()
            ctx.openRenameModal(ctx.items[ctx.cursor].title)
          }
          return
        default:
          // Not a valid prefix command, ignore
          return
      }
    }

    // Handle Ctrl+X prefix activation
    if (matchesPrefixKey(key, ctx.prefixKey)) {
      ctx.setPrefixActive(true)

      // Clear prefix after 2 seconds if no key pressed
      const timeout = setTimeout(() => {
        ctx.setPrefixActive(false)
      }, 2000)
      ctx.prefixTimeoutRef.current = timeout
      return
    }

    // Ctrl+Q to quit (immediate, no prefix needed)
    if (key.ctrl && keyName === 'q') {
      void requestShutdown(0)
      return
    }
  }

  // Handle Esc differently based on mode
  if (keyName === 'escape') {
    ctx.clearPendingKill()
    if (isStandard) {
      // Standard mode: just clear search, stay in search mode
      ctx.setSearchQuery('')
      ctx.setCursor(0)
    } else {
      // Vim mode: exit to normal mode
      ctx.setAppMode(AppMode.Normal)
      ctx.setSearchQuery('')
      ctx.setCursor(0)
    }
    return
  }

  switch (keyName) {
    case 'return':
      ctx.clearPendingKill()
      if (ctx.items.length > 0) {
        ctx.handleSelect(ctx.items[0])
      }
      break
    case 'down':
      ctx.clearPendingKill()
      ctx.setCursor(c => Math.min(c + 1, ctx.items.length - 1))
      break
    case 'up':
      ctx.clearPendingKill()
      ctx.setCursor(c => Math.max(c - 1, 0))
      break
  }
}

export function handleNewSessionMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'

  // Handle Ctrl keybinds in standard mode
  if (isStandard && key.ctrl) {
    // Ctrl+I to switch to search mode
    if (keyName === 'i') {
      ctx.clearPendingKill()
      ctx.setAppMode(AppMode.Search)
      ctx.setViewMode(ViewMode.Sessions)
      ctx.setAllItems(ctx.sessionItems)
      ctx.setItems(ctx.sessionItems)
      ctx.setSearchQuery('')
      return
    }

    // Ctrl+D to delete session (if on sessions view)
      if (keyName === 'd' && ctx.items[ctx.cursor]?.isSession) {
      ctx.requestKillSession(ctx.items[ctx.cursor].title)
      return
    }
  }

  // Handle Esc differently based on mode
  if (keyName === 'escape') {
    ctx.clearPendingKill()
    if (isStandard) {
      // Standard mode: return to search mode (always in insert mode)
      ctx.setAppMode(AppMode.Search)
      ctx.setViewMode(ViewMode.Sessions)
      ctx.setSearchQuery('')
      ctx.setCursor(0)
      // Reload sessions to restore the list
      ctx.refreshItems(ViewMode.Sessions)
    } else {
      // Vim mode: return to normal mode
      ctx.setAppMode(AppMode.Normal)
      ctx.setViewMode(ViewMode.Sessions)
      ctx.setSearchQuery('')
      ctx.setCursor(0)
    }
    return
  }

  switch (keyName) {
    case 'return':
      break
    case 'down':
      ctx.clearPendingKill()
      ctx.setCursor(c => Math.min(c + 1, ctx.items.length - 1))
      break
    case 'up':
      ctx.clearPendingKill()
      ctx.setCursor(c => Math.max(c - 1, 0))
      break
  }
}

export function handleRenameMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'

  // Handle Ctrl keybinds in standard mode
  if (isStandard && key.ctrl) {
    // Ctrl+I to switch to search mode
    if (keyName === 'i') {
      ctx.clearPendingKill()
      ctx.setAppMode(AppMode.Search)
      ctx.setSearchQuery('')
      ctx.setRenameTarget('')
      return
    }

    // Ctrl+D to delete the rename target session
      if (keyName === 'd' && ctx.renameTarget) {
      ctx.requestKillSession(ctx.renameTarget)
      ctx.setAppMode(AppMode.Search)
      ctx.setSearchQuery('')
      ctx.setRenameTarget('')
      return
    }
  }

  // Handle Esc differently based on mode
  if (keyName === 'escape') {
    ctx.clearPendingKill()
    if (isStandard) {
      // Standard mode: return to search mode (always in insert mode)
      ctx.setAppMode(AppMode.Search)
      ctx.setSearchQuery('')
      ctx.setRenameTarget('')
      // Reload sessions to restore the list
      ctx.refreshItems(ViewMode.Sessions)
    } else {
      // Vim mode: return to normal mode
      ctx.setAppMode(AppMode.Normal)
      ctx.setSearchQuery('')
      ctx.setRenameTarget('')
    }
    return
  }

  switch (keyName) {
    case 'return':
      break
  }
}
