import { Result } from 'effect'
import type { Item, Config } from '../types'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey, getWorkspaceRef, isLiveSessionItem } from '../multiplexer/items'
import { getLastSessionTarget } from '../tmux/workflows'
import { isFileItem } from '../files/target'
import { CommandInterrupted, CommandTimeoutError } from '../multiplexer/command'
import { isBackendFailure } from '../multiplexer/failure'
import { handoffOf } from '../multiplexer/focus-outcome'
import type { WorkspaceRef } from '../multiplexer/types'
import { executeLaunchPlan, launchIntentFor, prepareLaunch } from '../sessions/launch-plan'
import { isGitHubURL, cloneGitHubRepo } from '../util/github'
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

function getKillNeighbor(item: Item, regularSessions: Item[]): Item | undefined {
  const sessions = regularSessions.filter(isLiveSessionItem)
  const index = sessions.findIndex(session => getItemKey(session) === getItemKey(item))

  if (index < 0) return undefined

  return sessions[index - 1] ?? sessions[index + 1]
}

interface FocusRestoreFailure {
  readonly title: string
  readonly reason: string
}

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown error'
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

export async function handleKillSession(
  item: Item,
  backend: MultiplexerBackend,
  callbacks: {
    onSuccess: (message: string) => void
    onError: (message: string) => void
    refreshItems: () => Promise<void>
    regularSessions: Item[]
    rememberedSessions: (key: string | null) => void
  }
) {
  if (!isLiveSessionItem(item)) {
    callbacks.onError('Select a live session to close.')

    return
  }

  const noun = backend.kind === 'herdr' ? 'workspace' : 'session'
  const target = getWorkspaceRef(item)
  const neighbor = getKillNeighbor(item, callbacks.regularSessions)
  const prior = await backend.current().catch(() => undefined)
  const wasCurrent = prior !== undefined && prior.id === target.id

  try {
    await backend.close(target)
  } catch (cause) {
    // An unfinished close may or may not have happened: reconcile with fresh inventory, never replay.
    if (cause instanceof CommandTimeoutError || cause instanceof CommandInterrupted) {
      callbacks.onError(
        `Closing ${noun} '${item.title}' did not finish: ${cause.message} It may already be closed; the list was refreshed, so check it before trying again.`
      )
      await callbacks.refreshItems()

      return
    }

    if (!isBackendFailure(cause)) throw cause

    callbacks.onError(
      `Could not close ${noun} '${item.title}': ${cause.message} Nothing was closed.`
    )

    return
  }

  callbacks.rememberedSessions(neighbor ? getItemKey(neighbor) : null)

  const wanted = wasCurrent
    ? neighbor && isLiveSessionItem(neighbor)
      ? getWorkspaceRef(neighbor)
      : undefined
    : prior

  const restoreFailure = await restoreFocusAfterClose(backend, wanted)
  const closed = `${noun === 'workspace' ? 'Workspace' : 'Session'} '${item.title}' closed`

  if (restoreFailure) {
    callbacks.onError(
      `${closed}, but focus could not return to '${restoreFailure.title}': ${restoreFailure.reason}`
    )
  } else {
    callbacks.onSuccess(closed)
  }

  await callbacks.refreshItems()
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

export async function handleNewSessionSubmit(
  searchTerm: string,
  config: Config | null,
  items: Item[],
  cursor: number,
  backend: MultiplexerBackend,
  invocationCwd: string,
  sessionItems: Item[]
): Promise<void> {
  if (isGitHubURL(searchTerm)) {
    try {
      if (!config) return
      const clonedPath = await cloneGitHubRepo(searchTerm, config)
      await openProjectSession(clonedPath, config, backend)
    } catch (error) {
      throw new Error(`Could not clone the repository: ${reasonOf(error)}`, { cause: error })
    }

    return
  }

  const intent = launchIntentFor(searchTerm, items[cursor])

  if (!intent) return

  const plan = await prepareLaunch(intent, {
    config: requireConfig(config),
    backend: backend.kind,
    invocationCwd,
    liveSessions: sessionItems,
  })

  // Plan failures are expected and shown by the caller; nothing was opened or created.
  if (Result.isFailure(plan)) throw plan.failure

  const outcome = await executeLaunchPlan(plan.success, backend)
  await requestShutdown(0, handoffOf(outcome.focus))
}

export async function handleLastSession(items: Item[], backend: MultiplexerBackend) {
  if (!backend.capabilities.previousWorkspace) {
    throw new Error(
      'Previous workspace is unavailable because Herdr does not expose workspace activity history'
    )
  }

  const currentSessionName = (await backend.current().catch(() => undefined))?.title
  const target = getLastSessionTarget(items, currentSessionName)

  if (!target) {
    throw new Error('No previous tmux session is available')
  }

  if (!isLiveSessionItem(target)) throw new Error('No previous live session is available')
  await requestShutdown(0, handoffOf(await backend.open(getWorkspaceRef(target))))
}

export async function handleRootSession(
  item: Item | undefined,
  config: Config | null,
  backend: MultiplexerBackend
) {
  if (!item) {
    throw new Error('No session or project is selected')
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
