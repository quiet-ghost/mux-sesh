import { AppMode, ViewMode, type KeybindMode } from '../../types'
import { clampCursorIndex } from '../../ui/list-window'
import { requestShutdown } from '../../util/shutdown'
import {
  activatePrefix,
  clearPrefix,
  enterNewSessionMode,
  getKeyName,
  getQuickSelectItem,
  getSelectedItem,
  matchesPrefixKey,
  openSelectedEditTarget,
  openSelectedRootSession,
  setTimedMessage,
  type KeyboardHandlerContext,
  type KeyboardInput,
} from './shared'

export function handleNormalMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'

  if (ctx.prefixActive) {
    clearPrefix(ctx)

    if (key.shift && keyName.toLowerCase() === 'r') {
      ctx.clearPendingKill()
      void ctx.refreshItems()
      setTimedMessage(ctx, 'Refreshed')
      return
    }

    switch (keyName) {
      case 'l':
        ctx.clearPendingKill()
        void ctx.handleLastSession()
        return
      case 'g':
        openSelectedRootSession(ctx)
        return
      case 'e':
        openSelectedEditTarget(ctx)
        return
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
        void ctx.refreshItems(ViewMode.Sessions)
        return
      case 'p':
        ctx.clearPendingKill()
        ctx.setViewMode(ViewMode.Projects)
        void ctx.refreshItems(ViewMode.Projects)
        return
    }

    return
  }

  if (ctx.prefixKey && matchesPrefixKey(key, ctx.prefixKey)) {
    activatePrefix(ctx)
    return
  }

  if (
    (isStandard && ((key.ctrl && keyName === 'q') || keyName === 'escape')) ||
    (!isStandard && (keyName === 'q' || keyName === 'escape'))
  ) {
    void requestShutdown(0)
    return
  }

  if (!isStandard && keyName === 'i') {
    ctx.clearPendingKill()
    ctx.setAppMode(AppMode.Search)
    ctx.setSearchQuery('')
    return
  }

  if (!isStandard && keyName === 'n') {
    enterNewSessionMode(ctx)
    return
  }

  if (!isStandard && keyName === 'o') {
    ctx.clearPendingKill()
    if (ctx.viewMode === ViewMode.Sessions && ctx.opencodeSessions.length > 0) {
      ctx.setAppMode(AppMode.OpencodeManage)
      ctx.setOpencodeCursor(0)
      void ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[0].title)
    }
    return
  }

  if (key.ctrl && keyName === 'p') {
    ctx.clearPendingKill()
    ctx.openCommandsModal()
    return
  }

  if (key.ctrl && keyName === 'f') {
    const item = ctx.viewMode === ViewMode.Sessions ? ctx.regularSessions[ctx.cursor] : undefined
    if (item) {
      ctx.clearPendingKill()
      void ctx.togglePinnedSession(item.title)
    }
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'l') {
    ctx.clearPendingKill()
    void ctx.handleLastSession()
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'g') {
    openSelectedRootSession(ctx)
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'e') {
    openSelectedEditTarget(ctx)
    return
  }

  if (!isStandard && keyName === 'd') {
    if (ctx.viewMode === ViewMode.Sessions && ctx.regularSessions[ctx.cursor]?.isSession) {
      ctx.requestKillSession(ctx.regularSessions[ctx.cursor].title)
    }
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'r') {
    if (ctx.viewMode === ViewMode.Sessions && ctx.regularSessions[ctx.cursor]?.isSession) {
      ctx.clearPendingKill()
      ctx.openRenameModal(ctx.regularSessions[ctx.cursor].title)
    }
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'R') {
    ctx.clearPendingKill()
    void ctx.refreshItems()
    setTimedMessage(ctx, 'Refreshed')
    return
  }

  if (!isStandard) {
    if (keyName === 's') {
      ctx.clearPendingKill()
      ctx.setViewMode(ViewMode.Sessions)
      void ctx.refreshItems(ViewMode.Sessions)
      return
    }

    if (keyName === 'p') {
      ctx.clearPendingKill()
      ctx.setViewMode(ViewMode.Projects)
      void ctx.refreshItems(ViewMode.Projects)
      return
    }
  }

  if (keyName === 'down' || (!isStandard && keyName === 'j')) {
    ctx.clearPendingKill()
    if (ctx.viewMode === ViewMode.Sessions) {
      ctx.setCursor(cursor => clampCursorIndex(ctx.regularSessions.length, cursor + 1))
      return
    }

    ctx.setCursor(cursor => clampCursorIndex(ctx.items.length, cursor + 1))
    return
  }

  if (keyName === 'up' || (!isStandard && keyName === 'k')) {
    ctx.clearPendingKill()
    ctx.setCursor(cursor =>
      clampCursorIndex(
        ctx.viewMode === ViewMode.Sessions ? ctx.regularSessions.length : ctx.items.length,
        cursor - 1
      )
    )
    return
  }

  if (keyName === 'return') {
    ctx.clearPendingKill()
    const item = getSelectedItem(ctx)
    if (item) {
      void ctx.handleSelect(item)
    }
    return
  }

  if (!isStandard && keyName >= '1' && keyName <= '9') {
    ctx.clearPendingKill()
    const item = getQuickSelectItem(ctx, Number.parseInt(keyName, 10) - 1)
    if (item) {
      void ctx.handleSelect(item)
    }
  }
}
