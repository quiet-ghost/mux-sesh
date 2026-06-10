import type { Config, Item } from '../types'
import { resolveProjectSession } from '../config/session-rules'
import { buildFileSessionName, isFileItem } from '../files/target'

export async function annotateProjectItemsWithSessionLinks(
  projectItems: Item[],
  liveSessions: Item[],
  config: Config
): Promise<Item[]> {
  const liveSessionsByTitle = new Map(liveSessions.map(session => [session.title, session]))

  return Promise.all(
    projectItems.map(async projectItem => {
      const sessionName = isFileItem(projectItem)
        ? buildFileSessionName(projectItem.path)
        : (await resolveProjectSession(projectItem.path, config)).sessionName
      const linkedSession = liveSessionsByTitle.get(sessionName)

      if (!linkedSession) {
        return {
          ...projectItem,
          linkedSessionName: undefined,
          linkedSessionAttached: undefined,
        }
      }

      return {
        ...projectItem,
        linkedSessionName: linkedSession.title,
        linkedSessionAttached: linkedSession.isAttached,
      }
    })
  )
}
