import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHerdrBackend } from '../src/herdr/backend'
import {
  CommandTimeoutError,
  createCommandRunner,
  type CommandOptions,
  type CommandRunner,
} from '../src/multiplexer/command'
import { isBackendFailure } from '../src/multiplexer/failure'
import { createTmuxBackend } from '../src/multiplexer/tmux-backend'
import {
  MultiplexerError,
  type CreatedSessionReceipt,
  type FocusOutcome,
  type LiveWorkspace,
  type MultiplexerBackend,
  type WorkspaceRef,
} from '../src/multiplexer/types'
import { executeLaunchPlan, LaunchFollowUpFailed } from '../src/sessions/launch-plan'
import { createHerdrSimulator, type HerdrProtocolFixture } from './fixtures/herdr-simulator'

// One contract suite, run against every backend column:
// - tmux: the real adapter on a disposable `tmux -L` server whose socket, HOME, and config live in a
//   temporary directory, so neither the user's server nor their tmux.conf is ever reached.
// - Herdr: the real adapter over a scripted server replaying recorded protocol fixtures; no `herdr`
//   process runs, so no live Herdr workspace is ever touched.

type Context = 'inside' | 'outside'

interface ConformanceFixture {
  backend(context: Context): MultiplexerBackend
  // A backend whose runner gives up after `timeoutMs`, for use after `hang`.
  impatientBackend(timeoutMs: number): MultiplexerBackend
  readonly directory: string
  // Ground truth read from the server itself, never from the adapter under test.
  nativeIds(): Promise<string[]>
  seed(title: string): Promise<WorkspaceRef>
  closeExternally(ref: WorkspaceRef): Promise<void>
  // Leaves the session alive but takes its root pane away, so a later start cannot reach it.
  loseRootPane(receipt: CreatedSessionReceipt): Promise<void>
  ranInRootPane(receipt: CreatedSessionReceipt, command: string, marker: string): Promise<boolean>
  // Where the server's focus now points, when the backend can tell without an attached client.
  focusedId(): Promise<string | undefined>
  expectedHandoff(ref: WorkspaceRef): readonly string[]
  stopServer(): Promise<void>
  hang(timeoutMs: number): Promise<void>
  dispose(): Promise<void>
}

interface ConformanceSubject {
  readonly name: string
  readonly available: boolean
  readonly idPattern: RegExp
  readonly paneIdPattern: RegExp
  // tmux focuses inside a session by switching an attached client: covered by the opt-in harness.
  readonly focusesWithoutClient: boolean
  // tmux treats a stopped server as an empty inventory that the next create starts again.
  readonly stoppedInventory: 'empty' | 'failure'
  setup(): Promise<ConformanceFixture>
}

const tmuxAvailable = Bun.which('tmux') !== null
let fixtureSerial = 0

// Every tmux call carries an isolated socket directory and HOME, so even a server the adapter
// starts by itself (after a stop) cannot load the user's configuration or plugins.
function isolatedRunner(base: CommandRunner, env: Readonly<Record<string, string>>): CommandRunner {
  return {
    run: (command, options?: CommandOptions) =>
      base.run(command, { ...options, env: { ...options?.env, ...env } }),
  }
}

async function poll(check: () => Promise<boolean>, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await check()) return true

    await Bun.sleep(25)
  }

  return check()
}

function tmuxSubject(): ConformanceSubject {
  return {
    name: 'tmux (disposable -L server)',
    available: tmuxAvailable,
    idPattern: /^\$\d+$/,
    paneIdPattern: /^%\d+$/,
    focusesWithoutClient: false,
    stoppedInventory: 'empty',
    async setup() {
      fixtureSerial += 1

      const root = await realpath(await mkdtemp(join(tmpdir(), 'mux-sesh-conformance-')))
      const directory = join(root, 'project')
      const socketName = `conformance-${process.pid}-${fixtureSerial}`
      const env = { TMUX_TMPDIR: root, HOME: root, XDG_CONFIG_HOME: root, SHELL: '/bin/sh' }
      const runner = isolatedRunner(createCommandRunner(), env)
      const resumers: Array<() => void> = []

      await mkdir(directory)

      async function harness(...args: string[]): Promise<string> {
        const result = await runner.run(['tmux', '-L', socketName, '-f', '/dev/null', ...args])

        if (result.exitCode !== 0)
          throw new Error(`Harness tmux ${args[0]} failed: ${result.stderr}`)

        return result.stdout.trim()
      }

      function backend(context: Context, base: CommandRunner = runner): MultiplexerBackend {
        return createTmuxBackend({ runner: base, insideTmux: context === 'inside', socketName })
      }

      return {
        directory,
        backend: context => backend(context),
        impatientBackend: timeoutMs =>
          backend(
            'outside',
            isolatedRunner(createCommandRunner({ timeoutMs, killGraceMs: 100 }), env)
          ),
        async nativeIds() {
          const result = await runner.run([
            'tmux',
            '-L',
            socketName,
            'list-sessions',
            '-F',
            '#{session_id}',
          ])

          return result.exitCode === 0 ? result.stdout.split('\n').filter(Boolean) : []
        },
        async seed(title) {
          const id = await harness(
            'new-session',
            '-d',
            '-s',
            title,
            '-c',
            directory,
            '-P',
            '-F',
            '#{session_id}'
          )

          return { backend: 'tmux', id, title }
        },
        async closeExternally(ref) {
          await harness('kill-session', '-t', ref.id)
        },
        async loseRootPane(receipt) {
          await harness('split-window', '-d', '-t', receipt.workspace.id, '-c', directory)
          await harness('kill-pane', '-t', receipt.rootPaneId)
        },
        ranInRootPane: (receipt, _command, marker) =>
          poll(async () =>
            (await harness('capture-pane', '-p', '-t', receipt.rootPaneId)).includes(marker)
          ),
        focusedId: async () => undefined,
        expectedHandoff: ref => ['tmux', '-L', socketName, 'attach-session', '-t', ref.id],
        async stopServer() {
          await harness('kill-server')
        },
        async hang() {
          const pid = Number(await harness('display-message', '-p', '#{pid}'))

          process.kill(pid, 'SIGSTOP')
          resumers.push(() => process.kill(pid, 'SIGCONT'))
        },
        async dispose() {
          for (const resume of resumers) resume()

          await runner.run(['tmux', '-L', socketName, 'kill-server'])
          await rm(root, { recursive: true, force: true })
        },
      }
    },
  }
}

function herdrSubject(protocol: HerdrProtocolFixture): ConformanceSubject {
  return {
    name: `Herdr (${protocol} fixture)`,
    available: true,
    idPattern: /^w[1-9A-Z0]+$/,
    paneIdPattern: /^w[1-9A-Z0]+:p[1-9A-Z0]+$/,
    focusesWithoutClient: true,
    stoppedInventory: 'failure',
    async setup() {
      const sim = createHerdrSimulator(protocol)
      const directory = '/fixture/project'

      return {
        directory,
        backend: context =>
          createHerdrBackend({ runner: sim.runner, insideHerdr: context === 'inside' }),
        impatientBackend: () => createHerdrBackend({ runner: sim.runner, insideHerdr: false }),
        nativeIds: async () => sim.workspaceIds(),
        async seed(title) {
          return { backend: 'herdr', id: sim.seed(title, directory).workspaceId, title }
        },
        async closeExternally(ref) {
          sim.closeExternally(ref.id)
        },
        async loseRootPane(receipt) {
          sim.splitAndCloseRoot(receipt.workspace.id, receipt.rootPaneId)
        },
        ranInRootPane: async (receipt, command) =>
          sim.commandsRunIn(receipt.rootPaneId).includes(command),
        focusedId: async () => sim.focusedWorkspaceId(),
        expectedHandoff: () => ['herdr'],
        async stopServer() {
          sim.stopServer()
        },
        async hang(timeoutMs) {
          sim.hang(timeoutMs)
        },
        async dispose() {},
      }
    },
  }
}

const SUBJECTS: readonly ConformanceSubject[] = [
  tmuxSubject(),
  herdrSubject('protocol-22'),
  herdrSubject('protocol-17'),
]

async function failureOf<A>(operation: Promise<A>): Promise<Error> {
  try {
    await operation
  } catch (cause) {
    if (cause instanceof Error) return cause

    throw new Error('The backend rejected with a non-Error value', { cause })
  }

  throw new Error('Expected the backend operation to fail, but it succeeded')
}

function expectRecoverable(cause: Error): void {
  expect(isBackendFailure(cause)).toBe(true)

  if (cause instanceof MultiplexerError) expect(cause.code).toBe('command-failed')
}

// Workspace rows only: Herdr agents share their workspace id but are separate focus targets.
function workspaceRows(listed: readonly LiveWorkspace[]): LiveWorkspace[] {
  return listed.filter(row => row.backend === 'tmux' || row.target === undefined)
}

function handoffCommand(outcome: FocusOutcome): readonly string[] | undefined {
  return outcome.kind === 'handoff' ? outcome.handoff.command : undefined
}

for (const subject of SUBJECTS) {
  describe.skipIf(!subject.available)(`backend conformance: ${subject.name}`, () => {
    let live: ConformanceFixture | undefined

    function fixture(): ConformanceFixture {
      if (!live) throw new Error('The conformance fixture was not set up')

      return live
    }

    beforeEach(async () => {
      live = await subject.setup()
    })

    afterEach(async () => {
      const current = live

      live = undefined
      await current?.dispose()
    })

    test('list reports the ids the server assigned', async () => {
      const seeded = [await fixture().seed('alpha'), await fixture().seed('alpha-2')]
      const rows = workspaceRows(await fixture().backend('outside').list())

      expect(rows.map(row => [row.id, row.title])).toEqual(seeded.map(ref => [ref.id, ref.title]))
      expect(rows.map(row => row.id).sort()).toEqual((await fixture().nativeIds()).sort())

      for (const row of rows) expect(row.id).toMatch(subject.idPattern)
    })

    test('create returns the ids the server reported and does not focus', async () => {
      await fixture().seed('api')
      const focusedBefore = await fixture().focusedId()
      const before = new Set(await fixture().nativeIds())

      const receipt = await fixture()
        .backend('outside')
        .create({ title: 'web', path: fixture().directory })

      const added = (await fixture().nativeIds()).filter(id => !before.has(id))

      expect(added).toEqual([receipt.workspace.id])
      expect(receipt.workspace.id).toMatch(subject.idPattern)
      expect(receipt.workspace.id).not.toBe(receipt.workspace.title)
      expect(receipt.rootPaneId).toMatch(subject.paneIdPattern)
      expect(await fixture().focusedId()).toBe(focusedBefore)
    })

    test('start runs the command in the receipt root pane', async () => {
      const backend = fixture().backend('outside')
      const receipt = await backend.create({ title: 'web', path: fixture().directory })
      const command = 'echo conformance-$((6 * 7))'

      await backend.start(receipt, command)

      expect(await fixture().ranInRootPane(receipt, command, 'conformance-42')).toBe(true)
    })

    test('open outside the multiplexer checks the target, then hands off to its captured id', async () => {
      const target = await fixture().seed('api')
      await fixture().seed('api-2')

      const outcome = await fixture().backend('outside').open(target)

      expect(handoffCommand(outcome)).toEqual(fixture().expectedHandoff(target))

      if (subject.focusesWithoutClient) expect(await fixture().focusedId()).toBe(target.id)
    })

    test.skipIf(!subject.focusesWithoutClient)(
      'open inside the multiplexer focuses without a handoff',
      async () => {
        await fixture().seed('api')
        const target = await fixture().seed('web')

        expect(await fixture().backend('inside').open(target)).toEqual({ kind: 'focused' })
        expect(await fixture().focusedId()).toBe(target.id)
      }
    )

    test('openOrCreate reuses the existing workspace instead of creating a duplicate', async () => {
      const existing = await fixture().seed('api')
      const before = await fixture().nativeIds()

      const outcome = await fixture()
        .backend('outside')
        .openOrCreate({ title: 'api', path: fixture().directory })

      expect(await fixture().nativeIds()).toEqual(before)
      expect(handoffCommand(outcome)).toEqual(fixture().expectedHandoff(existing))
    })

    test('rename keeps the id and returns the name the backend applied', async () => {
      const target = await fixture().seed('api')
      const backend = fixture().backend('outside')

      const renamed = await backend.rename(target, 'api v2.1')
      const listed = workspaceRows(await backend.list()).find(row => row.id === target.id)

      expect(renamed.id).toBe(target.id)
      expect(renamed.backend).toBe(target.backend)
      expect(listed?.title).toBe(renamed.title)
    })

    test('close removes exactly the captured id and leaves look-alike siblings', async () => {
      const target = await fixture().seed('alpha')
      const sibling = await fixture().seed('alpha-2')

      await fixture().backend('outside').close(target)

      expect(await fixture().nativeIds()).toEqual([sibling.id])
    })

    test('a target closed elsewhere fails recoverably for open, rename, and close', async () => {
      const target = await fixture().seed('api')
      // A sibling keeps the server up, so this is a missing target rather than a stopped server.
      const sibling = await fixture().seed('keep')
      const backend = fixture().backend('outside')

      await fixture().closeExternally(target)

      expectRecoverable(await failureOf(backend.open(target)))
      expectRecoverable(await failureOf(backend.rename(target, 'renamed')))
      expectRecoverable(await failureOf(backend.close(target)))

      expect(await fixture().nativeIds()).toEqual([sibling.id])
    })

    test('a stopped server is a recoverable state, not a defect', async () => {
      const target = await fixture().seed('api')
      const backend = fixture().backend('outside')

      await fixture().stopServer()

      if (subject.stoppedInventory === 'empty') {
        expect(await backend.list()).toEqual([])
      } else {
        expectRecoverable(await failureOf(backend.list()))
      }

      expectRecoverable(await failureOf(backend.open(target)))
    })

    test('a hung server is stopped at the runner deadline as a timeout', async () => {
      await fixture().seed('api')
      await fixture().hang(250)

      const cause = await failureOf(fixture().impatientBackend(250).list())

      expect(cause).toBeInstanceOf(CommandTimeoutError)
      expect(isBackendFailure(cause)).toBe(true)
    })

    test('a startup failure after create keeps the created session and names it', async () => {
      const real = fixture().backend('outside')

      const backend: MultiplexerBackend = {
        ...real,
        // The root pane dies between create and start, as when its shell exits immediately.
        async start(receipt, command) {
          await fixture().loseRootPane(receipt)

          return real.start(receipt, command)
        },
      }

      const cause = await failureOf(
        executeLaunchPlan(
          {
            kind: 'create',
            input: { title: 'web', path: fixture().directory, startupCommand: 'bun dev' },
          },
          backend
        )
      )

      if (!(cause instanceof LaunchFollowUpFailed)) throw cause

      expect(cause.step).toBe('start')
      expect(isBackendFailure(cause.cause)).toBe(true)
      expect(await fixture().nativeIds()).toEqual([cause.receipt.workspace.id])
      expect(cause.message).toContain("Created 'web', but its startup command failed")
    })

    test('details and directory read the captured id', async () => {
      await fixture().seed('api')
      const target = await fixture().seed('web')
      const backend = fixture().backend('outside')

      expect((await backend.details(target)).workspace.id).toBe(target.id)
      expect(await backend.directory(target)).toStartWith('/')
    })
  })
}
