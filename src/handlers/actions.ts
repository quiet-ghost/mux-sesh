import { spawn } from 'bun'
import type { Item, Config } from '../types'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey, getWorkspaceRef, isLiveSessionItem } from '../multiplexer/items'
import { getLastSessionTarget } from '../tmux/workflows'
import { isFileItem, resolveTypedPathTarget } from '../files/target'
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
    await backend.open(getWorkspaceRef(item))
    await requestShutdown(0)
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
  let closed = false

  try {
    if (!isLiveSessionItem(item)) throw new Error('Select a live session to close')

    const target = getWorkspaceRef(item)
    const neighbor = getKillNeighbor(item, callbacks.regularSessions)
    const prior = await backend.current().catch(() => undefined)
    const wasCurrent = prior !== undefined && prior.id === target.id

    await backend.close(target)
    closed = true

    callbacks.rememberedSessions(neighbor ? getItemKey(neighbor) : null)

    if (!wasCurrent && prior) {
      const now = await backend.current().catch(() => undefined)
      if (!now || now.id !== prior.id) {
        await backend.open(prior)
      }
    } else if (wasCurrent && neighbor && isLiveSessionItem(neighbor)) {
      const preferred = getWorkspaceRef(neighbor)
      const now = await backend.current().catch(() => undefined)
      if (!now || now.id !== preferred.id) {
        await backend.open(preferred)
      }
    }

    callbacks.onSuccess(
      `${backend.kind === 'herdr' ? 'Workspace' : 'Session'} '${item.title}' closed`
    )
  } catch (error) {
    callbacks.onError(`Error killing session: ${error}`)
  } finally {
    if (closed) {
      await callbacks.refreshItems().catch(() => {})
    }
  }
}

export async function handleRenameSubmit(
  renameTarget: Item,
  newName: string,
  backend: MultiplexerBackend,
  callbacks: {
    onSuccess: (message: string) => void
    onError: (message: string) => void
    refreshItems: () => Promise<void>
  }
) {
  if (!isLiveSessionItem(renameTarget)) return
  const nextSessionName = getNextSessionName(renameTarget.title, newName)
  if (!nextSessionName) {
    return
  }

  try {
    await backend.rename(getWorkspaceRef(renameTarget), nextSessionName)
    callbacks.onSuccess(
      `${backend.kind === 'herdr' ? 'Workspace' : 'Session'} renamed to '${nextSessionName}'`
    )
    await callbacks.refreshItems()
  } catch (error) {
    callbacks.onError(`Error renaming session: ${error}`)
  }
}

export async function handleNewSessionSubmit(
  searchTerm: string,
  config: Config | null,
  items: Item[],
  cursor: number,
  backend: MultiplexerBackend
) {
  if (!searchTerm) return

  if (isGitHubURL(searchTerm)) {
    try {
      if (!config) return
      const clonedPath = await cloneGitHubRepo(searchTerm, config)
      await openProjectSession(clonedPath, config, backend)
    } catch (error) {
      throw new Error(`Error cloning repository: ${error}`)
    }
    return
  }

  const typedTarget = await resolveTypedPathTarget(searchTerm)
  if (typedTarget) {
    if (typedTarget.kind === 'file') {
      await openFileSession(typedTarget.path, requireConfig(config), backend)
      return
    }

    await openProjectSession(typedTarget.path, requireConfig(config), backend)
    return
  }

  if (items.length > 0 && cursor < items.length) {
    const selectedItem = items[cursor]
    if (isFileItem(selectedItem)) {
      await openFileSession(selectedItem.path, requireConfig(config), backend)
      return
    }

    await openProjectSession(selectedItem.path, requireConfig(config), backend)
    return
  }

  await backend.openOrCreate({ title: searchTerm, path: process.cwd() })
  await requestShutdown(0)
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
  await backend.open(getWorkspaceRef(target))
  await requestShutdown(0)
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

  spawn(['sh', '-lc', command], {
    cwd: configuredItem.path,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  await requestShutdown(0)
}
