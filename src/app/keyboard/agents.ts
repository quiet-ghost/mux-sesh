import { AppMode, type KeybindMode } from '../../types'
import { clampCursorIndex } from '../../ui/list-window'
import {
  activatePrefix,
  clearPrefix,
  getKeyName,
  matchesPrefixKey,
  openRenameTarget,
  requestKillTarget,
  toggleMarkTarget,
  toggleDetailsPanel,
  type KeyboardHandlerContext,
  type KeyboardInput,
} from './shared'

export function handleAgentsManageMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'
  const returnMode = isStandard ? AppMode.Search : AppMode.Normal

  if (key.ctrl && keyName === 'p') {
    ctx.openCommandsModal()

    return
  }

  if (ctx.prefixActive) {
    clearPrefix(ctx)

    switch (keyName) {
      case 'o':
        ctx.setAppMode(returnMode)

        return
      case 'd':
        requestKillTarget(ctx)

        return
      case 'm':
        toggleMarkTarget(ctx)

        return
      case 'r':
        openRenameTarget(ctx)

        return
      case 'v':
        toggleDetailsPanel(ctx)

        return
    }

    return
  }

  if (matchesPrefixKey(key, ctx.prefixKey)) {
    activatePrefix(ctx)

    return
  }

  if (keyName === 'escape') {
    ctx.setAppMode(returnMode)

    return
  }

  if (keyName === 'return' || keyName === 'enter') {
    const selectedAgent = ctx.agentSessions[ctx.agentCursor]

    if (selectedAgent) {
      ctx.runAction(() => ctx.handleSelect(selectedAgent))
    }

    return
  }

  if (keyName === 'down' || (!isStandard && keyName === 'j')) {
    ctx.setAgentCursor(cursor => clampCursorIndex(ctx.agentSessions.length, cursor + 1))

    return
  }

  if (keyName === 'up' || (!isStandard && keyName === 'k')) {
    ctx.setAgentCursor(cursor => clampCursorIndex(ctx.agentSessions.length, cursor - 1))

    return
  }

  if (!isStandard && keyName === 'd') {
    requestKillTarget(ctx)

    return
  }

  if (!isStandard && keyName === 'm') {
    toggleMarkTarget(ctx)

    return
  }

  if (!isStandard && keyName === 'v') {
    toggleDetailsPanel(ctx)
  }
}
