import { AppMode, ViewMode, type KeybindMode } from '../../types'
import { clampCursorIndex } from '../../ui/list-window'
import { refreshProjectDiscovery } from '../../tmux/projects'
import { requestShutdown } from '../../util/shutdown'
import {
  activatePrefix,
  clearPrefix,
  enterNewSessionMode,
  getKeyName,
  getQuickSelectItem,
  getSelectedItem,
  matchesPrefixKey,
  openAgentsTarget,
  openLastSession,
  openRenameTarget,
  openSelectedEditTarget,
  openSelectedRootSession,
  requestKillTarget,
  setTimedMessage,
  toggleDetailsPanel,
  togglePinnedTarget,
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
      refreshProjectDiscovery()
      ctx.runAction(() => ctx.refreshItems())
      setTimedMessage(ctx, 'Refreshed')

      return
    }

    switch (keyName) {
      case 'l':
        openLastSession(ctx)

        return
      case 'g':
        openSelectedRootSession(ctx)

        return
      case 'e':
        openSelectedEditTarget(ctx)

        return
      case 'd':
        requestKillTarget(ctx)

        return
      case 'r':
        openRenameTarget(ctx)

        return
      case 'v':
        toggleDetailsPanel(ctx)

        return
      case 's':
        ctx.clearPendingKill()
        ctx.setViewMode(ViewMode.Sessions)
        ctx.runAction(() => ctx.refreshItems(ViewMode.Sessions))

        return
      case 'p':
        ctx.clearPendingKill()
        ctx.setViewMode(ViewMode.Projects)
        ctx.runAction(() => ctx.refreshItems(ViewMode.Projects))

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
    ctx.runAction(() => requestShutdown(0))

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
    openAgentsTarget(ctx)

    return
  }

  if (key.ctrl && keyName === 'p') {
    ctx.clearPendingKill()
    ctx.openCommandsModal()

    return
  }

  if (key.ctrl && keyName === 'f') {
    togglePinnedTarget(ctx)

    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'l') {
    openLastSession(ctx)

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
    requestKillTarget(ctx)

    return
  }

  if (!isStandard && keyName === 'v') {
    toggleDetailsPanel(ctx)

    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'r') {
    openRenameTarget(ctx)

    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'R') {
    ctx.clearPendingKill()
    refreshProjectDiscovery()
    ctx.runAction(() => ctx.refreshItems())
    setTimedMessage(ctx, 'Refreshed')

    return
  }

  if (!isStandard) {
    if (keyName === 's') {
      ctx.clearPendingKill()
      ctx.setViewMode(ViewMode.Sessions)
      ctx.runAction(() => ctx.refreshItems(ViewMode.Sessions))

      return
    }

    if (keyName === 'p') {
      ctx.clearPendingKill()
      ctx.setViewMode(ViewMode.Projects)
      ctx.runAction(() => ctx.refreshItems(ViewMode.Projects))

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
      ctx.runAction(() => ctx.handleSelect(item))
    }

    return
  }

  if (!isStandard && keyName >= '1' && keyName <= '9') {
    ctx.clearPendingKill()
    const item = getQuickSelectItem(ctx, Number.parseInt(keyName, 10) - 1)

    if (item) {
      ctx.runAction(() => ctx.handleSelect(item))
    }
  }
}
