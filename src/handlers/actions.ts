import { basename } from 'path'
import type { Item, Config } from '../types'
import { switchTmuxSession, createTmuxSession, killTmuxSession, renameTmuxSession, createNamedTmuxSession } from '../tmux/index'
import { isGitHubURL, cloneGitHubRepo } from '../util/github'

export async function handleSelect(item: Item) {
  if (item.isSession) {
    await switchTmuxSession(item.title)
    process.exit(0)
  } else {
    await createTmuxSession(item.title, item.path)
    process.exit(0)
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
      const repoName = basename(clonedPath)
      await createTmuxSession(repoName, clonedPath)
      process.exit(0)
    } catch (error) {
      throw new Error(`Error cloning repository: ${error}`)
    }
  } else if (items.length > 0 && cursor < items.length) {
    const selectedItem = items[cursor]
    await createTmuxSession(selectedItem.title, selectedItem.path)
    process.exit(0)
  } else {
    await createNamedTmuxSession(searchTerm)
    process.exit(0)
  }
}
