import type { Item, Config } from '../types'
import {
  switchTmuxSession,
  createTmuxSession,
  killTmuxSession,
  renameTmuxSession,
  createNamedTmuxSession,
  getCurrentTmuxSessionName,
  getTmuxSessionDirectory,
} from '../tmux/index'
import { getGitRoot, resolveProjectSession } from '../config/session-rules'
import { getLastSessionTarget } from '../tmux/workflows'
import { isGitHubURL, cloneGitHubRepo } from '../util/github'
import { requestShutdown } from '../util/shutdown'

export async function handleSelect(item: Item, config: Config | null) {
  if (item.isSession) {
    await switchTmuxSession(item.title)
    await requestShutdown(0)
  } else {
    if (!config) {
      throw new Error('Config is not loaded yet')
    }

    const resolvedSession = await resolveProjectSession(item.path, config)
    await createTmuxSession(resolvedSession.sessionName, item.path, {
      startupCommand: resolvedSession.startupCommand,
    })
    await requestShutdown(0)
  }
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
  const trimmedName = newName.trim()
  if (trimmedName && trimmedName !== renameTarget) {
    try {
      await renameTmuxSession(renameTarget, trimmedName)
      callbacks.onSuccess(`Session renamed to '${trimmedName}'`)
      await callbacks.refreshItems()
    } catch (error) {
      callbacks.onError(`Error renaming session: ${error}`)
    }
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
      const resolvedSession = await resolveProjectSession(clonedPath, config)
      await createTmuxSession(resolvedSession.sessionName, clonedPath, {
        startupCommand: resolvedSession.startupCommand,
      })
      await requestShutdown(0)
    } catch (error) {
      throw new Error(`Error cloning repository: ${error}`)
    }
  } else if (items.length > 0 && cursor < items.length) {
    const selectedItem = items[cursor]
    if (!config) {
      throw new Error('Config is not loaded yet')
    }

    const resolvedSession = await resolveProjectSession(selectedItem.path, config)
    await createTmuxSession(resolvedSession.sessionName, selectedItem.path, {
      startupCommand: resolvedSession.startupCommand,
    })
    await requestShutdown(0)
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

  if (!config) {
    throw new Error('Config is not loaded yet')
  }

  const itemPath = item.isSession ? await getTmuxSessionDirectory(item.title) : item.path
  const rootPath = (await getGitRoot(itemPath)) ?? itemPath
  const resolvedSession = await resolveProjectSession(rootPath, config)

  await createTmuxSession(resolvedSession.sessionName, rootPath, {
    startupCommand: resolvedSession.startupCommand,
  })
  await requestShutdown(0)
}
