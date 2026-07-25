import { isOpencodeSessionItem } from '../../opencode/session-name'
import { isHerdrAgentItem } from '../../multiplexer/items'
import type { Item } from '../../types'
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

function loadStatsIfOpencode(ctx: KeyboardHandlerContext, item: Item) {
  if (isOpencodeSessionItem(item)) {
    void ctx.loadOpencodeStatsForSession(item.title)
  }
}

export function handleAgentsManageMode(
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
    ctx.setAppMode(AppMode.Normal)
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
    ctx.setAgentCursor(cursor => {
      const next = clampCursorIndex(ctx.agentSessions.length, cursor + 1)
      if (next !== cursor && ctx.agentSessions[next]) {
        loadStatsIfOpencode(ctx, ctx.agentSessions[next])
      }
      return next
    })
    return
  }

  if (keyName === 'up' || (!isStandard && keyName === 'k')) {
    ctx.clearPendingKill()
    ctx.setAgentCursor(cursor => {
      const next = clampCursorIndex(ctx.agentSessions.length, cursor - 1)
      if (next !== cursor && ctx.agentSessions[next]) {
        loadStatsIfOpencode(ctx, ctx.agentSessions[next])
      }
      return next
    })
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
