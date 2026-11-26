import { useEffect, useMemo, useRef, useState } from 'react'
import type { NewSessionAction } from '../app/action-catalog'
import type { BackendKind } from '../multiplexer/types'
import {
  INACTIVE_LAUNCH,
  previewLaunch,
  settleLaunchPreview,
  type LaunchPreview,
} from '../sessions/launch-plan'
import type { Config, Item } from '../types'
import { toHomeRelativePath } from '../util/path-display'

export interface LaunchPreviewInput {
  readonly active: boolean
  readonly searchQuery: string
  readonly selected: Item | undefined
  readonly config: Config | null
  readonly backend: BackendKind | undefined
  readonly invocationCwd: string
  readonly liveSessions: Item[]
  // A planner that rejects instead of returning a failure is a defect.
  readonly onDefect: (cause: unknown) => void
}

interface Settled {
  readonly from: LaunchPreview
  readonly preview: LaunchPreview
}

// Plans the highlighted launch once per selection and inventory. The returned value is what the
// screen labels and what Enter executes, so the two cannot disagree.
export function useLaunchPreview(input: LaunchPreviewInput): LaunchPreview {
  const { active, searchQuery, selected, config, backend, invocationCwd, liveSessions } = input
  const query = searchQuery.trim()

  const planned = useMemo(
    () =>
      active && config && backend
        ? previewLaunch(query, selected, { config, backend, invocationCwd, liveSessions })
        : INACTIVE_LAUNCH,
    [active, backend, config, invocationCwd, liveSessions, query, selected]
  )

  const [settled, setSettled] = useState<Settled | undefined>(undefined)
  const onDefect = useRef(input.onDefect)
  onDefect.current = input.onDefect

  useEffect(() => {
    if (planned.kind !== 'planning') return

    let current = true

    planned.prepared.then(
      prepared => {
        if (current) setSettled({ from: planned, preview: settleLaunchPreview(prepared) })
      },
      cause => onDefect.current(cause)
    )

    return () => {
      current = false
    }
  }, [planned])

  return settled?.from === planned ? settled.preview : planned
}

export function getNewSessionAction(preview: LaunchPreview): NewSessionAction {
  switch (preview.kind) {
    case 'ready':
      return preview.plan.kind
    case 'clone':
      return 'clone'
    case 'inactive':
    case 'no-candidates':
    case 'no-match':
    case 'planning':
    case 'refused':
      return 'none'
  }
}

// The selected row shows the plan's action only when the plan opens that row.
export function getSelectedRowAction(preview: LaunchPreview): string | undefined {
  switch (preview.kind) {
    case 'ready':
      return preview.subject === 'selected' ? preview.plan.kind : ''
    case 'refused':
      return ''
    case 'inactive':
    case 'no-candidates':
    case 'no-match':
    case 'clone':
    case 'planning':
      return undefined
  }
}

export type LaunchSummary =
  | { readonly kind: 'none' }
  | { readonly kind: 'note'; readonly text: string }
  | { readonly kind: 'action'; readonly verb: string; readonly detail: string }

export function describeLaunchPreview(preview: LaunchPreview): LaunchSummary {
  switch (preview.kind) {
    case 'inactive':
      return { kind: 'none' }
    case 'no-candidates':
      return { kind: 'note', text: 'No projects yet. Type a path to open one.' }
    case 'no-match':
      return {
        kind: 'note',
        text: `No project matches '${preview.query}'. Type a path, or clear the query to pick a project.`,
      }
    case 'clone':
      return { kind: 'action', verb: 'Clone', detail: `${preview.url}, then create its session` }
    case 'planning':
      return { kind: 'note', text: 'Checking what Enter will open…' }
    case 'refused':
      return { kind: 'note', text: preview.failure.message }
    case 'ready': {
      const { plan } = preview

      if (plan.kind === 'focus') {
        return {
          kind: 'action',
          verb: 'Focus',
          detail: `existing '${plan.target.title}' in ${toHomeRelativePath(plan.path)}`,
        }
      }

      const { title, path, startupCommand } = plan.input
      const startup = startupCommand ? `, then run: ${startupCommand}` : ''

      return {
        kind: 'action',
        verb: 'Create',
        detail: `'${title}' in ${toHomeRelativePath(path)}${startup}`,
      }
    }
  }
}
