import type { Config, Item, ProjectProfile } from '../types'
import { resolveProjectSession } from './session-rules'

const DEFAULT_CONFIG_SESSION_ICON = ''

function displayPath(path: string): string {
  return path.replace(process.env.HOME || '', '~')
}

function isListedProjectProfile(profile: ProjectProfile): boolean {
  return profile.listed === true
}

export async function getListedSessionItems(config: Config): Promise<Item[]> {
  const listedProfiles = (config.projects ?? []).filter(isListedProjectProfile)

  return Promise.all(
    listedProfiles.map(async profile => {
      const resolvedSession = await resolveProjectSession(profile.path, config)

      return {
        title: resolvedSession.sessionName,
        desc: displayPath(profile.path),
        path: profile.path,
        isSession: false,
        itemKind: 'configured' as const,
        icon: profile.icon ?? DEFAULT_CONFIG_SESSION_ICON,
      }
    })
  )
}

export function mergeSessionItems(tmuxSessions: Item[], listedSessions: Item[]): Item[] {
  const liveSessionTitles = new Set(tmuxSessions.map(item => item.title))
  const uniqueListedSessions = listedSessions.filter(item => !liveSessionTitles.has(item.title))

  return [...tmuxSessions, ...uniqueListedSessions]
}
