import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createCommandRunner,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from '../../src/multiplexer/command'
import type { CloneServices } from '../../src/sessions/clone-plan'

// Fixture git never runs the user's hooks, signs, prompts for an identity, or reaches the network:
// every transport but file:// is refused, so an unpublished repository fails locally.
const FIXTURE_GIT = [
  '-c',
  'protocol.allow=never',
  ...['http', 'https', 'ssh', 'git', 'ext'].flatMap(name => ['-c', `protocol.${name}.allow=never`]),
  '-c',
  'protocol.file.allow=always',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'init.defaultBranch=main',
  '-c',
  'user.name=fixture',
  '-c',
  'user.email=fixture@example.invalid',
  '-c',
  'commit.gpgsign=false',
]

type CloneRun = () => Promise<CommandResult>

export interface LocalGitHub {
  readonly root: string
  readonly reposPath: string
  // Every `git clone` the code under test started, as it asked for it.
  readonly clones: (readonly string[])[]
  readonly services: CloneServices
  // Replaces how a clone runs; `run` performs the real local clone.
  interceptClone(
    handler: ((run: CloneRun, options?: CommandOptions) => Promise<CommandResult>) | undefined
  ): void
  // Publishes https://github.com/<owner>/<repo> as a local bare repository with one commit.
  publish(owner: string, repo: string): Promise<void>
  // Plants a checkout at `path`, with `origin` as its stored remote and, optionally, a commit.
  checkout(path: string, origin: string | undefined, commit: boolean): Promise<void>
  git(args: readonly string[], cwd?: string): Promise<CommandResult>
  remove(): Promise<void>
}

// GitHub URLs are rewritten to local bare repositories under a temp directory, so clone tests run
// real git without the network. Per-owner rules are longer than any user-level github.com rule.
export async function createLocalGitHub(): Promise<LocalGitHub> {
  const root = await mkdtemp(join(tmpdir(), 'mux-sesh-clone-'))
  const remotes = join(root, 'remotes')
  const reposPath = join(root, 'repos')
  const owners = new Set<string>()
  const clones: (readonly string[])[] = []
  const base = createCommandRunner()
  let intercept: ((run: CloneRun, options?: CommandOptions) => Promise<CommandResult>) | undefined

  await mkdir(remotes)

  function rewrites(): string[] {
    return [...owners].flatMap(owner => [
      '-c',
      `url.file://${join(remotes, owner)}/.insteadOf=https://github.com/${owner}/`,
      '-c',
      `url.file://${join(remotes, owner)}/.insteadOf=git@github.com:${owner}/`,
    ])
  }

  async function git(args: readonly string[], cwd?: string): Promise<CommandResult> {
    return base.run(['git', ...FIXTURE_GIT, ...args], { cwd })
  }

  async function mustGit(args: readonly string[], cwd?: string): Promise<void> {
    const result = await git(args, cwd)

    if (result.exitCode !== 0)
      throw new Error(`Fixture git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }

  const runner: CommandRunner = {
    async run(command, options) {
      if (command[0] !== 'git')
        throw new Error(`The local GitHub runner only runs git, not ${command[0]}`)

      const rest = command.slice(1)
      const real = () => base.run(['git', ...FIXTURE_GIT, ...rewrites(), ...rest], options)

      if (rest[0] !== 'clone') return real()

      clones.push(command)

      return intercept ? intercept(real, options) : real()
    },
  }

  return {
    root,
    reposPath,
    clones,
    services: { inspect: runner, clone: runner },
    interceptClone(handler) {
      intercept = handler
    },
    async publish(owner, repo) {
      const seed = join(root, 'seed', owner, repo)
      await mkdir(seed, { recursive: true })
      await mustGit(['init', '-q', seed])
      await mustGit(['commit', '-q', '--allow-empty', '-m', 'initial'], seed)
      await mkdir(join(remotes, owner), { recursive: true })
      await mustGit(['clone', '-q', '--bare', seed, join(remotes, owner, `${repo}.git`)])
      owners.add(owner)
    },
    async checkout(path, origin, commit) {
      await mkdir(path, { recursive: true })
      await mustGit(['init', '-q', path])

      if (origin !== undefined) await mustGit(['remote', 'add', 'origin', origin], path)

      if (commit) await mustGit(['commit', '-q', '--allow-empty', '-m', 'local'], path)
    },
    git,
    async remove() {
      await rm(root, { recursive: true, force: true })
    },
  }
}

function noGit(): never {
  throw new Error('This test runs no git; pass local GitHub clone services to exercise a clone')
}

// For tests whose launches never inspect or clone a checkout.
export const NO_GIT: CloneServices = { inspect: { run: noGit }, clone: { run: noGit } }
