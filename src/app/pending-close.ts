import { CleanupPlan } from '../sessions/cleanup-plan'
import { toPlainText } from '../util/ansi'
import type { StatusLine } from '../ui/status-line'

// A single close waits on its row for a second press of this key; it is not rebindable.
export const CONFIRM_CLOSE_KEY = 'd'

// The first close key freezes a review of the row under the cursor. Only a second close key on
// that same row closes it, and only the frozen plan is closed.
export type PendingClose =
  { readonly kind: 'none' } | { readonly kind: 'armed'; readonly plan: CleanupPlan }

const NONE: PendingClose = { kind: 'none' }

function arm(plan: CleanupPlan): PendingClose {
  return { kind: 'armed', plan }
}

function keyOf(pending: PendingClose): string | undefined {
  return pending.kind === 'armed' ? pending.plan.key : undefined
}

// What the review dialog used to warn about stays on screen while the close waits.
function statusLines(pending: PendingClose): readonly StatusLine[] {
  if (pending.kind === 'none' || pending.plan.warnings.length === 0) return []

  const text = pending.plan.warnings.map(warning =>
    toPlainText(CleanupPlan.describeWarning(warning))
  )

  return [{ kind: 'warn', text: text.join('. ') }]
}

export interface PendingCloseKey {
  readonly name?: string
  readonly ctrl?: boolean
  readonly shift?: boolean
  readonly meta?: boolean
}

export interface PendingCloseKeyState {
  // The row the next key would act on, by item key.
  readonly targetKey: string | undefined
  readonly prefixActive: boolean
  readonly prefixKeyPressed: boolean
}

// What one key does to a waiting close. `pass` leaves it waiting and lets the key act as usual;
// `cancel-and-pass` drops it first. Esc only cancels, so it cannot also quit or clear the search.
export type PendingCloseStep =
  | { readonly kind: 'pass' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'cancel-and-pass' }
  | { readonly kind: 'confirm'; readonly plan: CleanupPlan }

const PASS: PendingCloseStep = { kind: 'pass' }
const CANCEL: PendingCloseStep = { kind: 'cancel' }
const CANCEL_AND_PASS: PendingCloseStep = { kind: 'cancel-and-pass' }

function onKey(
  pending: PendingClose,
  key: PendingCloseKey,
  state: PendingCloseKeyState
): PendingCloseStep {
  if (pending.kind === 'none') return PASS

  // The row it was armed on is no longer the one under the cursor.
  if (state.targetKey !== pending.plan.key) return CANCEL_AND_PASS

  // Ctrl is allowed, so New's ctrl+d chord confirms with a second ctrl+d too.
  if (key.name === CONFIRM_CLOSE_KEY && !key.shift && !key.meta) {
    return { kind: 'confirm', plan: pending.plan }
  }

  if (key.name === 'escape') return CANCEL

  // The prefix is the first half of the close chord, so `prefix d` confirms as well as `d`.
  if (state.prefixKeyPressed && !state.prefixActive) return PASS

  return CANCEL_AND_PASS
}

export const PendingClose = { none: NONE, arm, keyOf, statusLines, onKey } as const
