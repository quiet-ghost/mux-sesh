import { getItemKey, isLiveSessionItem } from '../multiplexer/items'
import { workspaceNoun, type BackendKind } from '../multiplexer/types'
import type { Item } from '../items/item'
import { plural } from '../util/plural'
import { CleanupPlan } from './cleanup-plan'

// Which workspace runs this picker. A batch never closes it: the picker would end before it
// could report the rest. Unknown means the backend could not say, so the review warns instead.
export type PickerHost =
  | { readonly kind: 'known'; readonly id: string | undefined }
  | { readonly kind: 'unknown'; readonly reason: string }

export interface RefusedMember {
  readonly key: string
  readonly title: string
  readonly reason: string
}

export type BatchMember =
  | { readonly kind: 'ready'; readonly plan: CleanupPlan }
  | ({ readonly kind: 'refused' } & RefusedMember)

// The exact set the user reviewed. Confirming closes only its ready plans, in this order.
export interface CleanupBatch {
  readonly backend: BackendKind
  readonly members: readonly BatchMember[]
  readonly host: PickerHost
  readonly revision: number
}

export type BatchReview =
  | { readonly kind: 'ready'; readonly batch: CleanupBatch }
  | { readonly kind: 'refused'; readonly reason: string }

// Why a reviewed target was not attempted. Only a stopped batch is safe to retry as is.
export type UnattemptedCause = 'stopped' | 'changed' | 'picker-host'

export type CloseResult =
  | { readonly kind: 'closed'; readonly plan: CleanupPlan; readonly via: 'backend' | 'refresh' }
  | { readonly kind: 'failed'; readonly plan: CleanupPlan; readonly reason: string }
  | { readonly kind: 'disappeared'; readonly plan: CleanupPlan }
  | { readonly kind: 'unknown'; readonly plan: CleanupPlan; readonly reason: string }
  | {
      readonly kind: 'unattempted'
      readonly plan: CleanupPlan
      readonly cause: UnattemptedCause
      readonly reason: string
    }

export type FocusRestore =
  | { readonly kind: 'kept' }
  | { readonly kind: 'failed'; readonly title: string; readonly reason: string }

export interface CloseReceipt {
  readonly backend: BackendKind
  readonly results: readonly CloseResult[]
  readonly refused: readonly RefusedMember[]
  readonly focus: FocusRestore
}

function hostReason(): string {
  return 'it hosts this picker; closing it would end mux-sesh before it could report the batch. Close it on its own with d.'
}

function refusalOf(item: Item, inventory: readonly Item[], host: PickerHost): string | undefined {
  if (!isLiveSessionItem(item)) {
    return item.linkedSessionName
      ? `it is a project, and closing it would also close its linked session '${item.linkedSessionName}'. That session stays open; mark it to close it.`
      : 'it is not a live session, so there is nothing to close.'
  }

  if (!inventory.some(entry => getItemKey(entry) === getItemKey(item))) {
    return 'it is no longer listed.'
  }

  if (item.target) {
    return `it is an agent pane, and mux-sesh closes only whole workspaces. Its workspace '${item.workspaceTitle ?? item.sessionId}' stays open; close the pane in Herdr.`
  }

  if (host.kind === 'known' && host.id === item.sessionId) return hostReason()

  return undefined
}

function memberOf(
  marked: Item,
  inventory: readonly Item[],
  revision: number,
  host: PickerHost
): BatchMember {
  const key = getItemKey(marked)
  const item = inventory.find(entry => getItemKey(entry) === key) ?? marked
  const refusal = refusalOf(item, inventory, host)

  if (refusal) return { kind: 'refused', key, title: item.title, reason: refusal }

  const review = CleanupPlan.review(item, inventory, revision)

  return review.kind === 'ready'
    ? { kind: 'ready', plan: review.plan }
    : { kind: 'refused', key, title: item.title, reason: review.reason }
}

// Projects every marked row against the inventory on screen. Refused members are kept so the
// review and the receipt can say why each was left alone.
function review(
  marked: readonly Item[],
  inventory: readonly Item[],
  revision: number,
  host: PickerHost
): BatchReview {
  const members = marked.map(item => memberOf(item, inventory, revision, host))
  const ready = members.flatMap(member => (member.kind === 'ready' ? [member.plan] : []))
  const first = ready[0]

  if (!first) {
    const reasons = members.map(member =>
      member.kind === 'refused' ? `'${member.title}': ${member.reason}` : ''
    )

    return {
      kind: 'refused',
      reason: `Nothing to close. ${reasons.join(' ')} Nothing was closed.`,
    }
  }

  return { kind: 'ready', batch: { backend: first.ref.backend, members, host, revision } }
}

function readyPlans(batch: CleanupBatch): CleanupPlan[] {
  return batch.members.flatMap(member => (member.kind === 'ready' ? [member.plan] : []))
}

function refusedMembers(batch: CleanupBatch): RefusedMember[] {
  return batch.members.flatMap(member =>
    member.kind === 'refused'
      ? [{ key: member.key, title: member.title, reason: member.reason }]
      : []
  )
}

function title(batch: CleanupBatch): string {
  const kind = batch.backend === 'herdr' ? 'Herdr workspace' : 'tmux session'

  return `Close ${plural(readyPlans(batch).length, `marked ${kind}`)}?`
}

function hostWarning(batch: CleanupBatch): string | undefined {
  if (batch.host.kind === 'known') return undefined

  return `Could not tell which ${workspaceNoun(batch.backend)} hosts this picker (${batch.host.reason}). If one of these does, closing it ends mux-sesh.`
}

function refusedLine(member: RefusedMember): string {
  return `✗ Not closing '${member.title}': ${member.reason}`
}

function isListed(plan: CleanupPlan, inventory: readonly Item[]): boolean {
  return inventory.some(entry => getItemKey(entry) === plan.key)
}

// A fresh list settles what an unfinished or failed close left behind: a target that is gone
// was closed (or vanished), so it is never closed again.
function reconcile(receipt: CloseReceipt, inventory: readonly Item[]): CloseReceipt {
  const results = receipt.results.map((result): CloseResult => {
    if (isListed(result.plan, inventory)) return result

    switch (result.kind) {
      case 'unknown':
        return { kind: 'closed', plan: result.plan, via: 'refresh' }
      case 'failed':
      case 'unattempted':
        return { kind: 'disappeared', plan: result.plan }
      case 'closed':
      case 'disappeared':
        return result
    }
  })

  return { ...receipt, results }
}

// Still listed after reconciliation means not closed, so only these may be closed again.
function isRetryable(result: CloseResult): boolean {
  switch (result.kind) {
    case 'failed':
    case 'unknown':
      return true
    case 'unattempted':
      return result.cause === 'stopped'
    case 'closed':
    case 'disappeared':
      return false
  }
}

function retryable(receipt: CloseReceipt): CleanupPlan[] {
  return receipt.results.filter(isRetryable).map(result => result.plan)
}

// Replaces only the retried targets' results; completed closes and refusals are kept as they were.
function merge(
  receipt: CloseReceipt,
  retried: readonly CloseResult[],
  focus: FocusRestore
): CloseReceipt {
  const byKey = new Map(retried.map(result => [result.plan.key, result]))

  return {
    ...receipt,
    results: receipt.results.map(result => byKey.get(result.plan.key) ?? result),
    focus,
  }
}

function isComplete(receipt: CloseReceipt): boolean {
  return (
    receipt.refused.length === 0 &&
    receipt.focus.kind === 'kept' &&
    receipt.results.every(result => result.kind === 'closed')
  )
}

function completedMessage(receipt: CloseReceipt): string {
  const names = receipt.results.map(result => `'${result.plan.ref.title}'`).join(', ')

  return `Closed ${plural(receipt.results.length, workspaceNoun(receipt.backend))}: ${names}`
}

function resultLine(result: CloseResult, backend: BackendKind): string {
  const noun = workspaceNoun(backend)
  const name = `${noun} '${result.plan.ref.title}'`

  switch (result.kind) {
    case 'closed':
      return `✓ Closed ${name}${result.via === 'refresh' ? ' (confirmed by refresh)' : ''}`
    case 'failed':
      return `✗ Could not close ${name}: ${result.reason}`
    case 'disappeared':
      return `– ${name} disappeared before mux-sesh closed it`
    case 'unknown':
      return `? Closing ${name} did not finish: ${result.reason}`
    case 'unattempted':
      return `· Not attempted: ${name} (${result.reason})`
  }
}

function receiptTitle(receipt: CloseReceipt): string {
  const closed = receipt.results.filter(result => result.kind === 'closed').length
  const total = receipt.results.length + receipt.refused.length

  return `Closed ${closed} of ${plural(total, `marked ${workspaceNoun(receipt.backend)}`)}`
}

function lines(receipt: CloseReceipt): string[] {
  const focus =
    receipt.focus.kind === 'failed'
      ? [`✗ Returning focus to '${receipt.focus.title}': ${receipt.focus.reason}`]
      : []

  return [
    ...receipt.results.map(result => resultLine(result, receipt.backend)),
    ...receipt.refused.map(refusedLine),
    ...focus,
  ]
}

function next(receipt: CloseReceipt): string {
  const count = retryable(receipt).length
  const kept = 'Nothing else was closed. No files, worktrees or branches were deleted.'

  if (count === 0) return `${kept} Press d to review anything still open again.`

  return `${kept} Enter retries ${count}: the list is refreshed first, unfinished closes are checked, and completed closes are never repeated.`
}

export const CleanupBatch = {
  review,
  readyPlans,
  refusedMembers,
  title,
  hostWarning,
  refusedLine,
  hostReason,
  isListed,
} as const

export const CloseReceipt = {
  reconcile,
  retryable,
  merge,
  isComplete,
  completedMessage,
  title: receiptTitle,
  lines,
  next,
} as const
