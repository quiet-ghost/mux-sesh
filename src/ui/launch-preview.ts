import { useEffect, useMemo, useRef, useState } from 'react'
import type { NewSessionAction } from '../app/action-catalog'
import type { BackendKind } from '../multiplexer/types'
import type { CloneServices } from '../sessions/clone-plan'
import {
  INACTIVE_LAUNCH,
  previewLaunchRequest,
  settleLaunchPreview,
  type LaunchPlan,
  type LaunchPreview,
  type LaunchRequest,
  type SessionPlan,
} from '../sessions/launch-plan'
import type { Config, Item } from '../types'
import { gitHubRepositoryName } from '../sessions/github-url'
import { toHomeRelativePath } from '../util/path-display'

export interface LaunchPreviewInput {
  readonly active: boolean
  // Must keep its identity while nothing it names changes: a new request plans again.
  readonly request: LaunchRequest
  readonly config: Config | null
  readonly backend: BackendKind | undefined
  readonly invocationCwd: string
  readonly liveSessions: Item[]
  readonly clone: CloneServices
  // A planner that rejects instead of returning a failure is a defect.
  readonly onDefect: (cause: unknown) => void
}

interface Settled {
  readonly from: LaunchPreview
  readonly preview: LaunchPreview
}

// Plans the requested launch once per request and inventory. The returned value is what the
// screen labels and what Enter executes, so the two cannot disagree.
export function useLaunchPreview(input: LaunchPreviewInput): LaunchPreview {
  const { active, request, config, backend, invocationCwd, liveSessions, clone } = input

  const planned = useMemo(
    () =>
      active && config && backend
        ? previewLaunchRequest(request, { config, backend, invocationCwd, liveSessions, clone })
        : INACTIVE_LAUNCH,
    [active, backend, clone, config, invocationCwd, liveSessions, request]
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

// A reused checkout is not a clone: Enter only does what the session plan does.
function enterActionOf(plan: LaunchPlan): NewSessionAction {
  if (plan.kind !== 'clone') return plan.kind

  return plan.clone.checkout === 'clone' ? 'clone' : plan.session.kind
}

export function getNewSessionAction(preview: LaunchPreview): NewSessionAction {
  switch (preview.kind) {
    case 'ready':
      return enterActionOf(preview.plan)
    case 'inactive':
    case 'no-candidates':
    case 'no-match':
    case 'name-required':
    case 'file-prompt':
    case 'file-searching':
    case 'file-unavailable':
    case 'no-file-match':
    case 'planning':
    case 'refused':
      return 'none'
  }
}

// The selected row shows the plan's action only when the plan opens that row.
export function getSelectedRowAction(preview: LaunchPreview): string | undefined {
  switch (preview.kind) {
    case 'ready':
    case 'refused':
      if (preview.subject === 'repository') return undefined

      return preview.kind === 'ready' && preview.subject === 'selected' ? preview.plan.kind : ''
    case 'inactive':
    case 'no-candidates':
    case 'no-match':
    case 'name-required':
    case 'file-prompt':
    case 'file-searching':
    case 'file-unavailable':
    case 'no-file-match':
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
    case 'name-required':
      return {
        kind: 'note',
        text: `Type a name; Enter creates it in ${toHomeRelativePath(preview.directory)}.`,
      }
    case 'file-prompt':
      return { kind: 'note', text: 'Type a file name to search the project roots, or a file path.' }
    case 'file-searching':
      return { kind: 'note', text: `Searching files for '${preview.query}'…` }
    case 'file-unavailable':
      return {
        kind: 'note',
        text: `${preview.reason} Nothing will open; type a file path, or press esc.`,
      }
    case 'no-file-match':
      return {
        kind: 'note',
        text: `No file matches '${preview.query}'. Nothing will open; refine the name, or press esc.`,
      }
    case 'planning':
      return { kind: 'note', text: 'Checking what Enter will open…' }
    case 'refused':
      return { kind: 'note', text: preview.failure.message }
    case 'ready':
      return describePlan(preview.plan)
  }
}

function startupOf(plan: Extract<SessionPlan, { kind: 'create' }>): string {
  const { startupCommand } = plan.input

  return startupCommand ? `, then run: ${startupCommand}` : ''
}

// The session half of a clone, after its checkout: the directory is already named.
function describeSessionAfterCheckout(plan: SessionPlan): string {
  return plan.kind === 'focus'
    ? `focus existing '${plan.target.title}'`
    : `create '${plan.input.title}'${startupOf(plan)}`
}

function describePlan(plan: LaunchPlan): LaunchSummary {
  switch (plan.kind) {
    case 'focus':
      return {
        kind: 'action',
        verb: 'Focus',
        detail: `existing '${plan.target.title}' in ${toHomeRelativePath(plan.path)}`,
      }
    case 'create':
      return {
        kind: 'action',
        verb: 'Create',
        detail: `'${plan.input.title}' in ${toHomeRelativePath(plan.input.path)}${startupOf(plan)}`,
      }
    case 'clone': {
      const { repository, destination, checkout } = plan.clone
      const name = gitHubRepositoryName(repository)
      const then = describeSessionAfterCheckout(plan.session)
      const at = toHomeRelativePath(destination)

      return checkout === 'clone'
        ? { kind: 'action', verb: 'Clone', detail: `${name} into ${at}, then ${then}` }
        : { kind: 'action', verb: 'Reuse', detail: `the ${name} checkout at ${at}, then ${then}` }
    }
  }
}
