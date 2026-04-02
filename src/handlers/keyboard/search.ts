import { AppMode, ViewMode, type KeybindMode } from '../../types'
import { requestShutdown } from '../../util/shutdown'
import {
  activatePrefix,
  clearPrefix,
  enterNewSessionMode,
  getKeyName,
  matchesPrefixKey,
  setTimedMessage,
  type KeyboardHandlerContext,
  type KeyboardInput,
} from './shared'

export function handleSearchMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'

  if (isStandard) {
    if (ctx.prefixActive) {
      clearPrefix(ctx)

      switch (keyName) {
        case 'd':
          if (ctx.viewMode === ViewMode.Sessions && ctx.items[ctx.cursor]?.isSession) {
            ctx.requestKillSession(ctx.items[ctx.cursor].title)
          }
          return
        case 'n':
          enterNewSessionMode(ctx)
          return
        case 'o':
          ctx.clearPendingKill()
          if (ctx.viewMode === ViewMode.Sessions && ctx.opencodeSessions.length > 0) {
            ctx.setAppMode(AppMode.OpencodeManage)
            ctx.setOpencodeCursor(0)
            void ctx.loadOpencodeStatsForSession(ctx.opencodeSessions[0].title)
          }
          return
        case 's':
          ctx.clearPendingKill()
          ctx.openSettingsModal()
          return
        case 'l':
          ctx.clearPendingKill()
          void ctx.handleLastSession()
          return
        case 'g':
          ctx.clearPendingKill()
          void ctx.handleRootSession(ctx.items[ctx.cursor])
          return
        case 'r':
          if (key.shift) {
            void ctx.refreshItems()
            setTimedMessage(ctx, 'Refreshed')
            return
          }

          if (ctx.viewMode === ViewMode.Sessions && ctx.items[ctx.cursor]?.isSession) {
            ctx.clearPendingKill()
            ctx.openRenameModal(ctx.items[ctx.cursor].title)
          }
          return
        default:
          return
      }
    }

    if (matchesPrefixKey(key, ctx.prefixKey)) {
      activatePrefix(ctx)
      return
    }

    if (key.ctrl && keyName === 'q') {
      void requestShutdown(0)
      return
    }
  }

  if (keyName === 'escape') {
    ctx.clearPendingKill()
    if (isStandard) {
      ctx.setSearchQuery('')
      ctx.setCursor(0)
      return
    }

    ctx.setAppMode(AppMode.Normal)
    ctx.setSearchQuery('')
    ctx.setCursor(0)
    return
  }

  switch (keyName) {
    case 'return':
      ctx.clearPendingKill()
      if (ctx.items.length > 0) {
        void ctx.handleSelect(ctx.items[0])
      }
      break
    case 'down':
      ctx.clearPendingKill()
      ctx.setCursor(cursor => Math.min(cursor + 1, ctx.items.length - 1))
      break
    case 'up':
      ctx.clearPendingKill()
      ctx.setCursor(cursor => Math.max(cursor - 1, 0))
      break
  }
}
