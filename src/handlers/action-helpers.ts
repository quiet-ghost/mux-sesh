import { dirname } from 'path'
import type { Config, Item } from '../types'
import { getGitRoot, resolveProjectSession } from '../config/session-rules'
import { isFileItem, resolveFileSession } from '../files/target'
import { createTmuxSession, getTmuxSessionDirectory } from '../tmux'
import { requestShutdown } from '../util/shutdown'

export function quoteShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

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

export async function openProjectSession(projectPath: string, config: Config): Promise<void> {
  const resolvedSession = await resolveProjectSession(projectPath, config)
  await createTmuxSession(resolvedSession.sessionName, projectPath, {
    startupCommand: resolvedSession.startupCommand,
  })
  await requestShutdown(0)
}

export async function openFileSession(filePath: string, config: Config): Promise<void> {
  const resolvedSession = resolveFileSession(filePath, config)
  await createTmuxSession(resolvedSession.sessionName, resolvedSession.cwd, {
    startupCommand: resolvedSession.startupCommand,
  })
  await requestShutdown(0)
}

export async function getRootSessionPath(item: Item): Promise<string> {
  const itemPath = item.isSession ? await getTmuxSessionDirectory(item.title) : item.path
  const searchRoot = !item.isSession && isFileItem(item) ? dirname(itemPath) : itemPath
  return (await getGitRoot(searchRoot)) ?? searchRoot
}
