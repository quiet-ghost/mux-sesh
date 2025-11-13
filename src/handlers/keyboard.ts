import { AppMode, ViewMode } from '../types'

export interface KeyboardHandlerContext {
  appMode: AppMode
  viewMode: ViewMode
  items: any[]
  regularSessions: any[]
  opencodeSessions: any[]
  cursor: number
  opencodeCursor: number
  searchQuery: string
  projectItems: any[]
  sessionItems: any[]

  setAppMode: (mode: AppMode) => void
  setViewMode: (mode: ViewMode) => void
  setCursor: (cursor: number | ((prev: number) => number)) => void
  setOpencodeCursor: (cursor: number | ((prev: number) => number)) => void
  setSearchQuery: (query: string) => void
  setRenameTarget: (target: string) => void
  setAllItems: (items: any[]) => void
  setItems: (items: any[]) => void

  refreshItems: (forceViewMode?: ViewMode) => Promise<void>
  handleSelect: (item: any) => Promise<void>
  handleKillSession: (sessionName: string) => Promise<void>
  loadOpencodeStatsForSession: (sessionName: string) => Promise<any>
  setMessage: (message: string) => void
}

export function handleNormalMode(key: any, ctx: KeyboardHandlerContext) {
  switch (key.name) {
    case 'q':
    case 'escape':
      process.exit(0)
    case 'i':
      ctx.setAppMode(AppMode.Search)
      ctx.setSearchQuery('')
      break
    case 'n':
      ctx.setAppMode(AppMode.NewSession)
      if (ctx.viewMode === ViewMode.Sessions) {
      }
      ctx.setViewMode(ViewMode.Projects)
      ctx.setAllItems(ctx.projectItems)
      ctx.setItems(ctx.projectItems)
      ctx.setCursor(Math.max(0, ctx.projectItems.length - 1))
      ctx.setSearchQuery('')
      break
    case 'o':
      if (ctx.viewMode === ViewMode.Sessions && ctx.opencodeSessions.length > 0) {
        ctx.setAppMode(AppMode.OpencodeManage)
        ctx.setOpencodeCursor(0)
        ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[0].title)
      }
      break
    case 'd':
      if (ctx.viewMode === ViewMode.Sessions && ctx.items[ctx.cursor]?.isSession) {
        ctx.handleKillSession(ctx.items[ctx.cursor].title)
      }
      break
    case 'r':
      if (ctx.viewMode === ViewMode.Sessions && ctx.items[ctx.cursor]?.isSession) {
        ctx.setAppMode(AppMode.Rename)
        ctx.setRenameTarget(ctx.items[ctx.cursor].title)
        ctx.setSearchQuery(ctx.items[ctx.cursor].title)
      }
      break
    case 'R':
      ctx.refreshItems()
      ctx.setMessage('Refreshed')
      setTimeout(() => ctx.setMessage(''), 2000)
      break
    case 's':
      ctx.setViewMode(ViewMode.Sessions)
      ctx.refreshItems(ViewMode.Sessions)
      break
    case 'p':
      ctx.setViewMode(ViewMode.Projects)
      ctx.refreshItems(ViewMode.Projects)
      break
    case 'j':
    case 'down':
      if (ctx.viewMode === ViewMode.Sessions) {
        ctx.setCursor(c => Math.min(c + 1, ctx.regularSessions.length - 1))
      } else {
        ctx.setCursor(c => Math.min(c + 1, ctx.items.length - 1))
      }
      break
    case 'k':
    case 'up':
      ctx.setCursor(c => Math.max(c - 1, 0))
      break
    case 'return':
      if (ctx.items[ctx.cursor]) {
        ctx.handleSelect(ctx.items[ctx.cursor])
      }
      break
    default:
      if (key.name >= '1' && key.name <= '9') {
        const num = parseInt(key.name) - 1
        if (num >= 0 && num < ctx.items.length) {
          ctx.handleSelect(ctx.items[num])
        }
      }
      break
  }
}

export function handleOpencodeManageMode(key: any, ctx: KeyboardHandlerContext) {
  switch (key.name) {
    case 'o':
    case 'escape':
      ctx.setAppMode(AppMode.Normal)
      break
    case 'j':
    case 'down':
      ctx.setOpencodeCursor(c => {
        const newCursor = Math.min(c + 1, ctx.opencodeSessions.length - 1)
        if (newCursor !== c) {
          ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[newCursor].title)
        }
        return newCursor
      })
      break
    case 'k':
    case 'up':
      ctx.setOpencodeCursor(c => {
        const newCursor = Math.max(c - 1, 0)
        if (newCursor !== c) {
          ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[newCursor].title)
        }
        return newCursor
      })
      break
    case 'd':
      if (ctx.opencodeSessions[ctx.opencodeCursor]) {
        ctx.handleKillSession(ctx.opencodeSessions[ctx.opencodeCursor].title)
      }
      break
    case 'r':
      if (ctx.opencodeSessions[ctx.opencodeCursor]) {
        ctx.setAppMode(AppMode.Rename)
        ctx.setRenameTarget(ctx.opencodeSessions[ctx.opencodeCursor].title)
        ctx.setSearchQuery(ctx.opencodeSessions[ctx.opencodeCursor].title)
      }
      break
  }
}

export function handleSearchMode(key: any, ctx: KeyboardHandlerContext) {
  switch (key.name) {
    case 'escape':
      ctx.setAppMode(AppMode.Normal)
      ctx.setSearchQuery('')
      ctx.setCursor(0)
      break
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

export function handleNewSessionMode(key: any, ctx: KeyboardHandlerContext) {
  switch (key.name) {
    case 'escape':
      ctx.setAppMode(AppMode.Normal)
      ctx.setViewMode(ViewMode.Sessions)
      ctx.setSearchQuery('')
      ctx.setCursor(0)
      break
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

export function handleRenameMode(key: any, ctx: KeyboardHandlerContext) {
  switch (key.name) {
    case 'escape':
      ctx.setAppMode(AppMode.Normal)
      ctx.setSearchQuery('')
      ctx.setRenameTarget('')
      break
    case 'return':
      break
  }
}
