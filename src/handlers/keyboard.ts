import type { TextareaRenderable } from '@opentui/core'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { AppMode, ViewMode, KeybindMode, type Item, type OpencodeSessionStats } from '../types'
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

  refreshItems: (forceViewMode?: ViewMode) => Promise<void>
  handleSelect: (item: Item) => Promise<void>
  handleKillSession: (sessionName: string) => Promise<void>
  handleLastSession: () => Promise<void>
  handleRootSession: (item?: Item) => Promise<void>
  loadOpencodeStatsForSession: (sessionName: string) => Promise<OpencodeSessionStats | null>
  setMessage: (message: string) => void
}

function getKeyName(key: KeyboardInput): string {
  return key.name ?? ''
}

export function handleNormalMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  // Standard mode requires Ctrl for most actions
  const isStandard = keybindMode === 'standard'

  // Handle quit (q for vim, Ctrl+Q or Escape for standard)
  if (
    (isStandard && ((key.ctrl && keyName === 'q') || keyName === 'escape')) ||
    (!isStandard && (keyName === 'q' || keyName === 'escape'))
  ) {
    void requestShutdown(0)
    return
  }

  // Handle search mode (i for vim, Ctrl+I for standard)
  if ((!isStandard && keyName === 'i') || (isStandard && key.ctrl && keyName === 'i')) {
    ctx.setAppMode(AppMode.Search)
    ctx.setSearchQuery('')
    return
  }

  // Handle new session (n for vim, Ctrl+N for standard)
  if ((!isStandard && keyName === 'n') || (isStandard && key.ctrl && keyName === 'n')) {
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
  if ((!isStandard && keyName === 'o') || (isStandard && key.ctrl && keyName === 'o')) {
    if (ctx.viewMode === ViewMode.Sessions && ctx.opencodeSessions.length > 0) {
      ctx.setAppMode(AppMode.OpencodeManage)
      ctx.setOpencodeCursor(0)
      ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[0].title)
    }
    return
  }

  if ((!isStandard && keyName === 'l') || (isStandard && key.ctrl && keyName === 'l')) {
    void ctx.handleLastSession()
    return
  }

  if ((!isStandard && keyName === 'g') || (isStandard && key.ctrl && keyName === 'g')) {
    const selectedItem =
      ctx.viewMode === ViewMode.Sessions ? ctx.regularSessions[ctx.cursor] : ctx.items[ctx.cursor]
    void ctx.handleRootSession(selectedItem)
    return
  }

  // Handle delete/kill (d for vim, Ctrl+D for standard)
  if ((!isStandard && keyName === 'd') || (isStandard && key.ctrl && keyName === 'd')) {
    if (ctx.viewMode === ViewMode.Sessions && ctx.regularSessions[ctx.cursor]?.isSession) {
      ctx.handleKillSession(ctx.regularSessions[ctx.cursor].title)
    }
    return
  }

  // Handle rename (r for vim, Ctrl+R for standard)
  if (
    (!isStandard && keyName === 'r') ||
    (isStandard && key.ctrl && keyName === 'r' && !key.shift)
  ) {
    if (ctx.viewMode === ViewMode.Sessions && ctx.regularSessions[ctx.cursor]?.isSession) {
      ctx.setAppMode(AppMode.Rename)
      ctx.setRenameTarget(ctx.regularSessions[ctx.cursor].title)
      ctx.setSearchQuery(ctx.regularSessions[ctx.cursor].title)
    }
    return
  }

  // Handle refresh (R for vim, Ctrl+Shift+R for standard)
  if (
    (!isStandard && keyName === 'R') ||
    (isStandard && key.ctrl && key.shift && keyName === 'r')
  ) {
    ctx.refreshItems()
    ctx.setMessage('Refreshed')
    setTimeout(() => ctx.setMessage(''), 2000)
    return
  }

  // Handle view mode switches (vim only)
  if (!isStandard) {
    if (keyName === 's') {
      ctx.setViewMode(ViewMode.Sessions)
      ctx.refreshItems(ViewMode.Sessions)
      return
    }
    if (keyName === 'p') {
      ctx.setViewMode(ViewMode.Projects)
      ctx.refreshItems(ViewMode.Projects)
      return
    }
  }

  // Handle navigation
  if (keyName === 'down' || (!isStandard && keyName === 'j')) {
    if (ctx.viewMode === ViewMode.Sessions) {
      ctx.setCursor(c => Math.min(c + 1, ctx.regularSessions.length - 1))
    } else {
      ctx.setCursor(c => Math.min(c + 1, ctx.items.length - 1))
    }
    return
  }

  if (keyName === 'up' || (!isStandard && keyName === 'k')) {
    ctx.setCursor(c => Math.max(c - 1, 0))
    return
  }

  // Handle selection
  if (keyName === 'return') {
    if (ctx.regularSessions[ctx.cursor]) {
      ctx.handleSelect(ctx.regularSessions[ctx.cursor])
    }
    return
  }

  // Handle number shortcuts (vim only)
  if (!isStandard && keyName >= '1' && keyName <= '9') {
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

  // Handle back/exit (o/Esc for vim, Ctrl+O/Esc for standard)
  if (
    keyName === 'escape' ||
    (!isStandard && keyName === 'o') ||
    (isStandard && key.ctrl && keyName === 'o')
  ) {
    ctx.setAppMode(AppMode.Normal)
    return
  }

  // Handle navigation down
  if (keyName === 'down' || (!isStandard && keyName === 'j')) {
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
  if ((!isStandard && keyName === 'd') || (isStandard && key.ctrl && keyName === 'd')) {
    if (ctx.opencodeSessions[ctx.opencodeCursor]) {
      ctx.handleKillSession(ctx.opencodeSessions[ctx.opencodeCursor].title)
    }
    return
  }

  // Handle rename (r for vim, Ctrl+R for standard)
  if ((!isStandard && keyName === 'r') || (isStandard && key.ctrl && keyName === 'r')) {
    if (ctx.opencodeSessions[ctx.opencodeCursor]) {
      ctx.setAppMode(AppMode.Rename)
      ctx.setRenameTarget(ctx.opencodeSessions[ctx.opencodeCursor].title)
      ctx.setSearchQuery(ctx.opencodeSessions[ctx.opencodeCursor].title)
    }
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
            ctx.handleKillSession(ctx.items[ctx.cursor].title)
          }
          return
        case 'n': // Ctrl+X n - new session
          ctx.setSearchQuery('')
          ctx.setAppMode(AppMode.NewSession)
          ctx.setViewMode(ViewMode.Projects)
          ctx.setAllItems(ctx.projectItems)
          ctx.setItems(ctx.projectItems)
          ctx.setCursor(Math.max(0, ctx.projectItems.length - 1))
          return
        case 'o': // Ctrl+X o - opencode
          if (ctx.viewMode === ViewMode.Sessions && ctx.opencodeSessions.length > 0) {
            ctx.setAppMode(AppMode.OpencodeManage)
            ctx.setOpencodeCursor(0)
            ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[0].title)
          }
          return
        case 'l': // Ctrl+X l - last session
          void ctx.handleLastSession()
          return
        case 'g': { // Ctrl+X g - root session
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
            ctx.setAppMode(AppMode.Rename)
            ctx.setRenameTarget(ctx.items[ctx.cursor].title)
            ctx.setSearchQuery(ctx.items[ctx.cursor].title)
          }
          return
        default:
          // Not a valid prefix command, ignore
          return
      }
    }

    // Handle Ctrl+X prefix activation
    if (key.ctrl && keyName === 'x') {
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
      if (ctx.items.length > 0) {
        ctx.handleSelect(ctx.items[0])
      }
      break
    case 'down':
      ctx.setCursor(c => Math.min(c + 1, ctx.items.length - 1))
      break
    case 'up':
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
      ctx.setAppMode(AppMode.Search)
      ctx.setViewMode(ViewMode.Sessions)
      ctx.setAllItems(ctx.sessionItems)
      ctx.setItems(ctx.sessionItems)
      ctx.setSearchQuery('')
      return
    }

    // Ctrl+D to delete session (if on sessions view)
      if (keyName === 'd' && ctx.items[ctx.cursor]?.isSession) {
      ctx.handleKillSession(ctx.items[ctx.cursor].title)
      return
    }
  }

  // Handle Esc differently based on mode
  if (keyName === 'escape') {
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
      ctx.setCursor(c => Math.min(c + 1, ctx.items.length - 1))
      break
    case 'up':
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
      ctx.setAppMode(AppMode.Search)
      ctx.setSearchQuery('')
      ctx.setRenameTarget('')
      return
    }

    // Ctrl+D to delete the rename target session
      if (keyName === 'd' && ctx.renameTarget) {
      ctx.handleKillSession(ctx.renameTarget)
      ctx.setAppMode(AppMode.Search)
      ctx.setSearchQuery('')
      ctx.setRenameTarget('')
      return
    }
  }

  // Handle Esc differently based on mode
  if (keyName === 'escape') {
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
