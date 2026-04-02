import { spawn } from 'bun'
import type { Item, Config } from '../types'
import {
  switchTmuxSession,
  killTmuxSession,
  renameTmuxSession,
  createNamedTmuxSession,
  getCurrentTmuxSessionName,
} from '../tmux'
import { getLastSessionTarget } from '../tmux/workflows'
import { isGitHubURL, cloneGitHubRepo } from '../util/github'
import { requestShutdown } from '../util/shutdown'
import {
  buildEditorCommand,
  getNextSessionName,
  getRootSessionPath,
  openProjectSession,
  requireConfig,
  requireConfiguredItem,
} from './action-helpers'

export async function handleSelect(item: Item, config: Config | null) {
  if (item.isSession) {
    await switchTmuxSession(item.title)
    await requestShutdown(0)
    return
  }

  await openProjectSession(item.path, requireConfig(config))
}

export async function handleKillSession(
  sessionName: string,
  callbacks: {
    onSuccess: (message: string) => void
    onError: (message: string) => void
    refreshItems: () => Promise<void>
  }
) {
  try {
    await killTmuxSession(sessionName)
    callbacks.onSuccess(`Session '${sessionName}' killed`)
    await callbacks.refreshItems()
  } catch (error) {
    callbacks.onError(`Error killing session: ${error}`)
  }
}

export async function handleRenameSubmit(
  renameTarget: string,
  newName: string,
  callbacks: {
    onSuccess: (message: string) => void
    onError: (message: string) => void
    refreshItems: () => Promise<void>
  }
) {
  const nextSessionName = getNextSessionName(renameTarget, newName)
  if (!nextSessionName) {
    return
  }

  try {
    await renameTmuxSession(renameTarget, nextSessionName)
    callbacks.onSuccess(`Session renamed to '${nextSessionName}'`)
    await callbacks.refreshItems()
  } catch (error) {
    callbacks.onError(`Error renaming session: ${error}`)
  }
}

export async function handleNewSessionSubmit(
  searchTerm: string,
  config: Config | null,
  items: Item[],
  cursor: number
) {
  if (!searchTerm) return

  if (isGitHubURL(searchTerm)) {
    try {
      if (!config) return
      const clonedPath = await cloneGitHubRepo(searchTerm, config)
      await openProjectSession(clonedPath, config)
    } catch (error) {
      throw new Error(`Error cloning repository: ${error}`)
    }
  } else if (items.length > 0 && cursor < items.length) {
    const selectedItem = items[cursor]
    await openProjectSession(selectedItem.path, requireConfig(config))
  } else {
    await createNamedTmuxSession(searchTerm)
    await requestShutdown(0)
  }
}

export async function handleLastSession(items: Item[]) {
  const currentSessionName = await getCurrentTmuxSessionName().catch(() => undefined)
  const target = getLastSessionTarget(items, currentSessionName)

  if (!target) {
    throw new Error('No previous tmux session is available')
  }

  await switchTmuxSession(target.title)
  await requestShutdown(0)
}

export async function handleRootSession(item: Item | undefined, config: Config | null) {
  if (!item) {
    throw new Error('No session or project is selected')
  }

  await openProjectSession(await getRootSessionPath(item), requireConfig(config))
}

export async function handleEditTarget(item: Item | undefined, config: Config | null) {
  const configuredItem = requireConfiguredItem(item)
  const loadedConfig = requireConfig(config)
  const command = buildEditorCommand(loadedConfig.editor, configuredItem.path)

  if (process.env.TMUX) {
    const proc = spawn(['tmux', 'new-window', '-c', configuredItem.path, command], {
      stderr: 'pipe',
    })
    await proc.exited

    if (proc.exitCode !== 0) {
      throw new Error(`Failed to open editor for '${configuredItem.title}'`)
    }

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
