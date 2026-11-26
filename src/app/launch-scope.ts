import { useMemo } from 'react'
import { NO_LAUNCH_OPTIONS, type LaunchRequest } from '../sessions/launch-plan'
import { AppMode, ViewMode, type Item } from '../types'

// Whose Enter runs a frozen launch plan: New always, and the Projects view for its highlighted
// row. Everywhere else Enter opens the row directly and nothing is planned.
export type LaunchScope = 'new-session' | 'projects' | 'none'

export function getLaunchScope(
  appMode: AppMode,
  viewMode: ViewMode,
  selected: Item | undefined
): LaunchScope {
  if (appMode === AppMode.NewSession) return 'new-session'

  const listing = appMode === AppMode.Normal || appMode === AppMode.Search

  return listing && viewMode === ViewMode.Projects && selected ? 'projects' : 'none'
}

// A Projects row is planned exactly as New plans that row with an empty query and no edits.
export function useLaunchRequest(
  scope: LaunchScope,
  newSession: LaunchRequest,
  selected: Item | undefined
): LaunchRequest {
  const project = useMemo(
    (): LaunchRequest => ({ kind: 'browse', query: '', selected, options: NO_LAUNCH_OPTIONS }),
    [selected]
  )

  return scope === 'projects' ? project : newSession
}
