import { dirname } from 'path'
import type { Config, Item } from '../types'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey, getWorkspaceRef, isLiveSessionItem } from '../multiplexer/items'
import { getGitRoot, resolveProjectSession } from '../config/session-rules'
import { isFileItem, resolveFileSession } from '../files/target'
import { requestShutdown } from '../util/shutdown'
import { quoteShellArg } from '../util/shell'

export { quoteShellArg } from '../util/shell'

export function buildEditorCommand(editor: string, path: string): string {
  return `${editor} ${quoteShellArg(path)}`
}

export function requireConfig(config: Config | null): Config {
  if (!config) {
    throw new Error('Config is not loaded yet')
  }

  return config
}

export function requireConfiguredItem(item: Item | undefined): Item {
  if (!item || item.itemKind !== 'configured') {
    throw new Error('Select a configured session to edit its target')
  }

  return item
}

export function getNextSessionName(renameTarget: string, newName: string): string | null {
  const trimmedName = newName.trim()
  if (!trimmedName || trimmedName === renameTarget) {
    return null
  }

  return trimmedName
}

export function getSessionSelectionAfterRemoval(
  regularSessions: Item[],
  removed: Item
): string | null {
  const neighbor = regularSessions.find(session => session.title === removed.title)
  return neighbor ? getItemKey(neighbor) : null
}

export async function openProjectSession(
  projectPath: string,
  config: Config,
  backend: MultiplexerBackend
): Promise<void> {
  const resolvedSession = await resolveProjectSession(projectPath, config)
  await backend.openOrCreate({
    title: resolvedSession.sessionName,
    path: projectPath,
    startupCommand: resolvedSession.startupCommand,
  })
  await requestShutdown(0)
}

export async function openFileSession(
  filePath: string,
  config: Config,
  backend: MultiplexerBackend
): Promise<void> {
  const resolvedSession = resolveFileSession(filePath, config)
  await backend.openOrCreate({
    title: resolvedSession.sessionName,
    path: resolvedSession.cwd,
    startupCommand: resolvedSession.startupCommand,
  })
  await requestShutdown(0)
}

export async function getRootSessionPath(item: Item, backend: MultiplexerBackend): Promise<string> {
  const itemPath = isLiveSessionItem(item)
    ? ((await backend.directory(getWorkspaceRef(item))) ?? item.path)
    : item.path
  const searchRoot = !item.isSession && isFileItem(item) ? dirname(itemPath) : itemPath
  return (await getGitRoot(searchRoot)) ?? searchRoot
}
