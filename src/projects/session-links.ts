import { resolve } from 'path'
import type { Config, Item } from '../types'
import { isLiveSessionItem } from '../multiplexer/items'
import { resolveProjectSession } from '../config/session-rules'
import { buildFileSessionName, isFileItem, resolveFileSession } from '../files/target'

export async function annotateProjectItemsWithSessionLinks(
  projectItems: Item[],
  liveSessions: Item[],
  config: Config
): Promise<Item[]> {
  return Promise.all(
    projectItems.map(async projectItem => {
      const sessionName = isFileItem(projectItem)
        ? buildFileSessionName(projectItem.path)
        : (await resolveProjectSession(projectItem.path, config)).sessionName
      const sessionPath = isFileItem(projectItem)
        ? resolveFileSession(projectItem.path, config).cwd
        : projectItem.path
      const liveItems = liveSessions.filter(session => session.isSession)
      const pathMatches = liveItems.filter(
        session =>
          session.title === sessionName &&
          session.path &&
          resolve(session.path) === resolve(sessionPath)
      )
      const titleMatches = liveItems.filter(session => session.title === sessionName)
      const linkedSession =
        pathMatches[0] ?? (titleMatches.length === 1 ? titleMatches[0] : undefined)

      if (!linkedSession) {
        return {
          ...projectItem,
          linkedSessionName: undefined,
          linkedSessionId: undefined,
          linkedSessionBackend: undefined,
          linkedSessionAttached: undefined,
        }
      }

      return {
        ...projectItem,
        linkedSessionName: linkedSession.title,
        linkedSessionId: isLiveSessionItem(linkedSession)
          ? linkedSession.sessionId
          : linkedSession.title,
        linkedSessionBackend: isLiveSessionItem(linkedSession) ? linkedSession.backend : 'tmux',
        linkedSessionAttached: linkedSession.isAttached,
      }
    })
  )
}
