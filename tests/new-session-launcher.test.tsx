import { afterEach, describe, expect, test } from 'bun:test'
import { TextareaRenderable } from '@opentui/core'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError } from '../src/multiplexer/types'
import type { Item, KeybindMode } from '../src/types'
import { footerGroups, hints } from './fixtures/footer'
import { renderSessionScreen } from './fixtures/session-screen'
import { selectedRow } from './fixtures/selection'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

const MODES: KeybindMode[] = ['vim', 'standard']

const alpha: LiveWorkspace = {
  backend: 'herdr',
  id: 'w1',
  title: 'alpha',
  path: '/fixture/alpha',
  isActive: true,
  unitCount: 1,
}

function project(title: string, path = `/fixture/${title}`): Item {
  return { title, desc: '', path, isSession: false, itemKind: 'project' }
}

function unsupported(): never {
  throw new Error('The launcher backend does not implement that operation')
}

// Opening always fails with an expected error, so a launch reports instead of exiting the test.
function recordingBackend() {
  const calls: string[] = []

  const backend: MultiplexerBackend = {
    kind: 'herdr',
    capabilities: { previousWorkspace: false },
    async list() {
      return [alpha]
    },
    async details(workspace) {
      return { workspace, isActive: true, unitLabel: 'Tabs', units: [], agents: [] }
    },
    async create(input) {
      calls.push(`create ${input.title} ${input.path}`)

      return { workspace: { backend: 'herdr', id: 'w9', title: input.title }, rootPaneId: 'w9:p1' }
    },
    async start(created, command) {
      calls.push(`start ${created.rootPaneId} ${command}`)
    },
    async open(target) {
      calls.push(`open ${target.id}`)

      throw new MultiplexerError('command-failed', 'the fixture has no attached client')
    },
    openOrCreate: unsupported,
    rename: unsupported,
    close: unsupported,
    current: unsupported,
    directory: unsupported,
    openEditor: unsupported,
  }

  return { backend, calls }
}

async function openNew(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('New session')
  await fixture.pressKey('RETURN')
  await fixture.settle()
}

// New's steps and cancel sit on the left; what Enter does to the planned row sits on the right.
const STEPS = hints(
  ['name', 'ctrl+n'],
  ['startup', 'ctrl+t'],
  ['here', 'ctrl+g'],
  ['file', 'ctrl+o']
)

const CANCEL = hints(['cancel', 'esc'])

function newFooter(enter: string, global = `${STEPS}  ${CANCEL}`) {
  return { global, target: enter ? hints([enter, 'enter']) : '' }
}

function footerOf(frame: string) {
  return footerGroups(frame)
}

function searchText(fixture: Screen): string {
  const focused = fixture.renderer.currentFocusedRenderable

  if (!(focused instanceof TextareaRenderable))
    throw new Error('Expected the search field to own focus')

  return focused.plainText
}

describe('project-first New', () => {
  test.each(MODES)(
    '%s: empty-query Enter creates the selected project exactly as the summary says',
    async keybindMode => {
      const { backend, calls } = recordingBackend()

      screen = await renderSessionScreen(
        { width: 120, height: 36 },
        {
          keybindMode,
          backend,
          projects: [project('api'), project('beta')],
          config: { defaultSession: { startupCommand: 'bun dev' } },
        }
      )
      await openNew(screen)

      const frame = await screen.frame()
      expect(frame).toContain("Create 'api' in /fixture/api, then run: bun dev")
      expect(footerOf(frame)).toEqual(newFooter('create'))

      await screen.pressKey('RETURN')
      await screen.settle()

      expect(calls).toEqual(['create api /fixture/api', 'start w9:p1 bun dev', 'open w9'])
      expect(await screen.frame()).toContain("Created workspace 'api'")
      expect(screen.defects).toEqual([])
    }
  )

  test('n opens the same launcher with the first project selected', async () => {
    const { backend } = recordingBackend()

    screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { backend, projects: [project('api'), project('beta'), project('gamma')] }
    )
    await screen.pressKey('n')
    await screen.settle()

    const frame = await screen.frame()
    expect(frame).toContain('New Workspace')
    expect(frame).toContain('Type a project name, path, or GitHub URL...')
    expect(frame).not.toContain('custom session name')
    expect(frame).toContain("Create 'api' in /fixture/api")
    expect(frame).toMatch(selectedRow('  P api\\s+create'))
  })

  test('a project with a live workspace in the same directory is focused, not created', async () => {
    const { backend, calls } = recordingBackend()

    screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { backend, projects: [project('alpha')] }
    )
    await openNew(screen)

    const frame = await screen.frame()
    expect(frame).toContain("Focus existing 'alpha' in /fixture/alpha")
    expect(frame).toMatch(selectedRow('  P alpha\\s+focus'))
    expect(footerOf(frame)).toEqual(newFooter('focus'))

    await screen.pressKey('RETURN')
    await screen.settle()

    expect(calls).toEqual(['open w1'])
    expect(await screen.frame()).toContain("Could not open workspace 'alpha'")
  })

  test.each(MODES)('%s: New opens with no candidates and Enter explains it', async keybindMode => {
    const { backend, calls } = recordingBackend()

    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode, backend })
    await openNew(screen)

    const frame = await screen.frame()
    expect(frame).toContain('New Workspace')
    expect(frame).toContain('No projects yet. Type a path to open one.')
    expect(footerOf(frame)).toEqual(
      newFooter('', hints(['here', 'ctrl+g'], ['file', 'ctrl+o'], ['cancel', 'esc']))
    )

    await screen.pressKey('RETURN')
    await screen.settle()

    expect(calls).toEqual([])
    expect(await screen.frame()).toContain('Nothing to open')
  })

  test('a typed name with no match never creates a session named after it', async () => {
    const { backend, calls } = recordingBackend()

    screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { backend, projects: [project('api')] }
    )
    await openNew(screen)
    await screen.typeText('scratch')
    await screen.settle()

    const frame = await screen.frame()
    expect(frame).not.toContain('Create session: scratch')
    expect(frame).toContain("No project matches 'scratch'")
    expect(footerOf(frame)).toEqual(
      newFooter('', hints(['here', 'ctrl+g'], ['file', 'ctrl+o'], ['cancel', 'esc']))
    )

    await screen.pressKey('RETURN')
    await screen.settle()

    expect(calls).toEqual([])
    expect(await screen.frame()).toContain("No project matches 'scratch'")
    expect(searchText(screen)).toBe('scratch')
  })

  test('typing works while discovery is pending, and late rows keep the selected project', async () => {
    const { backend, calls } = recordingBackend()
    const discovery = Promise.withResolvers<Item[]>()

    screen = await renderSessionScreen(
      { width: 120, height: 36 },
      {
        backend,
        projects: [project('api'), project('beta'), project('bravo')],
        loadCandidates: () => discovery.promise,
        config: { defaultSession: {} },
      }
    )
    await openNew(screen)
    await screen.typeText('b')
    await screen.settle()
    await screen.pressKey('ARROW_DOWN')
    await screen.settle()

    const typed = await screen.frame()
    expect(searchText(screen)).toBe('b')
    expect(typed).toContain("Create 'bravo' in /fixture/bravo")

    discovery.resolve([project('bluebird'), project('api'), project('beta'), project('bravo')])
    await screen.settle()

    const late = await screen.frame()
    expect(late).toContain('bluebird')
    expect(late).toContain("Create 'bravo' in /fixture/bravo")

    await screen.pressKey('RETURN')
    await screen.settle()

    expect(calls).toEqual(['create bravo /fixture/bravo', 'open w9'])
  })
})
