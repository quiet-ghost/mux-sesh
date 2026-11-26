import { getActionKeyHint } from '../../app/action-catalog'
import type { NewSessionStepControls } from '../../app/new-session-step'
import { AppMode, ViewMode, type KeybindMode } from '../../types'
import { clampCursorIndex } from '../../ui/list-window'
import {
  getKeyName,
  matchesPrefixKey,
  requestKillTarget,
  type KeyboardHandlerContext,
  type KeyboardInput,
} from './shared'

// A secondary step owns Enter, Esc, and the arrows; Esc returns to the project list unchanged.
function handleSecondaryStep(keyName: string, steps: NewSessionStepControls): boolean {
  switch (keyName) {
    case 'escape':
      steps.back()

      return true
    case 'down':
      steps.move(1)

      return true
    case 'up':
      steps.move(-1)

      return true
  }

  return false
}

export function handleNewSessionMode(
  key: KeyboardInput,
  ctx: KeyboardHandlerContext,
  keybindMode: KeybindMode,
  steps: NewSessionStepControls
): boolean {
  const keyName = getKeyName(key)
  const isStandard = keybindMode === 'standard'

  if (keyName === 'return') {
    ctx.runAction(steps.submit)

    return true
  }

  if (isStandard && key.ctrl) {
    if (keyName === 'i') {
      ctx.setAppMode(AppMode.Search)
      ctx.setViewMode(ViewMode.Sessions)
      ctx.setAllItems(ctx.sessionItems)
      ctx.setItems(ctx.sessionItems)
      ctx.setSearchQuery('')

      return true
    }

    if (keyName === 'd') {
      requestKillTarget(ctx)

      return true
    }
  }

  if (steps.step !== 'browse') return handleSecondaryStep(keyName, steps)

  const opened = steps.keys.find(id =>
    matchesPrefixKey(key, getActionKeyHint(ctx.actionContext, id))
  )

  if (opened) {
    steps.open(opened)

    return true
  }

  if (keyName === 'escape') {
    if (isStandard) {
      ctx.setAppMode(AppMode.Search)
      ctx.setViewMode(ViewMode.Sessions)
      ctx.setSearchQuery('')
      ctx.setCursor(0)
      ctx.runAction(() => ctx.refreshItems(ViewMode.Sessions))

      return true
    }

    ctx.setAppMode(AppMode.Normal)
    ctx.setViewMode(ViewMode.Sessions)
    ctx.setSearchQuery('')
    ctx.setCursor(0)

    return true
  }

  switch (keyName) {
    case 'down':
      ctx.setCursor(cursor => clampCursorIndex(ctx.items.length, cursor + 1))

      return true
    case 'up':
      ctx.setCursor(cursor => clampCursorIndex(ctx.items.length, cursor - 1))

      return true
  }

  return false
}
