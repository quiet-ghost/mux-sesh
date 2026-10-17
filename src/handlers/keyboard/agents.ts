import { isHerdrAgentItem } from '../../multiplexer/items'
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

export function handleAgentsManageMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode = 'vim'
) {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'
  const returnMode = isStandard ? AppMode.Search : AppMode.Normal

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
        ctx.setAppMode(returnMode)
        return
      case 'd':
        if (
          ctx.agentSessions[ctx.agentCursor] &&
          !isHerdrAgentItem(ctx.agentSessions[ctx.agentCursor])
        ) {
          ctx.requestKillSession(ctx.agentSessions[ctx.agentCursor])
        }
        return
      case 'r':
        if (
          ctx.agentSessions[ctx.agentCursor] &&
          !isHerdrAgentItem(ctx.agentSessions[ctx.agentCursor])
        ) {
          ctx.clearPendingKill()
          ctx.openRenameModal(ctx.agentSessions[ctx.agentCursor])
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
    ctx.setAppMode(returnMode)
    return
  }

  if (keyName === 'return' || keyName === 'enter') {
    const selectedAgent = ctx.agentSessions[ctx.agentCursor]
    if (selectedAgent) {
      void ctx.handleSelect(selectedAgent)
    }
    return
  }

  if (keyName === 'down' || (!isStandard && keyName === 'j')) {
    ctx.clearPendingKill()
    ctx.setAgentCursor(cursor => clampCursorIndex(ctx.agentSessions.length, cursor + 1))
    return
  }

  if (keyName === 'up' || (!isStandard && keyName === 'k')) {
    ctx.clearPendingKill()
    ctx.setAgentCursor(cursor => clampCursorIndex(ctx.agentSessions.length, cursor - 1))
    return
  }

  if (!isStandard && keyName === 'd') {
    if (
      ctx.agentSessions[ctx.agentCursor] &&
      !isHerdrAgentItem(ctx.agentSessions[ctx.agentCursor])
    ) {
      ctx.requestKillSession(ctx.agentSessions[ctx.agentCursor])
    }
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === 'r') {
    if (
      ctx.agentSessions[ctx.agentCursor] &&
      !isHerdrAgentItem(ctx.agentSessions[ctx.agentCursor])
    ) {
      ctx.clearPendingKill()
      ctx.openRenameModal(ctx.agentSessions[ctx.agentCursor])
    }
    return
  }

  if (!ctx.prefixKey && !isStandard && keyName === ',') {
    ctx.clearPendingKill()
    ctx.openSettingsModal()
    return
  }
}
