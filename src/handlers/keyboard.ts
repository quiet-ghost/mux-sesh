import { AppMode, ViewMode, KeybindMode } from '../types'

export interface KeyboardHandlerContext {
  appMode: AppMode
  viewMode: ViewMode
  items: any[]
  regularSessions: any[]
  opencodeSessions: any[]
  cursor: number
  opencodeCursor: number
  searchQuery: string
  renameTarget: string
  projectItems: any[]
  sessionItems: any[]
  prefixActive: boolean
  prefixTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
  textareaRef: React.MutableRefObject<any>

  setAppMode: (mode: AppMode) => void
  setViewMode: (mode: ViewMode) => void
  setCursor: (cursor: number | ((prev: number) => number)) => void
  setOpencodeCursor: (cursor: number | ((prev: number) => number)) => void
  setSearchQuery: (query: string) => void
  setRenameTarget: (target: string) => void
  setAllItems: (items: any[]) => void
  setItems: (items: any[]) => void
  setPrefixActive: (active: boolean) => void

  refreshItems: (forceViewMode?: ViewMode) => Promise<void>
  handleSelect: (item: any) => Promise<void>
  handleKillSession: (sessionName: string) => Promise<void>
  loadOpencodeStatsForSession: (sessionName: string) => Promise<any>
  setMessage: (message: string) => void
}

export function handleNormalMode(
  key: any,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  // Standard mode requires Ctrl for most actions
  const isStandard = keybindMode === 'standard'

  // Handle quit (q for vim, Ctrl+Q or Escape for standard)
  if (
    (isStandard && ((key.ctrl && key.name === 'q') || key.name === 'escape')) ||
    (!isStandard && (key.name === 'q' || key.name === 'escape'))
  ) {
    process.exit(0)
  }

  // Handle search mode (i for vim, Ctrl+I for standard)
  if ((!isStandard && key.name === 'i') || (isStandard && key.ctrl && key.name === 'i')) {
    ctx.setAppMode(AppMode.Search)
    ctx.setSearchQuery('')
    return
  }

  // Handle new session (n for vim, Ctrl+N for standard)
  if ((!isStandard && key.name === 'n') || (isStandard && key.ctrl && key.name === 'n')) {
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
  if ((!isStandard && key.name === 'o') || (isStandard && key.ctrl && key.name === 'o')) {
    if (ctx.viewMode === ViewMode.Sessions && ctx.opencodeSessions.length > 0) {
      ctx.setAppMode(AppMode.OpencodeManage)
      ctx.setOpencodeCursor(0)
      ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[0].title)
    }
    return
  }

  // Handle delete/kill (d for vim, Ctrl+D for standard)
  if ((!isStandard && key.name === 'd') || (isStandard && key.ctrl && key.name === 'd')) {
    if (ctx.viewMode === ViewMode.Sessions && ctx.items[ctx.cursor]?.isSession) {
      ctx.handleKillSession(ctx.regularSessions[ctx.cursor].title)
    }
    return
  }

  // Handle rename (r for vim, Ctrl+R for standard)
  if (
    (!isStandard && key.name === 'r') ||
    (isStandard && key.ctrl && key.name === 'r' && !key.shift)
  ) {
    if (ctx.viewMode === ViewMode.Sessions && ctx.items[ctx.cursor]?.isSession) {
      ctx.setAppMode(AppMode.Rename)
      ctx.setRenameTarget(ctx.regularSessions[ctx.cursor].title)
      ctx.setSearchQuery(ctx.regularSessions[ctx.cursor].title)
    }
    return
  }

  // Handle refresh (R for vim, Ctrl+Shift+R for standard)
  if (
    (!isStandard && key.name === 'R') ||
    (isStandard && key.ctrl && key.shift && key.name === 'r')
  ) {
    ctx.refreshItems()
    ctx.setMessage('Refreshed')
    setTimeout(() => ctx.setMessage(''), 2000)
    return
  }

  // Handle view mode switches (vim only)
  if (!isStandard) {
    if (key.name === 's') {
      ctx.setViewMode(ViewMode.Sessions)
      ctx.refreshItems(ViewMode.Sessions)
      return
    }
    if (key.name === 'p') {
      ctx.setViewMode(ViewMode.Projects)
      ctx.refreshItems(ViewMode.Projects)
      return
    }
  }

  // Handle navigation
  if (key.name === 'down' || (!isStandard && key.name === 'j')) {
    if (ctx.viewMode === ViewMode.Sessions) {
      ctx.setCursor(c => Math.min(c + 1, ctx.regularSessions.length - 1))
    } else {
      ctx.setCursor(c => Math.min(c + 1, ctx.items.length - 1))
    }
    return
  }

  if (key.name === 'up' || (!isStandard && key.name === 'k')) {
    ctx.setCursor(c => Math.max(c - 1, 0))
    return
  }

  // Handle selection
  if (key.name === 'return') {
    if (ctx.items[ctx.cursor]) {
      ctx.handleSelect(ctx.regularSessions[ctx.cursor])
    }
    return
  }

  // Handle number shortcuts (vim only)
  if (!isStandard && key.name >= '1' && key.name <= '9') {
    const num = parseInt(key.name) - 1
    if (num >= 0 && num < ctx.regularSessions.length) {
      ctx.handleSelect(ctx.regularSessions[num])
    }
  }
}

export function handleOpencodeManageMode(
  key: any,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const isStandard = keybindMode === 'standard'

  // Handle back/exit (o/Esc for vim, Ctrl+O/Esc for standard)
  if (
    key.name === 'escape' ||
    (!isStandard && key.name === 'o') ||
    (isStandard && key.ctrl && key.name === 'o')
  ) {
    ctx.setAppMode(AppMode.Normal)
    return
  }

  // Handle navigation down
  if (key.name === 'down' || (!isStandard && key.name === 'j')) {
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
  if (key.name === 'up' || (!isStandard && key.name === 'k')) {
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
  if ((!isStandard && key.name === 'd') || (isStandard && key.ctrl && key.name === 'd')) {
    if (ctx.opencodeSessions[ctx.opencodeCursor]) {
      ctx.handleKillSession(ctx.opencodeSessions[ctx.opencodeCursor].title)
    }
    return
  }

  // Handle rename (r for vim, Ctrl+R for standard)
  if ((!isStandard && key.name === 'r') || (isStandard && key.ctrl && key.name === 'r')) {
    if (ctx.opencodeSessions[ctx.opencodeCursor]) {
      ctx.setAppMode(AppMode.Rename)
      ctx.setRenameTarget(ctx.opencodeSessions[ctx.opencodeCursor].title)
      ctx.setSearchQuery(ctx.opencodeSessions[ctx.opencodeCursor].title)
    }
  }
}

export function handleSearchMode(
  key: any,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
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

      switch (key.name) {
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
        case 'r': // Ctrl+X r - rename
          if (ctx.viewMode === ViewMode.Sessions && ctx.items[ctx.cursor]?.isSession) {
            ctx.setAppMode(AppMode.Rename)
            ctx.setRenameTarget(ctx.items[ctx.cursor].title)
            ctx.setSearchQuery(ctx.items[ctx.cursor].title)
          }
          return
        case 'R': // Ctrl+X R - refresh
          ctx.refreshItems()
          ctx.setMessage('Refreshed')
          setTimeout(() => ctx.setMessage(''), 2000)
          return
        default:
          // Not a valid prefix command, ignore
          return
      }
    }

    // Handle Ctrl+X prefix activation
    if (key.ctrl && key.name === 'x') {
      ctx.setPrefixActive(true)

      // Clear prefix after 2 seconds if no key pressed
      const timeout = setTimeout(() => {
        ctx.setPrefixActive(false)
      }, 2000)
      ctx.prefixTimeoutRef.current = timeout
      return
    }

    // Ctrl+Q to quit (immediate, no prefix needed)
    if (key.ctrl && key.name === 'q') {
      process.exit(0)
    }
  }

  // Handle Esc differently based on mode
  if (key.name === 'escape') {
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

  switch (key.name) {
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
  key: any,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const isStandard = keybindMode === 'standard'

  // Handle Ctrl keybinds in standard mode
  if (isStandard && key.ctrl) {
    // Ctrl+I to switch to search mode
    if (key.name === 'i') {
      ctx.setAppMode(AppMode.Search)
      ctx.setViewMode(ViewMode.Sessions)
      ctx.setAllItems(ctx.sessionItems)
      ctx.setItems(ctx.sessionItems)
      ctx.setSearchQuery('')
      return
    }

    // Ctrl+D to delete session (if on sessions view)
    if (key.name === 'd' && ctx.items[ctx.cursor]?.isSession) {
      ctx.handleKillSession(ctx.items[ctx.cursor].title)
      return
    }
  }

  // Handle Esc differently based on mode
  if (key.name === 'escape') {
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

  switch (key.name) {
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
  key: any,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const isStandard = keybindMode === 'standard'

  // Handle Ctrl keybinds in standard mode
  if (isStandard && key.ctrl) {
    // Ctrl+I to switch to search mode
    if (key.name === 'i') {
      ctx.setAppMode(AppMode.Search)
      ctx.setSearchQuery('')
      ctx.setRenameTarget('')
      return
    }

    // Ctrl+D to delete the rename target session
    if (key.name === 'd' && ctx.renameTarget) {
      ctx.handleKillSession(ctx.renameTarget)
      ctx.setAppMode(AppMode.Search)
      ctx.setSearchQuery('')
      ctx.setRenameTarget('')
      return
    }
  }

  // Handle Esc differently based on mode
  if (key.name === 'escape') {
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

  switch (key.name) {
    case 'return':
      break
  }
}
