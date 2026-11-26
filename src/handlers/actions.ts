import * as Result from 'effect/Result'
import type { Item, Config } from '../types'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey, getWorkspaceRef, isLiveSessionItem } from '../multiplexer/items'
import { getLastSessionTarget } from '../tmux/workflows'
import { isFileItem } from '../files/target'
import { isBackendFailure } from '../multiplexer/failure'
import {
  ActionOutcome,
  ActionRefused,
  isExpectedActionFailure,
  isUncertainMutationFailure,
  reasonOf,
} from '../app/action-outcome'
import { handoffOf } from '../multiplexer/focus-outcome'
import type { BackendKind, WorkspaceRef } from '../multiplexer/types'
import {
  CleanupBatch,
  CloseReceipt,
  type CloseResult,
  type FocusRestore,
  type PickerHost,
} from '../sessions/cleanup-batch'
import { CleanupPlan } from '../sessions/cleanup-plan'
import {
  CloneDestinationRefused,
  executeCheckout,
  type CheckoutFailure,
  type CheckoutReceipt,
  type ClonePlan,
  type CloneServices,
} from '../sessions/clone-plan'
import {
  executeLaunchPlan,
  LaunchFollowUpFailed,
  type LaunchOutcome,
  type LaunchPlan,
  type LaunchPreview,
  type PlannedLaunch,
  type SessionPlan,
} from '../sessions/launch-plan'
import { gitHubRepositoryName } from '../util/github'
import { toHomeRelativePath } from '../util/path-display'
import { requestShutdown } from '../util/shutdown'
import {
  buildEditorCommand,
  getNextSessionName,
  getRootSessionPath,
  openFileSession,
  openProjectSession,
  requireConfig,
  requireConfiguredItem,
} from './action-helpers'

export async function handleSelect(item: Item, config: Config | null, backend: MultiplexerBackend) {
  if (isLiveSessionItem(item)) {
    await requestShutdown(0, handoffOf(await backend.open(getWorkspaceRef(item))))

    return
  }

  if (isFileItem(item)) {
    await openFileSession(item.path, requireConfig(config), backend)

    return
  }

  await openProjectSession(item.path, requireConfig(config), backend)
}

function getKillNeighbor(key: string, regularSessions: Item[]): Item | undefined {
  const sessions = regularSessions.filter(isLiveSessionItem)
  const index = sessions.findIndex(session => getItemKey(session) === key)

  if (index < 0) return undefined

  return sessions[index - 1] ?? sessions[index + 1]
}

interface FocusRestoreFailure {
  readonly title: string
  readonly reason: string
}

// Restoring focus after a close is a follow-up: it never attaches, and its failure does not undo the close.
async function restoreFocusAfterClose(
  backend: MultiplexerBackend,
  wanted: WorkspaceRef | undefined
): Promise<FocusRestoreFailure | undefined> {
  if (!wanted) return undefined

  try {
    const now = await backend.current().catch(() => undefined)

    if (!now || now.id !== wanted.id) await backend.open(wanted)

    return undefined
  } catch (cause) {
    return { title: wanted.title, reason: reasonOf(cause) }
  }
}

export interface CloseCallbacks {
  refreshItems: () => Promise<void>
  regularSessions: Item[]
  rememberedSessions: (key: string | null) => void
}

// Closes the reviewed ref and nothing else: no files, worktrees, branches or other targets.
export async function handleKillSession(
  plan: CleanupPlan,
  backend: MultiplexerBackend,
  callbacks: CloseCallbacks
): Promise<ActionOutcome> {
  const target = plan.ref
  const noun = CleanupPlan.nounOf(target)

  if (target.backend !== backend.kind) {
    return {
      kind: 'failed',
      message: `Did not close ${noun} '${target.title}': it belongs to ${target.backend}, but mux-sesh is using ${backend.kind}. Nothing was closed.`,
    }
  }

  const neighbor = getKillNeighbor(plan.key, callbacks.regularSessions)
  const prior = await backend.current().catch(() => undefined)
  const wasCurrent = prior !== undefined && prior.id === target.id

  try {
    await backend.close(target)
  } catch (cause) {
    // An unfinished close may or may not have happened: reconcile with fresh inventory, never replay.
    if (isUncertainMutationFailure(cause)) {
      await callbacks.refreshItems()

      return {
        kind: 'unknown',
        title: `Closing ${noun} '${target.title}' did not finish`,
        completed: [],
        attempted: `Close ${noun} '${target.title}'`,
        reason: reasonOf(cause),
        next: `It may already be closed. The list was refreshed; check it before closing again. Nothing else was closed.`,
      }
    }

    if (!isBackendFailure(cause)) throw cause

    return {
      kind: 'failed',
      message: `Could not close ${noun} '${target.title}': ${cause.message} Nothing was closed.`,
    }
  }

  callbacks.rememberedSessions(neighbor ? getItemKey(neighbor) : null)

  const wanted = wasCurrent
    ? neighbor && isLiveSessionItem(neighbor)
      ? getWorkspaceRef(neighbor)
      : undefined
    : prior

  const restoreFailure = await restoreFocusAfterClose(backend, wanted)
  await callbacks.refreshItems()

  const closed = `${capitalized(noun)} '${target.title}' closed`

  if (!restoreFailure) return { kind: 'completed', message: closed }

  return {
    kind: 'partial',
    title: `${closed}, but focus did not return`,
    completed: [`Closed ${noun} '${target.title}'`],
    failed: `Returning focus to '${restoreFailure.title}': ${restoreFailure.reason}`,
    next: `Nothing else was closed. Pick a ${noun} from the list to continue.`,
    retry: { kind: 'none' },
  }
}

export interface BatchCloseCallbacks {
  // The inventory on screen when the batch was confirmed, and its revision.
  readonly sessionItems: readonly Item[]
  readonly revision: number
  // Reads and publishes the session list again; undefined when it could not be read.
  readonly reloadSessions: () => Promise<readonly Item[] | undefined>
}

export type BatchCloseOutcome =
  | { readonly kind: 'completed'; readonly message: string }
  | { readonly kind: 'receipt'; readonly receipt: CloseReceipt }
  | { readonly kind: 'failed'; readonly message: string }

interface CurrentWorkspace {
  readonly host: PickerHost
  readonly ref: WorkspaceRef | undefined
}

async function currentWorkspace(
  backend: MultiplexerBackend,
  fallback: PickerHost
): Promise<CurrentWorkspace> {
  try {
    const ref = await backend.current()

    return { host: { kind: 'known', id: ref?.id }, ref }
  } catch {
    return { host: fallback, ref: undefined }
  }
}

// Closes each plan once, in order, after re-checking it against `inventory`. An unfinished close
// stops the batch: later targets are reported as not attempted instead of piling on more doubt.
async function closeEach(
  plans: readonly CleanupPlan[],
  backend: MultiplexerBackend,
  inventory: readonly Item[],
  revision: number,
  host: PickerHost
): Promise<CloseResult[]> {
  const results: CloseResult[] = []
  let stopped: string | undefined

  for (const plan of plans) {
    const noun = CleanupPlan.nounOf(plan.ref)

    if (stopped) {
      results.push({ kind: 'unattempted', plan, cause: 'stopped', reason: stopped })
      continue
    }

    if (host.kind === 'known' && host.id === plan.ref.id) {
      results.push({
        kind: 'unattempted',
        plan,
        cause: 'picker-host',
        reason: CleanupBatch.hostReason(),
      })
      continue
    }

    if (plan.ref.backend !== backend.kind) {
      results.push({
        kind: 'failed',
        plan,
        reason: `it belongs to ${plan.ref.backend}, but mux-sesh is using ${backend.kind}`,
      })
      continue
    }

    if (!CleanupBatch.isListed(plan, inventory)) {
      results.push({ kind: 'disappeared', plan })
      continue
    }

    const check = CleanupPlan.recheck(plan, inventory, revision)

    if (check.kind === 'changed') {
      results.push({
        kind: 'unattempted',
        plan,
        cause: 'changed',
        reason: 'it changed since you reviewed it; press d to review it again',
      })
      continue
    }

    try {
      await backend.close(plan.ref)
      results.push({ kind: 'closed', plan, via: 'backend' })
    } catch (cause) {
      if (isUncertainMutationFailure(cause)) {
        results.push({ kind: 'unknown', plan, reason: reasonOf(cause) })
        stopped = `stopped after closing ${noun} '${plan.ref.title}' did not finish`
        continue
      }

      if (!isBackendFailure(cause)) throw cause

      results.push({ kind: 'failed', plan, reason: cause.message })
    }
  }

  return results
}

async function restoreFocusOnce(
  backend: MultiplexerBackend,
  results: readonly CloseResult[],
  prior: WorkspaceRef | undefined
): Promise<FocusRestore> {
  if (!results.some(result => result.kind === 'closed')) return { kind: 'kept' }

  const failure = await restoreFocusAfterClose(backend, prior)

  return failure ? { kind: 'failed', ...failure } : { kind: 'kept' }
}

async function settle(
  receipt: CloseReceipt,
  reloadSessions: BatchCloseCallbacks['reloadSessions']
): Promise<BatchCloseOutcome> {
  const fresh = await reloadSessions()
  const settled = fresh ? CloseReceipt.reconcile(receipt, fresh) : receipt

  return CloseReceipt.isComplete(settled)
    ? { kind: 'completed', message: CloseReceipt.completedMessage(settled) }
    : { kind: 'receipt', receipt: settled }
}

// Closes the reviewed batch's stored refs and nothing else, then restores focus and refreshes
// once. Every reviewed target gets a result; unmarked rows are never read as targets.
export async function handleCloseBatch(
  batch: CleanupBatch,
  backend: MultiplexerBackend,
  callbacks: BatchCloseCallbacks
): Promise<BatchCloseOutcome> {
  const current = await currentWorkspace(backend, batch.host)

  const results = await closeEach(
    CleanupBatch.readyPlans(batch),
    backend,
    callbacks.sessionItems,
    callbacks.revision,
    current.host
  )

  const focus = await restoreFocusOnce(backend, results, current.ref)

  return settle(
    { backend: batch.backend, results, refused: CleanupBatch.refusedMembers(batch), focus },
    callbacks.reloadSessions
  )
}

// Reconciles with a fresh list before any mutation, then closes only targets still known to be
// open; a completed close is never repeated.
export async function handleRetryCloseBatch(
  receipt: CloseReceipt,
  backend: MultiplexerBackend,
  callbacks: Pick<BatchCloseCallbacks, 'revision' | 'reloadSessions'>
): Promise<BatchCloseOutcome> {
  const fresh = await callbacks.reloadSessions()

  if (!fresh) {
    return {
      kind: 'failed',
      message:
        'Could not refresh the session list, so nothing was retried and nothing else was closed. Refresh, then press d to review what is still open.',
    }
  }

  const reconciled = CloseReceipt.reconcile(receipt, fresh)

  const current = await currentWorkspace(backend, {
    kind: 'unknown',
    reason: 'the backend did not report its current workspace',
  })

  const retried = await closeEach(
    CloseReceipt.retryable(reconciled),
    backend,
    fresh,
    callbacks.revision,
    current.host
  )

  const focus = await restoreFocusOnce(backend, retried, current.ref)

  return settle(CloseReceipt.merge(reconciled, retried, focus), callbacks.reloadSessions)
}

export type RenameOutcome =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'renamed'; readonly target: WorkspaceRef }
  | { readonly kind: 'failed'; readonly message: string }

export async function handleRenameSubmit(
  renameTarget: Item,
  newName: string,
  backend: MultiplexerBackend
): Promise<RenameOutcome> {
  if (!isLiveSessionItem(renameTarget)) return { kind: 'unchanged' }

  const nextSessionName = getNextSessionName(renameTarget.title, newName)

  if (!nextSessionName) return { kind: 'unchanged' }

  try {
    return {
      kind: 'renamed',
      target: await backend.rename(getWorkspaceRef(renameTarget), nextSessionName),
    }
  } catch (cause) {
    if (!isBackendFailure(cause)) throw cause

    const noun = backend.kind === 'herdr' ? 'workspace' : 'session'

    return {
      kind: 'failed',
      message: `Could not rename ${noun} '${renameTarget.title}': ${cause.message} The name is unchanged.`,
    }
  }
}

function nounOf(backend: BackendKind): 'workspace' | 'session' {
  return backend === 'herdr' ? 'workspace' : 'session'
}

function capitalized(noun: string): string {
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`
}

// The created session is confirmed, so recovery opens it; startup is never re-run blindly.
function followUpOutcome(failure: LaunchFollowUpFailed, backend: BackendKind): ActionOutcome {
  const noun = nounOf(backend)
  const { workspace } = failure.receipt
  const reason = reasonOf(failure.cause)

  if (failure.step === 'start') {
    return {
      kind: 'partial',
      title: `${capitalized(noun)} created, but its startup command failed`,
      completed: [`Created ${noun} '${workspace.title}'`],
      failed: `Running its startup command: ${reason}`,
      next: `It was kept and will not be created again. The command may not have run. Press Enter to open it without re-running the startup command, or Esc to stay here.`,
      retry: { kind: 'open', target: workspace },
    }
  }

  return {
    kind: 'partial',
    title: `${capitalized(noun)} created, but not opened`,
    completed: [`Created ${noun} '${workspace.title}'`],
    failed: `Opening it: ${reason}`,
    next: `It was kept and will not be created again. Press Enter to try opening it again, or Esc and open it from Sessions.`,
    retry: { kind: 'open', target: workspace },
  }
}

function launchFailureOutcome(
  plan: SessionPlan,
  cause: unknown,
  backend: BackendKind
): ActionOutcome {
  if (cause instanceof LaunchFollowUpFailed) return followUpOutcome(cause, backend)

  if (!isExpectedActionFailure(cause)) throw cause

  const noun = nounOf(backend)

  if (plan.kind === 'focus') {
    return {
      kind: 'failed',
      message: `Could not open ${noun} '${plan.target.title}': ${cause.message} Nothing was created.`,
    }
  }

  const { title, path } = plan.input

  if (isUncertainMutationFailure(cause)) {
    return {
      kind: 'unknown',
      title: `Creating ${noun} '${title}' did not finish`,
      completed: [],
      attempted: `Create ${noun} '${title}' in ${path}`,
      reason: cause.message,
      next: `It may already exist. The list was refreshed; check Sessions before creating it again.`,
    }
  }

  return {
    kind: 'failed',
    message: `Could not create ${noun} '${title}': ${cause.message} Nothing was created.`,
  }
}

async function runPlannedLaunch(
  plan: PlannedLaunch,
  backend: MultiplexerBackend,
  clone: CloneServices
): Promise<ActionOutcome> {
  // Plan failures are expected and local; nothing was opened or created.
  if (Result.isFailure(plan)) return { kind: 'failed', message: plan.failure.message }

  return runLaunchPlan(plan.success, backend, clone)
}

async function runSessionPlan(
  plan: SessionPlan,
  backend: MultiplexerBackend
): Promise<ActionOutcome> {
  let outcome: LaunchOutcome

  try {
    outcome = await executeLaunchPlan(plan, backend)
  } catch (cause) {
    return launchFailureOutcome(plan, cause, backend.kind)
  }

  return requestShutdown(0, handoffOf(outcome.focus))
}

async function runLaunchPlan(
  plan: LaunchPlan,
  backend: MultiplexerBackend,
  clone: CloneServices
): Promise<ActionOutcome> {
  return plan.kind === 'clone'
    ? launchClone(plan.clone, plan.session, backend, clone)
    : runSessionPlan(plan, backend)
}

function receiptFact(receipt: CheckoutReceipt): string {
  const name = gitHubRepositoryName(receipt.repository)

  return receipt.kind === 'cloned'
    ? `Cloned ${name} into ${receipt.path}`
    : `Reused the ${name} checkout at ${receipt.path}`
}

function leftInPlace(at: string, name: string): string {
  return `${at} may hold a partial checkout. It was left in place and nothing was deleted; no session was created. Inspect it, or remove it yourself; the next Enter checks it again and refuses to reuse it unless it is a complete checkout of ${name}.`
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`
}

// Nothing is deleted after a failed or unfinished clone; whatever git left is reported, not hidden.
function checkoutFailureOutcome(plan: ClonePlan, failure: CheckoutFailure): ActionOutcome {
  const name = gitHubRepositoryName(plan.repository)
  const at = toHomeRelativePath(plan.destination)

  switch (failure.kind) {
    case 'changed':
      return {
        kind: 'failed',
        message:
          failure.destination.kind === 'refused'
            ? new CloneDestinationRefused({
                repository: plan.repository,
                destination: plan.destination,
                refusal: failure.destination.refusal,
              }).message
            : `${at} changed after the plan was shown (it is now ${failure.destination.kind === 'absent' ? 'missing' : 'a checkout'}), so nothing was cloned or created. Press Enter again to review the new plan.`,
      }
    case 'failed':
      if (!failure.left) {
        return {
          kind: 'failed',
          message: `Could not clone ${name}: ${sentence(failure.reason)} Nothing is at ${at} and no session was created.`,
        }
      }

      return {
        kind: 'unknown',
        title: `Cloning ${name} failed and left files behind`,
        completed: [],
        attempted: `Clone ${name} into ${plan.destination}`,
        reason: failure.reason,
        next: leftInPlace(at, name),
      }
    case 'unknown':
      return {
        kind: 'unknown',
        title: `Cloning ${name} did not finish`,
        completed: [],
        attempted: `Clone ${name} into ${plan.destination}`,
        reason: failure.reason,
        next: failure.left
          ? leftInPlace(at, name)
          : `Nothing is at ${at} now and no session was created. Press Enter again to plan the clone afresh.`,
      }
  }
}

// The checkout is kept whatever happens to the session after it, and is never cloned again: a
// later Enter on the same URL verifies and reuses it.
function afterCheckout(receipt: CheckoutReceipt, outcome: ActionOutcome): ActionOutcome {
  const fact = receiptFact(receipt)
  const kept = `The checkout at ${receipt.path} was kept and will not be cloned again.`

  switch (outcome.kind) {
    case 'completed':
      return outcome
    case 'failed':
      return ActionOutcome.after(
        fact,
        outcome,
        `${gitHubRepositoryName(receipt.repository)} is ready, but its session did not open`,
        `${kept} Press Enter on the same URL to reuse it, or pick it on the New screen.`
      )
    case 'partial':
    case 'unknown':
      return {
        ...outcome,
        completed: [fact, ...outcome.completed],
        next: `${outcome.next} ${kept}`,
      }
  }
}

async function launchClone(
  plan: ClonePlan,
  session: SessionPlan,
  backend: MultiplexerBackend,
  clone: CloneServices
): Promise<ActionOutcome> {
  const checkout = await executeCheckout(plan, clone)

  if (Result.isFailure(checkout)) return checkoutFailureOutcome(plan, checkout.failure)

  return afterCheckout(checkout.success, await runSessionPlan(session, backend))
}

// Enter runs the plan the New screen shows; it never re-resolves rules or inventory first.
export async function handleNewSessionSubmit(
  preview: LaunchPreview,
  backend: MultiplexerBackend,
  clone: CloneServices
): Promise<ActionOutcome> {
  switch (preview.kind) {
    case 'inactive':
      return { kind: 'failed', message: 'New session is still loading; nothing was opened.' }
    case 'no-candidates':
      return {
        kind: 'failed',
        message:
          'Nothing to open: no projects are configured or discovered yet. Type a path to open one.',
      }
    case 'no-match':
      return {
        kind: 'failed',
        message: `Nothing to open: no project matches '${preview.query}', and nothing was created. Type a path, or clear the query to pick a project.`,
      }
    case 'name-required':
      return {
        kind: 'failed',
        message: `Nothing was created: type a name for the new session in ${preview.directory} first, or press esc to go back.`,
      }
    case 'file-prompt':
      return {
        kind: 'failed',
        message: 'Nothing to open: type a file name or a file path first, or press esc to go back.',
      }
    case 'file-searching':
      return {
        kind: 'failed',
        message: `Nothing was opened: files matching '${preview.query}' are still being searched. Press Enter again once a file is highlighted.`,
      }
    case 'file-unavailable':
      return {
        kind: 'failed',
        message: `${preview.reason} Nothing was opened; type a file path, or press esc to pick a project.`,
      }
    case 'no-file-match':
      return {
        kind: 'failed',
        message: `Nothing to open: no file matches '${preview.query}', and nothing was created.`,
      }
    case 'planning':
      return runPlannedLaunch((await preview.prepared).result, backend, clone)
    case 'refused':
      return { kind: 'failed', message: preview.failure.message }
    case 'ready':
      return runLaunchPlan(preview.plan, backend, clone)
  }
}

export async function handleLastSession(items: Item[], backend: MultiplexerBackend) {
  if (!backend.capabilities.previousWorkspace) {
    throw new ActionRefused({
      reason:
        'Previous workspace is unavailable because Herdr does not expose workspace activity history',
    })
  }

  const currentSessionName = (await backend.current().catch(() => undefined))?.title
  const target = getLastSessionTarget(items, currentSessionName)

  if (!target) {
    throw new ActionRefused({ reason: 'No previous tmux session is available' })
  }

  if (!isLiveSessionItem(target))
    throw new ActionRefused({ reason: 'No previous live session is available' })
  await requestShutdown(0, handoffOf(await backend.open(getWorkspaceRef(target))))
}

export async function handleRootSession(
  item: Item | undefined,
  config: Config | null,
  backend: MultiplexerBackend
) {
  if (!item) {
    throw new ActionRefused({ reason: 'No session or project is selected' })
  }

  await openProjectSession(await getRootSessionPath(item, backend), requireConfig(config), backend)
}

export async function handleEditTarget(
  item: Item | undefined,
  config: Config | null,
  backend: MultiplexerBackend
) {
  const configuredItem = requireConfiguredItem(item)
  const loadedConfig = requireConfig(config)
  const command = buildEditorCommand(loadedConfig.editor, configuredItem.path)

  if (await backend.openEditor(configuredItem.path, command)) {
    await requestShutdown(0)

    return
  }

  await requestShutdown(0, {
    command: ['sh', '-lc', command],
    cwd: configuredItem.path,
    description: `open the editor in ${configuredItem.path}`,
  })
}
