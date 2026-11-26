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
  CreatedSessionReceipt,
  FocusOutcome,
  MultiplexerBackend,
  OpenWorkspaceInput,
  WorkspaceRef,
} from '../multiplexer/types'
import { sanitizeTmuxSessionName } from '../tmux/helpers'
import type { Config, Item } from '../types'
import { isGitHubURL } from '../util/github'

// What the user asked for on the New screen, before any rules or inventory are consulted.
// Text that matches no row and is not a path is not a launch: it never names a new session.
export type LaunchIntent =
  | { readonly kind: 'candidate'; readonly item: Item }
  | { readonly kind: 'path'; readonly input: string; readonly fallback?: Item }

// The exact operation that will run; the same value drives every label shown for it.
export type LaunchPlan =
  | { readonly kind: 'focus'; readonly target: WorkspaceRef; readonly path: string }
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

  return selected ? { kind: 'candidate', item: selected } : undefined
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
    return Result.succeed({ kind: 'focus', target: getWorkspaceRef(exact), path: exact.path })

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
    return Result.succeed<LaunchPlan>({
      kind: 'focus',
      target: getWorkspaceRef(item),
      path: item.path,
    })

  return isFileItem(item) ? planFile(item.path, context) : planDirectory(item.path, context)
}

export type PlannedLaunch = Result.Result<LaunchPlan, LaunchPlanFailure>

// Whether the plan opens the highlighted row or a typed path, so a row label never claims a plan
// that belongs to something else.
export type LaunchSubject = 'selected' | 'typed-path'

export interface PreparedLaunch {
  readonly subject: LaunchSubject
  readonly result: PlannedLaunch
}

async function prepareIntent(
  intent: LaunchIntent,
  context: LaunchContext
): Promise<PreparedLaunch> {
  if (intent.kind === 'candidate')
    return { subject: 'selected', result: await planCandidate(intent.item, context) }

  const target = await resolveTypedPathTarget(intent.input, {
    invocationCwd: context.invocationCwd,
  })

  if (target) {
    const result =
      target.kind === 'file'
        ? planFile(target.path, context)
        : await planDirectory(target.path, context)

    return { subject: 'typed-path', result }
  }

  // The highlighted row is what the screen shows Enter will open; never invent a named session.
  if (intent.fallback)
    return { subject: 'selected', result: await planCandidate(intent.fallback, context) }

  return {
    subject: 'typed-path',
    result: Result.fail(
      new LaunchPathNotFound({
        input: intent.input,
        path: resolve(context.invocationCwd, expandUserPath(intent.input)),
      })
    ),
  }
}

export async function prepareLaunch(
  intent: LaunchIntent,
  context: LaunchContext
): Promise<PlannedLaunch> {
  return (await prepareIntent(intent, context)).result
}

// What Enter on the New screen does right now. A planned launch is frozen: the screen labels it
// and Enter executes that same plan, without resolving rules or inventory again.
export type LaunchPreview =
  | { readonly kind: 'inactive' }
  | { readonly kind: 'no-candidates' }
  | { readonly kind: 'no-match'; readonly query: string }
  | { readonly kind: 'clone'; readonly url: string }
  | { readonly kind: 'planning'; readonly prepared: Promise<PreparedLaunch> }
  | { readonly kind: 'ready'; readonly subject: LaunchSubject; readonly plan: LaunchPlan }
  | {
      readonly kind: 'refused'
      readonly subject: LaunchSubject
      readonly failure: LaunchPlanFailure
    }

export const INACTIVE_LAUNCH: LaunchPreview = { kind: 'inactive' }

export function previewLaunch(
  searchQuery: string,
  selected: Item | undefined,
  context: LaunchContext
): LaunchPreview {
  const query = searchQuery.trim()

  if (isGitHubURL(query)) return { kind: 'clone', url: query }

  const intent = launchIntentFor(query, selected)

  if (!intent) return query ? { kind: 'no-match', query } : { kind: 'no-candidates' }

  return { kind: 'planning', prepared: prepareIntent(intent, context) }
}

export function settleLaunchPreview(prepared: PreparedLaunch): LaunchPreview {
  const { subject, result } = prepared

  return Result.isSuccess(result)
    ? { kind: 'ready', subject, plan: result.success }
    : { kind: 'refused', subject, failure: result.failure }
}

export type LaunchOutcome =
  | { readonly kind: 'focused'; readonly target: WorkspaceRef; readonly focus: FocusOutcome }
  | {
      readonly kind: 'created'
      readonly receipt: CreatedSessionReceipt
      readonly focus: FocusOutcome
    }

// The session exists; only a follow-up step failed. Recovery is to open it, never to create again.
export class LaunchFollowUpFailed extends Data.TaggedError('LaunchFollowUpFailed')<{
  readonly receipt: CreatedSessionReceipt
  readonly step: 'start' | 'focus'
  readonly cause: unknown
}> {
  override get message(): string {
    const failed = this.step === 'start' ? 'its startup command failed' : 'it could not be opened'
    const reason = this.cause instanceof Error ? this.cause.message : 'unknown error'

    return `Created '${this.receipt.workspace.title}', but ${failed}: ${reason}. The new session was kept; open it from Sessions instead of creating it again.`
  }
}

async function followUp<A>(
  receipt: CreatedSessionReceipt,
  step: LaunchFollowUpFailed['step'],
  run: () => Promise<A>
): Promise<A> {
  try {
    return await run()
  } catch (cause) {
    throw new LaunchFollowUpFailed({ receipt, step, cause })
  }
}

export async function executeLaunchPlan(
  plan: LaunchPlan,
  backend: MultiplexerBackend
): Promise<LaunchOutcome> {
  if (plan.kind === 'focus') {
    return { kind: 'focused', target: plan.target, focus: await backend.open(plan.target) }
  }

  const receipt = await backend.create({ title: plan.input.title, path: plan.input.path })
  const { startupCommand } = plan.input

  if (startupCommand) await followUp(receipt, 'start', () => backend.start(receipt, startupCommand))
  const focus = await followUp(receipt, 'focus', () => backend.open(receipt.workspace))

  return { kind: 'created', receipt, focus }
}
