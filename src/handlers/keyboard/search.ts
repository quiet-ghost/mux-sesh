import { AppMode, type KeybindMode } from '../../types'
import { clampCursorIndex } from '../../ui/list-window'
import { refreshProjectDiscovery } from '../../tmux/projects'
import { requestShutdown } from '../../util/shutdown'
import {
  activatePrefix,
  clearPrefix,
  enterNewSessionMode,
  getKeyName,
  matchesPrefixKey,
  openAgentsTarget,
  openLastSession,
  openRenameTarget,
  openSelectedRootSession,
  requestKillTarget,
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
          requestKillTarget(ctx)
          return
        case 'n':
          enterNewSessionMode(ctx)
          return
        case 'o':
          openAgentsTarget(ctx)
          return
        case 's':
          ctx.clearPendingKill()
          ctx.openSettingsModal()
          return
        case 'l':
          openLastSession(ctx)
          return
        case 'g':
          openSelectedRootSession(ctx)
          return
        case 'r':
          if (key.shift) {
            refreshProjectDiscovery()
            void ctx.refreshItems()
            setTimedMessage(ctx, 'Refreshed')
            return
          }

          openRenameTarget(ctx)
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

  if (key.ctrl && keyName === 'p') {
    ctx.clearPendingKill()
    ctx.openCommandsModal()
    return
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
        void ctx.handleSelect(ctx.items[clampCursorIndex(ctx.items.length, ctx.cursor)])
      }
      break
    case 'down':
      ctx.clearPendingKill()
      ctx.setCursor(cursor => clampCursorIndex(ctx.items.length, cursor + 1))
      break
    case 'up':
      ctx.clearPendingKill()
      ctx.setCursor(cursor => clampCursorIndex(ctx.items.length, cursor - 1))
      break
  }
}
