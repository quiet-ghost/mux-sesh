import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Result } from 'effect'
import { getDefaultConfig } from '../src/config'
import { workspaceToItem } from '../src/multiplexer/items'
import type {
  BackendKind,
  CreatedSessionReceipt,
  MultiplexerBackend,
} from '../src/multiplexer/types'
import {
  executeLaunchPlan,
  launchIntentFor,
  prepareLaunch,
  type LaunchContext,
  type LaunchPlan,
} from '../src/sessions/launch-plan'
import type { Item } from '../src/types'

let root = ''

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'mux-sesh-launch-')))
  await mkdir(join(root, 'api'))
  await writeFile(join(root, 'api', 'notes.md'), 'fixture\n')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function context(backend: BackendKind, liveSessions: Item[] = []): LaunchContext {
  return { config: getDefaultConfig(root), backend, invocationCwd: root, liveSessions }
}

function project(path: string): Item {
  return { title: 'api', desc: '', path, isSession: false, itemKind: 'project' }
}

function tmuxSession(id: string, title: string, path: string): Item {
  return workspaceToItem({ backend: 'tmux', id, title, path, isActive: false, unitCount: 1 })
}

async function plan(searchTerm: string, selected: Item | undefined, launch: LaunchContext) {
  const intent = launchIntentFor(searchTerm, selected)

  if (!intent) throw new Error('Expected a launch intent')

  return prepareLaunch(intent, launch)
}

describe('launch intents', () => {
  test('an empty query with a highlighted row is a candidate launch', () => {
    const selected = project(join(root, 'api'))

    expect(launchIntentFor('', selected)).toEqual({ kind: 'candidate', item: selected })
    expect(launchIntentFor('   ', undefined)).toBeUndefined()
  })

  test('path-like input stays a path intent and keeps the highlighted row as its fallback', () => {
    const selected = project(join(root, 'api'))

    expect(launchIntentFor('./api', selected)).toEqual({
      kind: 'path',
      input: './api',
      fallback: selected,
    })
  })

  test('plain text without a highlighted row creates a session named here', () => {
    expect(launchIntentFor('scratch', undefined)).toEqual({ kind: 'named-here', name: 'scratch' })
  })
})

describe('launch plans', () => {
  test('a highlighted project creates its rule-resolved session', async () => {
    const result = await plan('', project(join(root, 'api')), context('herdr'))

    expect(result).toMatchObject(
      Result.succeed({ kind: 'create', input: { title: 'api', path: join(root, 'api') } })
    )
  })

  test('a highlighted live agent focuses its exact native reference', async () => {
    const agent = workspaceToItem({
      backend: 'herdr',
      id: 'w3',
      title: 'twin',
      path: root,
      isActive: false,
      unitCount: 1,
      target: { kind: 'agent', tabId: 'w3:t1', paneId: 'w3:p2' },
    })

    expect(await plan('', agent, context('herdr'))).toEqual(
      Result.succeed({
        kind: 'focus',
        target: {
          backend: 'herdr',
          id: 'w3',
          title: 'twin',
          target: { kind: 'agent', tabId: 'w3:t1', paneId: 'w3:p2' },
        },
      })
    )
  })

  test('a live session with the same name and directory is focused by its id', async () => {
    const live = tmuxSession('$4', 'api', join(root, 'api'))

    expect(await plan('', project(join(root, 'api')), context('tmux', [live]))).toEqual(
      Result.succeed({ kind: 'focus', target: { backend: 'tmux', id: '$4', title: 'api' } })
    )
  })

  test('a tmux session with the same name elsewhere is a collision, not an attachment', async () => {
    const elsewhere = tmuxSession('$5', 'api', '/somewhere/else')
    const result = await plan('', project(join(root, 'api')), context('tmux', [elsewhere]))

    expect(Result.isFailure(result)).toBe(true)

    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({
        _tag: 'SessionNameCollision',
        name: 'api',
        existingPath: '/somewhere/else',
      })
      expect(result.failure.message).toContain('/somewhere/else')
    }
  })

  test('an existing typed directory or file launches that path', async () => {
    expect(await plan('./api', undefined, context('herdr'))).toMatchObject(
      Result.succeed({ kind: 'create', input: { title: 'api', path: join(root, 'api') } })
    )

    const file = await plan('./api/notes.md', undefined, context('herdr'))

    expect(file).toMatchObject(
      Result.succeed({ kind: 'create', input: { title: 'api_notes_md', path: join(root, 'api') } })
    )
  })

  test('a missing typed path never becomes a named session', async () => {
    const result = await plan('./missing', undefined, context('tmux'))

    expect(Result.isFailure(result)).toBe(true)

    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({ _tag: 'LaunchPathNotFound', input: './missing' })
      expect(result.failure.message).toContain(join(root, 'missing'))
    }
  })

  test('a missing typed path launches the highlighted row it was narrowing to', async () => {
    const selected = project(join(root, 'api'))

    expect(await plan('./ap', selected, context('herdr'))).toMatchObject(
      Result.succeed({ kind: 'create', input: { title: 'api', path: join(root, 'api') } })
    )
  })

  test('a plain name creates a session in the invocation directory', async () => {
    expect(await plan('scratch', undefined, context('herdr'))).toEqual(
      Result.succeed({ kind: 'create', input: { title: 'scratch', path: root } })
    )
  })
})

describe('launch execution', () => {
  const receipt: CreatedSessionReceipt = {
    workspace: { backend: 'tmux', id: '$12', title: 'api' },
    rootPaneId: '%3',
  }

  function recordingBackend(failures: { start?: Error; open?: Error; create?: Error } = {}) {
    const calls: string[] = []

    function unsupported(): never {
      throw new Error('Launch execution must only create, start, and open')
    }

    const backend: MultiplexerBackend = {
      kind: 'tmux',
      capabilities: { previousWorkspace: true },
      async create(input) {
        calls.push(`create ${input.title} ${input.path}`)

        if (failures.create) throw failures.create

        return receipt
      },
      async start(created, command) {
        calls.push(`start ${created.rootPaneId} ${command}`)

        if (failures.start) throw failures.start
      },
      async open(target) {
        calls.push(`open ${target.id}`)

        if (failures.open) throw failures.open
      },
      openOrCreate: unsupported,
      list: unsupported,
      rename: unsupported,
      close: unsupported,
      current: unsupported,
      directory: unsupported,
      details: unsupported,
      openEditor: unsupported,
    }

    return { backend, calls }
  }

  const createPlan: LaunchPlan = {
    kind: 'create',
    input: { title: 'api', path: '/fixture/api', startupCommand: 'bun dev' },
  }

  test('a focus plan opens the exact target and creates nothing', async () => {
    const { backend, calls } = recordingBackend()
    const target = { backend: 'tmux' as const, id: '$4', title: 'api' }

    expect(await executeLaunchPlan({ kind: 'focus', target }, backend)).toEqual({
      kind: 'focused',
      target,
    })
    expect(calls).toEqual(['open $4'])
  })

  test('a create plan starts in the created pane, then focuses the created session', async () => {
    const { backend, calls } = recordingBackend()

    expect(await executeLaunchPlan(createPlan, backend)).toEqual({ kind: 'created', receipt })
    expect(calls).toEqual(['create api /fixture/api', 'start %3 bun dev', 'open $12'])
  })

  test('a failed startup keeps the created session and does not focus or recreate it', async () => {
    const { backend, calls } = recordingBackend({ start: new Error('send-keys refused') })

    const failure = await rejectionOf(executeLaunchPlan(createPlan, backend))

    expect(failure).toMatchObject({ _tag: 'LaunchFollowUpFailed', step: 'start', receipt })
    expect(failure.message).toContain('send-keys refused')
    expect(failure.message).toContain('kept')
    expect(calls).toEqual(['create api /fixture/api', 'start %3 bun dev'])
  })

  test('a failed focus after creation reports the created session', async () => {
    const { backend } = recordingBackend({ open: new Error('no client') })

    expect(await rejectionOf(executeLaunchPlan(createPlan, backend))).toMatchObject({
      _tag: 'LaunchFollowUpFailed',
      step: 'focus',
      receipt,
    })
  })

  test('a failed creation is not reported as a created session', async () => {
    const creation = new Error('duplicate session')
    const { backend, calls } = recordingBackend({ create: creation })

    expect(await rejectionOf(executeLaunchPlan(createPlan, backend))).toBe(creation)
    expect(calls).toEqual(['create api /fixture/api'])
  })
})

async function rejectionOf(run: Promise<unknown>): Promise<Error> {
  try {
    await run
  } catch (cause) {
    if (cause instanceof Error) return cause
  }

  throw new Error('Expected the launch to fail with an Error')
}
