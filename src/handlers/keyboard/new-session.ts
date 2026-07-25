import { AppMode, ViewMode, type KeybindMode } from '../../types'
import { clampCursorIndex } from '../../ui/list-window'
import { getKeyName, type KeyboardHandlerContext, type KeyboardInput } from './shared'

export function handleNewSessionMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'

  if (isStandard && key.ctrl) {
    if (keyName === 'i') {
      ctx.clearPendingKill()
      ctx.setAppMode(AppMode.Search)
      ctx.setViewMode(ViewMode.Sessions)
      ctx.setAllItems(ctx.sessionItems)
      ctx.setItems(ctx.sessionItems)
      ctx.setSearchQuery('')
      return
    }

    if (keyName === 'd' && ctx.items[ctx.cursor]?.isSession) {
      ctx.requestKillSession(ctx.items[ctx.cursor])
      return
    }
  }

  if (keyName === 'escape') {
    ctx.clearPendingKill()
    if (isStandard) {
      ctx.setAppMode(AppMode.Search)
      ctx.setViewMode(ViewMode.Sessions)
      ctx.setSearchQuery('')
      ctx.setCursor(0)
      void ctx.refreshItems(ViewMode.Sessions)
      return
    }

    ctx.setAppMode(AppMode.Normal)
    ctx.setViewMode(ViewMode.Sessions)
    ctx.setSearchQuery('')
    ctx.setCursor(0)
    return
  }

  switch (keyName) {
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
