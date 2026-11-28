import { lstat, mkdir, realpath, stat } from 'fs/promises'
import { dirname, isAbsolute, join, relative } from 'path'
import * as Data from 'effect/Data'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import {
  CommandInterrupted,
  CommandOutputLimitError,
  CommandTimeoutError,
  CommandTransportError,
  createCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '../multiplexer/command'
import {
  gitHubRepositoryName,
  parseGitHubURL,
  sameGitHubRepository,
  type GitHubRepository,
} from './github-url'
import { toHomeRelativePath } from '../util/path-display'

// Inspecting a checkout is quick; a clone may legitimately take minutes.
export interface CloneServices {
  readonly inspect: CommandRunner
  readonly clone: CommandRunner
}

// The picker owns the terminal, so a credential prompt would hang unseen until the clone deadline.
// SSH passphrase prompts are left to the user's ssh setup (agent or core.sshCommand).
const NON_INTERACTIVE_GIT = { GIT_TERMINAL_PROMPT: '0' } as const

export const CLONE_SERVICES: CloneServices = {
  inspect: createCommandRunner({ timeoutMs: 10_000 }),
  clone: createCommandRunner({ timeoutMs: 10 * 60_000 }),
}

export type DestinationRefusal =
  | { readonly kind: 'not-directory' }
  | { readonly kind: 'outside-repos'; readonly resolved: string }
  | { readonly kind: 'not-checkout' }
  // `origin` is the owner/repo the checkout points at, when its origin names one on GitHub.
  | { readonly kind: 'other-repository'; readonly origin: string | undefined }
  | { readonly kind: 'incomplete' }
  | { readonly kind: 'unverifiable'; readonly reason: string }

// What is at a clone destination. Only a verified, complete checkout of the same repository
// inside the repos path is ever reused; anything else is refused and left exactly as it is.
export type CloneDestination =
  | { readonly kind: 'absent' }
  | { readonly kind: 'reusable' }
  | { readonly kind: 'refused'; readonly refusal: DestinationRefusal }

// The checkout half of a clone launch, frozen when the New screen shows it.
export interface ClonePlan {
  readonly repository: GitHubRepository
  readonly reposPath: string
  readonly destination: string
  readonly checkout: 'clone' | 'reuse'
}

export type CheckoutReceipt = {
  readonly kind: 'cloned' | 'reused'
  readonly repository: GitHubRepository
  readonly path: string
}

// `left` says whether anything exists at the destination after the clone stopped.
export type CheckoutFailure =
  | { readonly kind: 'changed'; readonly destination: CloneDestination }
  | { readonly kind: 'failed'; readonly reason: string; readonly left: boolean }
  | { readonly kind: 'unknown'; readonly reason: string; readonly left: boolean }

export class CloneURLHasCredentials extends Data.TaggedError('CloneURLHasCredentials')<{
  readonly repository: GitHubRepository
}> {
  override get message(): string {
    return `That GitHub URL includes a username or token, so it was not used. Nothing was cloned or created. Type ${this.repository.url} instead and let git's credential helper sign in.`
  }
}

function refusalText(refusal: DestinationRefusal, repository: string, reposPath: string): string {
  switch (refusal.kind) {
    case 'not-directory':
      return 'already exists and is not a directory'
    case 'outside-repos':
      return `is a link to ${toHomeRelativePath(refusal.resolved)}, outside ${toHomeRelativePath(reposPath)}`
    case 'not-checkout':
      return 'already exists but is not a git checkout of its own'
    case 'other-repository':
      return refusal.origin
        ? `already holds ${refusal.origin}, not ${repository}`
        : `is a git checkout whose origin is not ${repository}`
    case 'incomplete':
      return `is a checkout of ${repository} with no commits; it may be a partial clone`
    case 'unverifiable':
      return `could not be checked: ${refusal.reason}`
  }
}

export class CloneDestinationRefused extends Data.TaggedError('CloneDestinationRefused')<{
  readonly repository: GitHubRepository
  readonly destination: string
  readonly refusal: DestinationRefusal
}> {
  override get message(): string {
    const reposPath = dirname(this.destination)
    const what = refusalText(this.refusal, gitHubRepositoryName(this.repository), reposPath)

    return `${toHomeRelativePath(this.destination)} ${what}. Nothing was cloned or created, and nothing there was changed. Move it aside or inspect it yourself, then press Enter again.`
  }
}

export function cloneDestinationOf(repository: GitHubRepository, reposPath: string): string {
  return join(reposPath, repository.repo)
}

const isCommandFailure = (cause: unknown): cause is Error =>
  cause instanceof CommandTransportError ||
  cause instanceof CommandTimeoutError ||
  cause instanceof CommandOutputLimitError ||
  cause instanceof CommandInterrupted

const hasErrorCode = Schema.is(Schema.Struct({ code: Schema.String }))

const isFileSystemError = (cause: unknown): cause is Error =>
  cause instanceof Error && hasErrorCode(cause)

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown error'
}

function isInside(base: string, target: string): boolean {
  const path = relative(base, target)

  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)

    return true
  } catch {
    return false
  }
}

function refused(refusal: DestinationRefusal): CloneDestination {
  return { kind: 'refused', refusal }
}

async function git(
  inspect: CommandRunner,
  directory: string,
  args: readonly string[]
): Promise<CommandResult> {
  return inspect.run(['git', '-C', directory, ...args])
}

async function originOf(
  inspect: CommandRunner,
  checkout: string
): Promise<GitHubRepository | 'missing' | 'other'> {
  // The stored URL, not one rewritten by insteadOf rules.
  const origin = await git(inspect, checkout, ['config', '--get', 'remote.origin.url'])

  if (origin.exitCode !== 0) return 'missing'

  const parsed = parseGitHubURL(origin.stdout)

  return parsed.kind === 'unsupported' ? 'other' : parsed.repository
}

async function checkCheckout(
  repository: GitHubRepository,
  checkout: string,
  inspect: CommandRunner
): Promise<CloneDestination> {
  const top = await git(inspect, checkout, ['rev-parse', '--show-toplevel'])

  if (top.exitCode !== 0 || (await realpath(top.stdout.trim())) !== checkout)
    return refused({ kind: 'not-checkout' })

  const origin = await originOf(inspect, checkout)

  if (origin === 'missing' || origin === 'other')
    return refused({ kind: 'other-repository', origin: undefined })

  if (!sameGitHubRepository(origin, repository))
    return refused({ kind: 'other-repository', origin: gitHubRepositoryName(origin) })

  const head = await git(inspect, checkout, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'])

  return head.exitCode === 0 ? { kind: 'reusable' } : refused({ kind: 'incomplete' })
}

export async function checkCloneDestination(
  repository: GitHubRepository,
  reposPath: string,
  inspect: CommandRunner
): Promise<CloneDestination> {
  const destination = cloneDestinationOf(repository, reposPath)

  if (!(await exists(destination))) return { kind: 'absent' }

  try {
    const resolved = await realpath(destination).catch(() => undefined)

    if (resolved === undefined || !(await stat(resolved)).isDirectory())
      return refused({ kind: 'not-directory' })

    if (!isInside(await realpath(reposPath), resolved))
      return refused({ kind: 'outside-repos', resolved })

    return await checkCheckout(repository, resolved, inspect)
  } catch (cause) {
    if (isCommandFailure(cause) || isFileSystemError(cause))
      return refused({ kind: 'unverifiable', reason: reasonOf(cause) })

    throw cause
  }
}

function gitReason(result: CommandResult): string {
  const lines = result.stderr
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('Cloning into'))

  return lines.join(' ') || `git exited with status ${result.exitCode}`
}

async function stopped(
  kind: 'failed' | 'unknown',
  reason: string,
  destination: string
): Promise<Result.Result<CheckoutReceipt, CheckoutFailure>> {
  return Result.fail({ kind, reason, left: await exists(destination) })
}

// Re-verifies the destination first: a plan never clones over, or reuses, what it did not check.
// Nothing at the destination is ever deleted, whatever happens.
export async function executeCheckout(
  plan: ClonePlan,
  services: CloneServices
): Promise<Result.Result<CheckoutReceipt, CheckoutFailure>> {
  const { repository, reposPath, destination } = plan
  const now = await checkCloneDestination(repository, reposPath, services.inspect)
  const expected = plan.checkout === 'clone' ? 'absent' : 'reusable'

  if (now.kind !== expected) return Result.fail({ kind: 'changed', destination: now })

  if (plan.checkout === 'reuse')
    return Result.succeed({ kind: 'reused', repository, path: destination })

  try {
    await mkdir(reposPath, { recursive: true })
  } catch (cause) {
    return Result.fail({ kind: 'failed', reason: reasonOf(cause), left: false })
  }

  let result: CommandResult

  try {
    result = await services.clone.run(['git', 'clone', '--', repository.url, destination], {
      env: NON_INTERACTIVE_GIT,
    })
  } catch (cause) {
    if (!isCommandFailure(cause)) throw cause

    // Only a spawn failure proves git never ran; anything else may have written a checkout.
    const definite = cause instanceof CommandTransportError && cause.phase === 'spawn'

    return stopped(definite ? 'failed' : 'unknown', cause.message, destination)
  }

  if (result.exitCode !== 0) return stopped('failed', gitReason(result), destination)

  return Result.succeed({ kind: 'cloned', repository, path: destination })
}
