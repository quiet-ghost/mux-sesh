import { useMemo } from 'react'
import type { BackendKind } from '../multiplexer/types'
import type { CloneServices } from '../sessions/clone-plan'
import {
  INACTIVE_LAUNCH,
  NO_LAUNCH_OPTIONS,
  previewLaunchRequest,
  type LaunchPreview,
  type LaunchRequest,
} from '../sessions/launch-plan'
import { AppMode, ViewMode, type Config, type Item } from '../types'

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
function projectLaunchRequest(selected: Item | undefined): LaunchRequest {
  return { kind: 'browse', query: '', selected, options: NO_LAUNCH_OPTIONS }
}

export function useLaunchRequest(
  scope: LaunchScope,
  newSession: LaunchRequest,
  selected: Item | undefined
): LaunchRequest {
  const project = useMemo(() => projectLaunchRequest(selected), [selected])

  return scope === 'projects' ? project : newSession
}

// What the launch preview plans against; the controller passes the same value to both planners.
export interface LaunchPlanning {
  readonly config: Config | null
  readonly backend: BackendKind | undefined
  readonly invocationCwd: string
  readonly liveSessions: Item[]
  readonly clone: CloneServices
}

// Plans a Projects row the cursor is not on, for a key that opens it at once: the same request and
// planner the preview would use once the row is highlighted.
export function planProjectRow(item: Item, planning: LaunchPlanning): LaunchPreview {
  const { config, backend, invocationCwd, liveSessions, clone } = planning

  return config && backend
    ? previewLaunchRequest(projectLaunchRequest(item), {
        config,
        backend,
        invocationCwd,
        liveSessions,
        clone,
      })
    : INACTIVE_LAUNCH
}
