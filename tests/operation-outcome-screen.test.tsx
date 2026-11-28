import { afterEach, expect, test } from 'bun:test'
import { TextareaRenderable } from '@opentui/core'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError } from '../src/multiplexer/types'
import { renderSessionScreen } from './fixtures/session-screen'
import { unsupportedBackend } from './fixtures/fake-backend'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

const alpha: LiveWorkspace = {
  backend: 'herdr',
  id: 'w1',
  title: 'alpha',
  path: '/fixture/alpha',
  isActive: true,
  unitCount: 1,
}

function failingBackend(open: () => Promise<never>) {
  const calls: string[] = []

  const backend: MultiplexerBackend = unsupportedBackend({
    kind: 'herdr',
    capabilities: { previousWorkspace: false },
    async list() {
      return [alpha]
    },
    async details(workspace) {
      return { workspace, isActive: true, unitLabel: 'Tabs', units: [], agents: [] }
    },
    async create(input) {
      calls.push(`create ${input.title}`)

      return { workspace: { backend: 'herdr', id: 'w9', title: input.title }, rootPaneId: 'w9:p1' }
    },
    async start() {
      calls.push('start')
    },
    async open(target) {
      calls.push(`open ${target.id}`)

      return open()
    },
  })

  return { backend, calls }
}

function searchText(fixture: Screen): string {
  const focused = fixture.renderer.currentFocusedRenderable

  if (!(focused instanceof TextareaRenderable))
    throw new Error('Expected the search field to own focus')

  return focused.plainText
}

test('a created workspace that cannot be opened shows the outcome screen, retries only the open, and keeps the draft', async () => {
  const { backend, calls } = failingBackend(async () => {
    throw new MultiplexerError('command-failed', 'Herdr has no attached client')
  })

  const scratch = {
    title: 'scratch',
    desc: '',
    path: '/fixture/scratch',
    isSession: false,
    itemKind: 'project' as const,
  }

  screen = await renderSessionScreen(
    { width: 120, height: 36 },
    { workspaces: [alpha], backend, projects: [scratch], config: { defaultSession: {} } }
  )
  await screen.pressKey('n')
  await screen.typeText('scratch')
  await screen.settle()
  await screen.pressKey('RETURN')
  await screen.settle()

  const outcome = await screen.frame()
  expect(outcome).toContain('Workspace created, but not opened')
  expect(outcome).toContain("Created workspace 'scratch'")
  expect(outcome).toContain('Herdr has no attached client')
  expect(outcome).toContain("open 'scratch' enter")
  expect(screen.defects).toEqual([])

  await screen.pressKey('RETURN')
  await screen.settle()

  expect(calls).toEqual(['create scratch', 'open w9', 'open w9'])
  expect(await screen.frame()).toContain('Workspace created, but not opened')

  await screen.pressKey('ESCAPE')

  expect(await screen.frame()).not.toContain('Workspace created, but not opened')
  expect(searchText(screen)).toBe('scratch')
})

test('a defect while selecting reaches crash recovery instead of escaping as an unhandled rejection', async () => {
  const defect = new TypeError('fixture select defect')

  const { backend } = failingBackend(async () => {
    throw defect
  })

  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [alpha], backend })
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(screen.defects).toEqual([defect])
})

test('a synchronous defect inside a key handler reaches crash recovery', async () => {
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [alpha] })

  // The fixture backend's rename throws synchronously, so confirming a new name throws a defect
  // from the key's action. (Before DEV-343 this used d d, which no longer closes anything without
  // a review.) ActionOwner's own tests cover a task that throws before returning a promise.
  await screen.pressKey('x', { ctrl: true })
  await screen.pressKey('r')
  await screen.typeText('-renamed')
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(screen.defects).toHaveLength(1)
  expect(String(screen.defects[0])).toContain('does not implement that action')
})
