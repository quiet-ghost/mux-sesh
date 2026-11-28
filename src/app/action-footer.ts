import { AppMode, ViewMode } from '../types'
import {
  getActionAvailability,
  getActionKeyHint,
  getActionScope,
  type ActionContext,
  type ActionId,
  type NewSessionStepId,
} from './action-catalog'
import { CONFIRM_CLOSE_KEY } from './pending-close'

const FOOTER_LABELS: Partial<Record<ActionId, string>> = {
  back: 'back',
  search: 'search',
  'new-session': 'new',
  'open-agents': 'agents',
  'kill-session': 'close',
  'mark-target': 'mark',
  'open-commands': 'commands',
  'new-session-name': 'name',
  'new-session-startup': 'startup',
  'new-session-here': 'here',
  'new-session-file': 'file',
}

// `prefix` is the prefix-key indicator; `cancel` is esc leaving Search or New, or a waiting close.
export type FooterHintId = ActionId | 'prefix' | 'cancel'

// Shown as `label key`; an empty key shows the label alone.
export interface FooterHint {
  readonly id: FooterHintId
  readonly label: string
  readonly key: string
}

// Grouped by catalog scope: screen-wide actions, and actions on the selected row.
export interface ActionFooter {
  readonly global: readonly FooterHint[]
  readonly target: readonly FooterHint[]
}

const CANCEL_HINT: FooterHint = { id: 'cancel', label: 'cancel', key: 'esc' }

function footerPart(context: ActionContext, id: ActionId, label: string): FooterHint[] {
  const key = getActionKeyHint(context, id)

  return key && getActionAvailability(context, id).kind === 'available' ? [{ id, label, key }] : []
}

function footerAction(context: ActionContext, id: ActionId): FooterHint[] {
  const label = FOOTER_LABELS[id] ?? id

  if (id === 'kill-session' && context.marked.size > 0) {
    return footerPart(context, id, `${label} ${context.marked.size} marked`)
  }

  return footerPart(context, id, label)
}

function prefixHint(context: ActionContext): FooterHint {
  return { id: 'prefix', label: 'prefix', key: context.prefixKey }
}

// What Enter does for the current frozen launch plan (New, or a Projects row), or 'apply' for an edit.
export type NewSessionAction = 'focus' | 'create' | 'clone' | 'apply' | 'none'

function newSessionHints(
  context: ActionContext,
  action: NewSessionAction,
  steps: readonly NewSessionStepId[]
): FooterHint[] {
  const enter: FooterHint[] =
    action === 'none'
      ? []
      : [{ id: 'select', label: action, key: getActionKeyHint(context, 'select') }]

  return [...enter, ...steps.flatMap(id => footerAction(context, id)), CANCEL_HINT]
}

// A Projects row opens through its frozen launch plan, so Enter names that plan's action; while
// it is still planning or refused, Enter is not advertised.
function selectHint(context: ActionContext, enter: NewSessionAction): FooterHint[] {
  if (context.viewMode !== ViewMode.Projects) return footerPart(context, 'select', 'select')

  return enter === 'none' || enter === 'apply' ? [] : footerPart(context, 'select', enter)
}

// While a close waits, the next key either confirms it or cancels it, in every mode.
const CONFIRM_CLOSE_HINTS: readonly FooterHint[] = [
  CANCEL_HINT,
  { id: 'kill-session', label: FOOTER_LABELS['kill-session'] ?? 'close', key: CONFIRM_CLOSE_KEY },
]

function footerHints(
  context: ActionContext,
  enter: NewSessionAction,
  newSessionSteps: readonly NewSessionStepId[]
): readonly FooterHint[] {
  if (context.pendingClose.kind === 'armed') return CONFIRM_CLOSE_HINTS

  switch (context.appMode) {
    case AppMode.AgentsManage:
      return [
        ...footerAction(context, 'back'),
        ...footerPart(context, 'select', 'focus'),
        ...footerAction(context, 'kill-session'),
        ...footerAction(context, 'open-commands'),
        prefixHint(context),
      ]
    case AppMode.NewSession:
      return newSessionHints(context, enter, newSessionSteps)
    case AppMode.Search:
      return [...selectHint(context, enter), ...footerAction(context, 'open-commands'), CANCEL_HINT]
    case AppMode.Normal:
      return [
        ...selectHint(context, enter),
        ...footerAction(context, 'search'),
        ...footerAction(context, 'new-session'),
        ...footerAction(context, 'open-agents'),
        ...footerAction(context, 'kill-session'),
        ...footerAction(context, 'open-commands'),
        prefixHint(context),
      ]
  }
}

function isTargetHint(hint: FooterHint): boolean {
  return hint.id !== 'prefix' && hint.id !== 'cancel' && getActionScope(hint.id) === 'target'
}

// `enter` is what the current frozen launch plan does: New's plan, or the highlighted Projects row's.
export function getActionFooter(
  context: ActionContext,
  enter: NewSessionAction = 'none',
  newSessionSteps: readonly NewSessionStepId[] = []
): ActionFooter {
  const hints = footerHints(context, enter, newSessionSteps)

  return {
    global: hints.filter(hint => !isTargetHint(hint)),
    target: hints.filter(isTargetHint),
  }
}
