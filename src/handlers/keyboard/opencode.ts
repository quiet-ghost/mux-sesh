import { AppMode, type KeybindMode } from '../../types'
import { clampCursorIndex } from '../../ui/list-window'
import {
  activatePrefix,
  clearPrefix,
  getKeyName,
  matchesPrefixKey,
  type KeyboardHandlerContext,
  type KeyboardInput,
} from './shared'

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
    clearPrefix(ctx)

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
    activatePrefix(ctx)
    return
  }

  if (keyName === 'escape' || (!ctx.prefixKey && !isStandard && keyName === 'o')) {
    ctx.clearPendingKill()
    ctx.setAppMode(AppMode.Normal)
    return
  }

  if (keyName === 'down' || (!isStandard && keyName === 'j')) {
    ctx.clearPendingKill()
    ctx.setOpencodeCursor(cursor => {
      const next = clampCursorIndex(ctx.opencodeSessions.length, cursor + 1)
      if (next !== cursor && ctx.opencodeSessions[next]) {
        void ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[next].title)
      }
      return next
    })
    return
  }

  if (keyName === 'up' || (!isStandard && keyName === 'k')) {
    ctx.clearPendingKill()
    ctx.setOpencodeCursor(cursor => {
      const next = clampCursorIndex(ctx.opencodeSessions.length, cursor - 1)
      if (next !== cursor && ctx.opencodeSessions[next]) {
        void ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[next].title)
      }
      return next
    })
    return
  }

  if (!isStandard && keyName === 'd') {
    if (ctx.opencodeSessions[ctx.opencodeCursor]) {
      ctx.requestKillSession(ctx.opencodeSessions[ctx.opencodeCursor].title)
    }
    return
  }

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
