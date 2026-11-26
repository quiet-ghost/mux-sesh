import { resolve } from 'path'
import { Data, Result } from 'effect'
import { resolveProjectSession } from '../config/session-rules'
import {
  expandUserPath,
  isFileItem,
  looksLikePathInput,
  resolveFileSession,
  resolveTypedPathTarget,
} from '../files/target'
import { getWorkspaceRef, isLiveSessionItem } from '../multiplexer/items'
import type {
  BackendKind,
  MultiplexerBackend,
  OpenWorkspaceInput,
  WorkspaceRef,
} from '../multiplexer/types'
import { sanitizeTmuxSessionName } from '../tmux/helpers'
import type { Config, Item } from '../types'

// What the user asked for on the New screen, before any rules or inventory are consulted.
export type LaunchIntent =
  | { readonly kind: 'candidate'; readonly item: Item }
  | { readonly kind: 'path'; readonly input: string; readonly fallback?: Item }
  | { readonly kind: 'named-here'; readonly name: string }

// The exact operation that will run; the same value should drive any label shown for it.
export type LaunchPlan =
  | { readonly kind: 'focus'; readonly target: WorkspaceRef }
  | { readonly kind: 'create'; readonly input: OpenWorkspaceInput }

export class LaunchPathNotFound extends Data.TaggedError('LaunchPathNotFound')<{
  readonly input: string
  readonly path: string
}> {
  override get message(): string {
    return `Nothing exists at ${this.path}, so no session was created. Check the path, or clear it to pick a project.`
  }
}

export class SessionNameCollision extends Data.TaggedError('SessionNameCollision')<{
  readonly name: string
  readonly existingPath: string
  readonly requestedPath: string
}> {
  override get message(): string {
    return `A tmux session named '${this.name}' already exists for ${this.existingPath}, not ${this.requestedPath}. Nothing was opened. Open it from Sessions, or rename it first.`
  }
}

export type LaunchPlanFailure = LaunchPathNotFound | SessionNameCollision

export interface LaunchContext {
  readonly config: Config
  readonly backend: BackendKind
  readonly invocationCwd: string
  readonly liveSessions: readonly Item[]
}

export function launchIntentFor(
  searchTerm: string,
  selected: Item | undefined
): LaunchIntent | undefined {
  const term = searchTerm.trim()

  if (!term) return selected ? { kind: 'candidate', item: selected } : undefined

  if (looksLikePathInput(term)) return { kind: 'path', input: term, fallback: selected }

  return selected ? { kind: 'candidate', item: selected } : { kind: 'named-here', name: term }
}

function sessionTitle(title: string, backend: BackendKind): string {
  return backend === 'tmux' ? sanitizeTmuxSessionName(title) : title
}

// Reuse a live session only when name and directory both match. tmux names are unique per
// server, so the same name elsewhere is a collision; Herdr allows duplicate labels.
function planCreate(
  input: OpenWorkspaceInput,
  context: LaunchContext
): Result.Result<LaunchPlan, LaunchPlanFailure> {
  const title = sessionTitle(input.title, context.backend)

  const sameName = context.liveSessions.filter(
    session =>
      isLiveSessionItem(session) && session.backend === context.backend && session.title === title
  )

  const exact = sameName.find(
    session => session.path && resolve(session.path) === resolve(input.path)
  )

  if (exact && isLiveSessionItem(exact))
    return Result.succeed({ kind: 'focus', target: getWorkspaceRef(exact) })

  const elsewhere = sameName[0]

  if (context.backend === 'tmux' && elsewhere) {
    return Result.fail(
      new SessionNameCollision({
        name: title,
        existingPath: elsewhere.path,
        requestedPath: input.path,
      })
    )
  }

  return Result.succeed({ kind: 'create', input })
}

async function planDirectory(path: string, context: LaunchContext) {
  const rules = await resolveProjectSession(path, context.config)

  return planCreate(
    { title: rules.sessionName, path, startupCommand: rules.startupCommand },
    context
  )
}

function planFile(path: string, context: LaunchContext) {
  const session = resolveFileSession(path, context.config)

  return planCreate(
    { title: session.sessionName, path: session.cwd, startupCommand: session.startupCommand },
    context
  )
}

async function planCandidate(item: Item, context: LaunchContext) {
  if (isLiveSessionItem(item))
    return Result.succeed<LaunchPlan>({ kind: 'focus', target: getWorkspaceRef(item) })

  return isFileItem(item) ? planFile(item.path, context) : planDirectory(item.path, context)
}

export async function prepareLaunch(
  intent: LaunchIntent,
  context: LaunchContext
): Promise<Result.Result<LaunchPlan, LaunchPlanFailure>> {
  switch (intent.kind) {
    case 'candidate':
      return planCandidate(intent.item, context)
    case 'named-here':
      return planCreate({ title: intent.name, path: context.invocationCwd }, context)
    case 'path': {
      const target = await resolveTypedPathTarget(intent.input, {
        invocationCwd: context.invocationCwd,
      })

      if (target)
        return target.kind === 'file'
          ? planFile(target.path, context)
          : planDirectory(target.path, context)

      // The highlighted row is what the screen shows Enter will open; never invent a named session.
      if (intent.fallback) return planCandidate(intent.fallback, context)

      return Result.fail(
        new LaunchPathNotFound({
          input: intent.input,
          path: resolve(context.invocationCwd, expandUserPath(intent.input)),
        })
      )
    }
  }
}

export async function executeLaunchPlan(
  plan: LaunchPlan,
  backend: MultiplexerBackend
): Promise<void> {
  switch (plan.kind) {
    case 'focus':
      await backend.open(plan.target)

      return
    case 'create':
      await backend.openOrCreate(plan.input)
  }
}
