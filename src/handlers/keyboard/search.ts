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
  toggleDetailsPanel,
  type KeyboardHandlerContext,
  type KeyboardInput,
} from './shared'

export function handleSearchMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
): boolean {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'

  if (isStandard) {
    if (ctx.prefixActive) {
      clearPrefix(ctx)

      switch (keyName) {
        case 'd':
          requestKillTarget(ctx)
          return true
        case 'n':
          enterNewSessionMode(ctx)
          return true
        case 'o':
          openAgentsTarget(ctx)
          return true
        case 's':
          ctx.clearPendingKill()
          ctx.openSettingsModal()
          return true
        case 'l':
          openLastSession(ctx)
          return true
        case 'g':
          openSelectedRootSession(ctx)
          return true
        case 'v':
          toggleDetailsPanel(ctx)
          return true
        case 'r':
          if (key.shift) {
            refreshProjectDiscovery()
            void ctx.refreshItems()
            setTimedMessage(ctx, 'Refreshed')
            return true
          }

          openRenameTarget(ctx)
          return true
        default:
          return true
      }
    }

    if (matchesPrefixKey(key, ctx.prefixKey)) {
      activatePrefix(ctx)
      return true
    }

    if (key.ctrl && keyName === 'q') {
      void requestShutdown(0)
      return true
    }
  }

  if (key.ctrl && keyName === 'p') {
    ctx.clearPendingKill()
    ctx.openCommandsModal()
    return true
  }

  if (keyName === 'escape') {
    ctx.clearPendingKill()
    if (isStandard) {
      ctx.setSearchQuery('')
      ctx.setCursor(0)
      return true
    }

    ctx.setAppMode(AppMode.Normal)
    ctx.setSearchQuery('')
    ctx.setCursor(0)
    return true
  }

  switch (keyName) {
    case 'return':
      ctx.clearPendingKill()
      if (ctx.items.length > 0) {
        void ctx.handleSelect(ctx.items[clampCursorIndex(ctx.items.length, ctx.cursor)])
      }
      return true
    case 'down':
      ctx.clearPendingKill()
      ctx.setCursor(cursor => clampCursorIndex(ctx.items.length, cursor + 1))
      return true
    case 'up':
      ctx.clearPendingKill()
      ctx.setCursor(cursor => clampCursorIndex(ctx.items.length, cursor - 1))
      return true
  }

  return false
}
