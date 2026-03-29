import type { Config, Item } from '../types'
import { resolveProjectSession } from '../config/session-rules'

export async function annotateProjectItemsWithSessionLinks(
  projectItems: Item[],
  liveSessions: Item[],
  config: Config
): Promise<Item[]> {
  const liveSessionsByTitle = new Map(liveSessions.map(session => [session.title, session]))

  return Promise.all(
    projectItems.map(async projectItem => {
      const resolvedSession = await resolveProjectSession(projectItem.path, config)
      const linkedSession = liveSessionsByTitle.get(resolvedSession.sessionName)

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
