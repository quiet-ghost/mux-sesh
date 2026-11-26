import { getItemKey, isHerdrAgentItem, isLiveSessionItem } from '../multiplexer/items'
import type { Item } from '../types'

// A close always removes one whole tmux session or Herdr workspace. A Herdr ref carrying an agent
// pane target is not assignable here, so a reviewed pane can never widen into a workspace close.
export type ClosureRef =
  | { readonly backend: 'tmux'; readonly id: string; readonly title: string }
  | {
      readonly backend: 'herdr'
      readonly id: string
      readonly title: string
      readonly target?: never
    }

export type CloseWarning =
  | { readonly kind: 'in-use' }
  | { readonly kind: 'pinned' }
  | { readonly kind: 'agent-active'; readonly name: string; readonly status: 'working' | 'blocked' }

// What the user reviewed: the exact ref, its scope and warnings, and the inventory revision it was
// projected from. Confirming executes this ref only; it is never re-derived from the cursor.
export interface CleanupPlan {
  readonly key: string
  readonly ref: ClosureRef
  readonly path: string
  readonly units: number | undefined
  readonly warnings: readonly CloseWarning[]
  readonly revision: number
}

export type CleanupReview =
  | { readonly kind: 'ready'; readonly plan: CleanupPlan }
  | { readonly kind: 'refused'; readonly reason: string }

export type CleanupCheck =
  | { readonly kind: 'confirmed'; readonly plan: CleanupPlan }
  | { readonly kind: 'changed'; readonly message: string }

function nounOf(ref: ClosureRef): 'session' | 'workspace' {
  return ref.backend === 'herdr' ? 'workspace' : 'session'
}

function unitNoun(ref: ClosureRef, count: number): string {
  const noun = ref.backend === 'herdr' ? 'tab' : 'window'

  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function unitsOf(item: Item): number | undefined {
  const units = Number(item.windowCount)

  return item.windowCount !== undefined && Number.isInteger(units) && units >= 0 ? units : undefined
}

function agentWarning(item: Item): CloseWarning | undefined {
  return item.agentStatus === 'working' || item.agentStatus === 'blocked'
    ? { kind: 'agent-active', name: item.title, status: item.agentStatus }
    : undefined
}

// Idle, done, detached and unfocused targets carry no warning, but are still only ever reviewed.
function warningsOf(item: Item, ref: ClosureRef, inventory: readonly Item[]): CloseWarning[] {
  const warnings: CloseWarning[] = []

  if (item.isAttached) warnings.push({ kind: 'in-use' })

  if (item.isPinned) warnings.push({ kind: 'pinned' })

  const own = agentWarning(item)

  if (own) warnings.push(own)

  // Closing a Herdr workspace also ends every agent pane inside it.
  if (ref.backend === 'herdr') {
    for (const pane of inventory) {
      if (!isHerdrAgentItem(pane) || pane.sessionId !== ref.id) continue

      const warning = agentWarning(pane)

      if (warning) warnings.push(warning)
    }
  }

  return warnings
}

function review(item: Item, inventory: readonly Item[], revision: number): CleanupReview {
  if (!isLiveSessionItem(item)) {
    return { kind: 'refused', reason: 'Select a live session to close. Nothing was closed.' }
  }

  if (item.target) {
    return {
      kind: 'refused',
      reason: `'${item.title}' is an agent pane; mux-sesh closes only whole workspaces. Nothing was closed. Close the pane in Herdr.`,
    }
  }

  const ref: ClosureRef =
    item.backend === 'herdr'
      ? { backend: 'herdr', id: item.sessionId, title: item.title }
      : { backend: 'tmux', id: item.sessionId, title: item.title }

  return {
    kind: 'ready',
    plan: {
      key: getItemKey(item),
      ref,
      path: item.path,
      units: unitsOf(item),
      warnings: warningsOf(item, ref, inventory),
      revision,
    },
  }
}

function warningKey(warning: CloseWarning): string {
  return warning.kind === 'agent-active'
    ? `${warning.kind}:${warning.name}:${warning.status}`
    : warning.kind
}

function changesBetween(reviewed: CleanupPlan, current: CleanupPlan): string[] {
  const changes: string[] = []

  if (current.ref.title !== reviewed.ref.title) changes.push(`renamed to '${current.ref.title}'`)

  if (current.path !== reviewed.path) changes.push(`its path is now ${current.path}`)

  if (current.units !== reviewed.units && current.units !== undefined) {
    changes.push(`now has ${unitNoun(current.ref, current.units)}`)
  }

  const before = new Set(reviewed.warnings.map(warningKey))
  const added = current.warnings.filter(warning => !before.has(warningKey(warning)))

  for (const warning of added) changes.push(`new warning: ${describeWarning(warning)}`)

  return changes
}

// Re-projects the reviewed target from the inventory on screen now. Anything that changed what
// the user saw (name, path, scope, new warnings) or a vanished target stops the close.
function recheck(plan: CleanupPlan, inventory: readonly Item[], revision: number): CleanupCheck {
  const noun = nounOf(plan.ref)

  const refreshed =
    revision === plan.revision ? '' : ' The list was refreshed after you reviewed it.'

  const item = inventory.find(entry => getItemKey(entry) === plan.key)

  if (!item) {
    return {
      kind: 'changed',
      message: `Did not close ${noun} '${plan.ref.title}': '${plan.ref.title}' is no longer listed.${refreshed} Nothing was closed.`,
    }
  }

  const current = review(item, inventory, revision)

  if (current.kind === 'refused') return { kind: 'changed', message: current.reason }

  const changes = changesBetween(plan, current.plan)

  if (changes.length > 0) {
    return {
      kind: 'changed',
      message: `Did not close ${noun} '${plan.ref.title}': it changed since you reviewed it (${changes.join('; ')}). Nothing was closed. Press d to review it again.`,
    }
  }

  return { kind: 'confirmed', plan }
}

function describeWarning(warning: CloseWarning): string {
  switch (warning.kind) {
    case 'in-use':
      return 'Attached: a client is using it now'
    case 'pinned':
      return 'Pinned: you marked it to keep'
    case 'agent-active':
      return warning.status === 'working'
        ? `Agent working in '${warning.name}'`
        : `Agent in '${warning.name}' is waiting for input`
  }
}

function title(plan: CleanupPlan): string {
  const kind = plan.ref.backend === 'herdr' ? 'Herdr workspace' : 'tmux session'

  return `Close ${kind} '${plan.ref.title}'?`
}

function scope(plan: CleanupPlan): string {
  if (plan.units === undefined) return `Closes this ${nounOf(plan.ref)} and every pane in it`

  return `Closes ${unitNoun(plan.ref, plan.units)} and ${plan.units === 1 ? 'its' : 'their'} panes`
}

export const CleanupPlan = { review, recheck, describeWarning, title, scope, nounOf } as const
