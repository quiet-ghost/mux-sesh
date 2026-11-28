import { stat } from 'fs/promises'
import { resolve } from 'path'
import * as Data from 'effect/Data'
import * as Result from 'effect/Result'
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
import type { FileStepSearch } from '../search/file-step'
import { sanitizeTmuxSessionName } from '../tmux/helpers'
import type { Config, Item } from '../types'
import { isGitHubURL, parseGitHubURL, type GitHubURL } from '../util/github'
import {
  checkCloneDestination,
  cloneDestinationOf,
  CloneDestinationRefused,
  CloneURLHasCredentials,
  type ClonePlan,
  type CloneServices,
} from './clone-plan'

// What the user asked for on the New screen, before any rules or inventory are consulted.
// Text that matches no row and is not a path is not a launch: it never names a new session.
// Named-here and file paths come only from their explicit New steps.
export type LaunchIntent =
  | { readonly kind: 'candidate'; readonly item: Item }
  | { readonly kind: 'path'; readonly input: string; readonly fallback?: Item }
  | { readonly kind: 'named-here'; readonly name: string }
  | { readonly kind: 'file-path'; readonly input: string }
  | { readonly kind: 'clone'; readonly url: Exclude<GitHubURL, { kind: 'unsupported' }> }

// What happens to the multiplexer: open an existing session, or create one.
export type SessionPlan =
  | { readonly kind: 'focus'; readonly target: WorkspaceRef; readonly path: string }
  | { readonly kind: 'create'; readonly input: OpenWorkspaceInput }

// The exact operation that will run; the same value drives every label shown for it. A clone
// freezes its checkout and the session it then opens together.
export type LaunchPlan =
  SessionPlan | { readonly kind: 'clone'; readonly clone: ClonePlan; readonly session: SessionPlan }

export function sessionPlanOf(plan: LaunchPlan): SessionPlan {
  return plan.kind === 'clone' ? plan.session : plan
}

export type StartupOverride =
  { readonly kind: 'none' } | { readonly kind: 'command'; readonly command: string }

// Edits to a planned create; an absent field keeps what the session rules resolve.
export interface LaunchOptions {
  readonly name?: string
  readonly startup?: StartupOverride
}

export const NO_LAUNCH_OPTIONS: LaunchOptions = {}

export function parseStartupOverride(draft: string): StartupOverride {
  const command = draft.trim()

  return command ? { kind: 'command', command } : { kind: 'none' }
}

class LaunchPathNotFound extends Data.TaggedError('LaunchPathNotFound')<{
  readonly input: string
  readonly path: string
}> {
  override get message(): string {
    return `Nothing exists at ${this.path}, so no session was created. Check the path, or clear it to pick a project.`
  }
}

class LaunchPathNotFile extends Data.TaggedError('LaunchPathNotFile')<{
  readonly input: string
  readonly path: string
}> {
  override get message(): string {
    return `${this.path} is a directory, not a file. Nothing was opened. Type a file path, or press esc and pick it as a project.`
  }
}

class LaunchDirectoryMissing extends Data.TaggedError('LaunchDirectoryMissing')<{
  readonly path: string
}> {
  override get message(): string {
    return `The directory mux-sesh was started in, ${this.path} no longer exists, so no session was created. Press esc and pick a project instead.`
  }
}

class InvalidSessionName extends Data.TaggedError('InvalidSessionName')<{
  readonly name: string
  readonly reason: string
}> {
  override get message(): string {
    return `The session name ${this.reason}. Nothing was created; edit the name, or press esc to go back.`
  }
}

class SessionNameCollision extends Data.TaggedError('SessionNameCollision')<{
  readonly name: string
  readonly existingPath: string
  readonly requestedPath: string
}> {
  override get message(): string {
    return `A tmux session named '${this.name}' already exists for ${this.existingPath}, not ${this.requestedPath}. Nothing was opened. Open it from Sessions, or rename it first.`
  }
}

export type LaunchPlanFailure =
  | LaunchPathNotFound
  | LaunchPathNotFile
  | LaunchDirectoryMissing
  | InvalidSessionName
  | SessionNameCollision
  | CloneURLHasCredentials
  | CloneDestinationRefused

export interface LaunchContext {
  readonly config: Config
  readonly backend: BackendKind
  readonly invocationCwd: string
  readonly liveSessions: readonly Item[]
  readonly clone: CloneServices
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

// The row whose planned create the name and startup steps may edit: never a live session, a
// typed path, or a clone.
export function editableLaunchTarget(
  searchQuery: string,
  selected: Item | undefined
): Item | undefined {
  const query = searchQuery.trim()

  if (isGitHubURL(query)) return undefined

  const intent = launchIntentFor(query, selected)

  return intent?.kind === 'candidate' && !isLiveSessionItem(intent.item) ? intent.item : undefined
}

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)

    if (code < 0x20 || code === 0x7f) return true
  }

  return false
}

// A typed name is checked before planning; tmux still replaces '.' and spaces, visibly in the plan.
function parseSessionName(
  draft: string,
  backend: BackendKind
): Result.Result<string, InvalidSessionName> {
  const name = draft.trim()

  if (!name) return Result.fail(new InvalidSessionName({ name, reason: 'cannot be empty' }))

  if (hasControlCharacter(name))
    return Result.fail(
      new InvalidSessionName({ name, reason: 'cannot contain control characters' })
    )

  if (backend === 'tmux' && name.includes(':'))
    return Result.fail(
      new InvalidSessionName({
        name,
        reason: "cannot contain ':', which tmux uses to address windows",
      })
    )

  return Result.succeed(name)
}

function sessionTitle(title: string, backend: BackendKind): string {
  return backend === 'tmux' ? sanitizeTmuxSessionName(title) : title
}

function applyOptions(
  input: OpenWorkspaceInput,
  options: LaunchOptions,
  backend: BackendKind
): Result.Result<OpenWorkspaceInput, InvalidSessionName> {
  const { name, startup } = options
  const parsed = name === undefined ? Result.succeed(input.title) : parseSessionName(name, backend)

  if (Result.isFailure(parsed)) return Result.fail(parsed.failure)

  if (startup === undefined) return Result.succeed({ ...input, title: parsed.success })

  return Result.succeed(
    startup.kind === 'command'
      ? { title: parsed.success, path: input.path, startupCommand: startup.command }
      : { title: parsed.success, path: input.path }
  )
}

// Reuse a live session only when name and directory both match. tmux names are unique per
// server, so the same name elsewhere is a collision; Herdr allows duplicate labels.
function planCreate(
  requested: OpenWorkspaceInput,
  context: LaunchContext,
  options: LaunchOptions = NO_LAUNCH_OPTIONS
): Result.Result<SessionPlan, LaunchPlanFailure> {
  const applied = applyOptions(requested, options, context.backend)

  if (Result.isFailure(applied)) return Result.fail(applied.failure)

  const input = applied.success
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

async function planDirectory(
  path: string,
  context: LaunchContext,
  options?: LaunchOptions
): Promise<Result.Result<SessionPlan, LaunchPlanFailure>> {
  const rules = await resolveProjectSession(path, context.config)

  return planCreate(
    { title: rules.sessionName, path, startupCommand: rules.startupCommand },
    context,
    options
  )
}

function planFile(path: string, context: LaunchContext, options?: LaunchOptions) {
  const session = resolveFileSession(path, context.config)

  return planCreate(
    { title: session.sessionName, path: session.cwd, startupCommand: session.startupCommand },
    context,
    options
  )
}

async function planCandidate(item: Item, context: LaunchContext, options?: LaunchOptions) {
  if (isLiveSessionItem(item))
    return Result.succeed<SessionPlan>({
      kind: 'focus',
      target: getWorkspaceRef(item),
      path: item.path,
    })

  return isFileItem(item)
    ? planFile(item.path, context, options)
    : planDirectory(item.path, context, options)
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

// The name is the user's; the directory is the one mux-sesh was started in, never a guess.
async function planNamedHere(
  draft: string,
  context: LaunchContext
): Promise<Result.Result<SessionPlan, LaunchPlanFailure>> {
  const name = parseSessionName(draft, context.backend)

  if (Result.isFailure(name)) return Result.fail(name.failure)

  const path = context.invocationCwd

  if (!(await isDirectory(path))) return Result.fail(new LaunchDirectoryMissing({ path }))

  const rules = await resolveProjectSession(path, context.config)

  return planCreate({ title: name.success, path, startupCommand: rules.startupCommand }, context)
}

async function planFilePath(
  input: string,
  context: LaunchContext
): Promise<Result.Result<SessionPlan, LaunchPlanFailure>> {
  const target = await resolveTypedPathTarget(input, { invocationCwd: context.invocationCwd })

  if (!target) {
    const path = resolve(context.invocationCwd, expandUserPath(input))

    return Result.fail(new LaunchPathNotFound({ input, path }))
  }

  if (target.kind === 'directory')
    return Result.fail(new LaunchPathNotFile({ input, path: target.path }))

  return planFile(target.path, context)
}

// The destination and the session rules are both resolved before anything runs; a destination
// that exists is reused only once it is verified as this repository's complete checkout.
async function planClone(
  url: Extract<LaunchIntent, { kind: 'clone' }>['url'],
  context: LaunchContext
): Promise<Result.Result<LaunchPlan, LaunchPlanFailure>> {
  const { repository } = url

  if (url.kind === 'credentialed') return Result.fail(new CloneURLHasCredentials({ repository }))

  const { reposPath } = context.config
  const destination = cloneDestinationOf(repository, reposPath)
  const found = await checkCloneDestination(repository, reposPath, context.clone.inspect)

  if (found.kind === 'refused')
    return Result.fail(
      new CloneDestinationRefused({ repository, destination, refusal: found.refusal })
    )

  const session = await planDirectory(destination, context)

  if (Result.isFailure(session)) return Result.fail(session.failure)

  return Result.succeed({
    kind: 'clone',
    clone: {
      repository,
      reposPath,
      destination,
      checkout: found.kind === 'absent' ? 'clone' : 'reuse',
    },
    session: session.success,
  })
}

export type PlannedLaunch = Result.Result<LaunchPlan, LaunchPlanFailure>

// Whether the plan opens the highlighted row, a typed path, a named session in the caller's
// directory, or a typed repository, so a row label never claims a plan that is not its own.
export type LaunchSubject = 'selected' | 'typed-path' | 'named-here' | 'repository'

export interface PreparedLaunch {
  readonly subject: LaunchSubject
  readonly result: PlannedLaunch
}

async function prepareIntent(
  intent: LaunchIntent,
  context: LaunchContext,
  options: LaunchOptions = NO_LAUNCH_OPTIONS
): Promise<PreparedLaunch> {
  switch (intent.kind) {
    case 'candidate':
      return { subject: 'selected', result: await planCandidate(intent.item, context, options) }
    case 'named-here':
      return { subject: 'named-here', result: await planNamedHere(intent.name, context) }
    case 'file-path':
      return { subject: 'typed-path', result: await planFilePath(intent.input, context) }
    case 'clone':
      return { subject: 'repository', result: await planClone(intent.url, context) }
    case 'path':
      break
  }

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
    return { subject: 'selected', result: await planCandidate(intent.fallback, context, options) }

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
  context: LaunchContext,
  options: LaunchOptions = NO_LAUNCH_OPTIONS
): Promise<PlannedLaunch> {
  return (await prepareIntent(intent, context, options)).result
}

// What Enter on the New screen does right now. A planned launch is frozen: the screen labels it
// and Enter executes that same plan, without resolving rules or inventory again.
export type LaunchPreview =
  | { readonly kind: 'inactive' }
  | { readonly kind: 'no-candidates' }
  | { readonly kind: 'no-match'; readonly query: string }
  | { readonly kind: 'name-required'; readonly directory: string }
  | { readonly kind: 'file-prompt' }
  | { readonly kind: 'file-searching'; readonly query: string }
  | { readonly kind: 'file-unavailable'; readonly reason: string }
  | { readonly kind: 'no-file-match'; readonly query: string }
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
  context: LaunchContext,
  options: LaunchOptions = NO_LAUNCH_OPTIONS
): LaunchPreview {
  const query = searchQuery.trim()
  const url = parseGitHubURL(query)

  if (url.kind !== 'unsupported')
    return { kind: 'planning', prepared: prepareIntent({ kind: 'clone', url }, context) }

  const intent = launchIntentFor(query, selected)

  if (!intent) return query ? { kind: 'no-match', query } : { kind: 'no-candidates' }

  return { kind: 'planning', prepared: prepareIntent(intent, context, options) }
}

function previewNamedHere(name: string, context: LaunchContext): LaunchPreview {
  if (!name.trim()) return { kind: 'name-required', directory: context.invocationCwd }

  return { kind: 'planning', prepared: prepareIntent({ kind: 'named-here', name }, context) }
}

// The file step opens only a file it found or a typed file path; it never falls back to a project.
function previewFileStep(
  fileQuery: string,
  search: FileStepSearch,
  selected: Item | undefined,
  context: LaunchContext
): LaunchPreview {
  const query = fileQuery.trim()

  if (!query) return { kind: 'file-prompt' }

  if (looksLikePathInput(query))
    return {
      kind: 'planning',
      prepared: prepareIntent({ kind: 'file-path', input: query }, context),
    }

  if (search.kind === 'unavailable') return { kind: 'file-unavailable', reason: search.reason }

  if (search.kind !== 'found' || search.query !== query) return { kind: 'file-searching', query }

  if (!selected) return { kind: 'no-file-match', query }

  return {
    kind: 'planning',
    prepared: prepareIntent({ kind: 'candidate', item: selected }, context),
  }
}

// Everything the New screen can be asked to plan, one variant per step.
export type LaunchRequest =
  | {
      readonly kind: 'browse'
      readonly query: string
      readonly selected: Item | undefined
      readonly options: LaunchOptions
    }
  | { readonly kind: 'named-here'; readonly name: string }
  | {
      readonly kind: 'file'
      readonly query: string
      readonly search: FileStepSearch
      readonly selected: Item | undefined
    }

export function previewLaunchRequest(
  request: LaunchRequest,
  context: LaunchContext
): LaunchPreview {
  switch (request.kind) {
    case 'browse':
      return previewLaunch(request.query, request.selected, context, request.options)
    case 'named-here':
      return previewNamedHere(request.name, context)
    case 'file':
      return previewFileStep(request.query, request.search, request.selected, context)
  }
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
  plan: SessionPlan,
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
