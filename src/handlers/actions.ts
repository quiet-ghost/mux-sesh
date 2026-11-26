import { resolve } from 'path'
import { Result } from 'effect'
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
import { CleanupPlan } from '../sessions/cleanup-plan'
import {
  executeLaunchPlan,
  LaunchFollowUpFailed,
  prepareLaunch,
  type LaunchIntent,
  type LaunchOutcome,
  type LaunchPlan,
  type LaunchPreview,
  type PlannedLaunch,
} from '../sessions/launch-plan'
import { cloneGitHubRepo } from '../util/github'
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
  plan: LaunchPlan,
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

interface LaunchInputs {
  readonly config: Config
  readonly backend: MultiplexerBackend
  readonly invocationCwd: string
  readonly sessionItems: Item[]
}

async function launch(intent: LaunchIntent, inputs: LaunchInputs): Promise<ActionOutcome> {
  const plan = await prepareLaunch(intent, {
    config: inputs.config,
    backend: inputs.backend.kind,
    invocationCwd: inputs.invocationCwd,
    liveSessions: inputs.sessionItems,
  })

  return runPlannedLaunch(plan, inputs.backend)
}

async function runPlannedLaunch(
  plan: PlannedLaunch,
  backend: MultiplexerBackend
): Promise<ActionOutcome> {
  // Plan failures are expected and local; nothing was opened or created.
  if (Result.isFailure(plan)) return { kind: 'failed', message: plan.failure.message }

  return runLaunchPlan(plan.success, backend)
}

async function runLaunchPlan(
  plan: LaunchPlan,
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

// A clone (or an existing checkout it reused) is kept whatever happens to the launch after it.
async function launchClone(url: string, inputs: LaunchInputs): Promise<ActionOutcome> {
  let clonedPath: string

  try {
    clonedPath = await cloneGitHubRepo(url, inputs.config)
  } catch (cause) {
    return {
      kind: 'failed',
      message: `Could not clone the repository: ${reasonOf(cause)}. Nothing was opened.`,
    }
  }

  const outcome = await launch({ kind: 'path', input: resolve(clonedPath) }, inputs)

  return ActionOutcome.after(
    `The repository is at ${clonedPath}`,
    outcome,
    'Repository ready, but its session was not opened',
    'The repository was kept and will not be cloned again. Enter the same URL, or pick it on the New screen, to open it.'
  )
}

// Enter runs the plan the New screen shows; it never re-resolves rules or inventory first.
export async function handleNewSessionSubmit(
  preview: LaunchPreview,
  config: Config | null,
  backend: MultiplexerBackend,
  invocationCwd: string,
  sessionItems: Item[]
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
    case 'clone':
      return launchClone(preview.url, {
        config: requireConfig(config),
        backend,
        invocationCwd,
        sessionItems,
      })
    case 'planning':
      return runPlannedLaunch((await preview.prepared).result, backend)
    case 'refused':
      return { kind: 'failed', message: preview.failure.message }
    case 'ready':
      return runLaunchPlan(preview.plan, backend)
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
