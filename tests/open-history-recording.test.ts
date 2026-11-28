import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { handleLastSession, handleNewSessionSubmit, handleSelect } from '../src/app/session-actions'
import { workspaceToItem } from '../src/multiplexer/items'
import { CommandTimeoutError } from '../src/multiplexer/command'
import { MultiplexerError, type MultiplexerBackend } from '../src/multiplexer/types'
import * as Schema from 'effect/Schema'
import { createOpenHistory, type OpenHistory } from '../src/search/frecency-store'
import type { LaunchPreview } from '../src/sessions/launch-plan'
import { NO_GIT } from './fixtures/local-github'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mux-sesh-open-history-'))
  roots.push(root)

  return root
}

interface RecordingHistory {
  readonly history: OpenHistory
  readonly file: string
  lines(): Promise<string[]>
}

async function recordingHistory(): Promise<RecordingHistory> {
  const file = join(await tempRoot(), 'frecency.jsonl')

  const history = createOpenHistory({
    path: () => file,
    now: () => 1_000,
    timeoutMs: 1000,
    report: message => {
      throw new Error(`unexpected history report: ${message}`)
    },
  })

  history.configure(true)

  return {
    history,
    file,
    async lines() {
      const handle = Bun.file(file)

      return (await handle.exists()) ? (await handle.text()).trim().split('\n') : []
    },
  }
}

function unsupported(): never {
  throw new Error('The open-history backend does not implement that operation')
}

function backend(overrides: Partial<MultiplexerBackend>): MultiplexerBackend {
  return {
    kind: 'herdr',
    capabilities: { previousWorkspace: false },
    list: unsupported,
    details: unsupported,
    open: unsupported,
    openOrCreate: unsupported,
    create: unsupported,
    start: unsupported,
    rename: unsupported,
    close: unsupported,
    current: unsupported,
    directory: unsupported,
    openEditor: unsupported,
    ...overrides,
  }
}

const create: LaunchPreview = {
  kind: 'ready',
  subject: 'selected',
  plan: {
    kind: 'create',
    input: { title: 'scratch', path: '/fixture/scratch', startupCommand: 'bun dev' },
  },
}

const beta = workspaceToItem({
  backend: 'herdr',
  id: 'w2',
  title: 'beta',
  path: '/fixture/beta',
  isActive: false,
  unitCount: 1,
})

async function failureOf(run: () => Promise<void>): Promise<string> {
  try {
    await run()
  } catch (cause) {
    return cause instanceof Error ? cause.message : 'a non-Error value'
  }

  throw new Error('Expected the action to fail')
}

const decodeEntryKey = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ key: Schema.String }))
)

function keyOf(line: string): string {
  return decodeEntryKey(line).key
}

function entry(key: string, frequency = 1): string {
  return JSON.stringify({ key, frequency, lastOpen: 1_000 })
}

describe('opens that are not confirmed record nothing', () => {
  test('a failed open', async () => {
    const recording = await recordingHistory()

    const failing = backend({
      open: async () => {
        throw new MultiplexerError('command-failed', 'no attached client')
      },
    })

    expect(await failureOf(() => handleSelect(beta, null, failing, recording.history))).toContain(
      'no attached client'
    )
    expect(await recording.lines()).toEqual([])
  })

  test('a failed create', async () => {
    const recording = await recordingHistory()

    const failing = backend({
      create: async () => {
        throw new MultiplexerError('command-failed', 'server gone')
      },
    })

    const outcome = await handleNewSessionSubmit(create, failing, NO_GIT, recording.history)

    expect(outcome.kind).toBe('failed')
    expect(await recording.lines()).toEqual([])
  })

  test('a create whose result is unknown', async () => {
    const recording = await recordingHistory()

    const unfinished = backend({
      create: async () => {
        throw new CommandTimeoutError({ executable: 'herdr', timeoutMs: 10 })
      },
    })

    const outcome = await handleNewSessionSubmit(create, unfinished, NO_GIT, recording.history)

    expect(outcome.kind).toBe('unknown')
    expect(await recording.lines()).toEqual([])
  })

  test('a refused launch or previous-session request', async () => {
    const recording = await recordingHistory()
    const quiet = backend({})

    const refused = await handleNewSessionSubmit(
      { kind: 'no-match', query: 'zzz' },
      quiet,
      NO_GIT,
      recording.history
    )

    expect(refused.kind).toBe('refused')
    expect(await failureOf(() => handleLastSession([beta], quiet, recording.history))).toContain(
      'Previous workspace is unavailable'
    )
    expect(await recording.lines()).toEqual([])
  })
})

test('a created session whose startup command failed still counts as opened, once', async () => {
  const recording = await recordingHistory()

  const created = backend({
    create: async input => ({
      workspace: { backend: 'herdr', id: 'w9', title: input.title },
      rootPaneId: 'w9:p1',
    }),
    start: async () => {
      throw new MultiplexerError('command-failed', 'pane closed')
    },
  })

  const outcome = await handleNewSessionSubmit(create, created, NO_GIT, recording.history)

  expect(outcome.kind).toBe('partial')
  expect(await recording.lines()).toEqual([
    entry('session:herdr:scratch'),
    entry('path:/fixture/scratch'),
  ])
})

describe('confirmed opens through the picker screen', () => {
  interface HandoffRun {
    readonly stdout: string
    readonly stderr: string
    readonly exitCode: number
    readonly file: string
  }

  async function run(mode: 'select' | 'launch' | 'off'): Promise<HandoffRun> {
    const root = await tempRoot()
    const state = join(root, 'state')
    const project = join(root, 'gamma')
    const file = join(state, 'mux-sesh', 'frecency.jsonl')
    await mkdir(project)

    const proc = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, 'fixtures/open-history-handoff.tsx'),
        mode,
        project,
        file,
      ],
      {
        cwd: join(import.meta.dir, '..'),
        env: { ...process.env, HOME: root, XDG_STATE_HOME: state },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 10_000,
        killSignal: 'SIGKILL',
      }
    )

    try {
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])

      return { exitCode, stdout, stderr, file }
    } finally {
      if (proc.exitCode === null) proc.kill('SIGKILL')
    }
  }

  function lines(text: string): string[] {
    return text.trim().split('\n')
  }

  test(
    'selecting a session writes its record before the terminal handoff runs',
    async () => {
      const result = await run('select')

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)

      const written = lines(await Bun.file(result.file).text())
      expect(written.map(keyOf)).toEqual(['session:herdr:beta'])
      // The record was on disk when teardown began, before the handoff command ran.
      expect(lines(result.stdout)).toEqual([
        `at teardown: ${written[0]}`,
        'handoff ran',
        'exit code=0',
      ])
    },
    { timeout: 15_000 }
  )

  test(
    'launching a project records its session and directory before the handoff, once',
    async () => {
      const result = await run('launch')

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)

      const written = lines(await Bun.file(result.file).text())
      const gamma = `path:${join(result.file, '..', '..', '..', 'gamma')}`
      expect(written.map(keyOf)).toEqual(['session:herdr:gamma', gamma])
      expect(lines(result.stdout)).toEqual([
        `at teardown: ${written[0]}`,
        `${written[1]}`,
        'handoff ran',
        'exit code=0',
      ])
    },
    { timeout: 15_000 }
  )

  test(
    'with search_history off, an open writes nothing',
    async () => {
      const result = await run('off')

      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      expect(lines(result.stdout)).toEqual(['at teardown: nothing', 'handoff ran', 'exit code=0'])
      expect(await Bun.file(result.file).exists()).toBe(false)
    },
    { timeout: 15_000 }
  )
})
