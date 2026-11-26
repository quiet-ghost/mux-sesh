import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Result } from 'effect'
import { getDefaultConfig } from '../src/config'
import { workspaceToItem } from '../src/multiplexer/items'
import type { BackendKind } from '../src/multiplexer/types'
import { launchIntentFor, prepareLaunch, type LaunchContext } from '../src/sessions/launch-plan'
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
