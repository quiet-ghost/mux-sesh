import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { TextareaRenderable } from '@opentui/core'
import { getDefaultConfig } from '../src/config'
import { buildFileStartupCommand } from '../src/files/target'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError, type BackendKind } from '../src/multiplexer/types'
import { FileSearchUnavailableError, type FileSearchOutcome } from '../src/search/fff'
import type { Item, KeybindMode } from '../src/types'
import { footerGroups, hints } from './fixtures/footer'
import { renderSessionScreen } from './fixtures/session-screen'
import { listRow, selectedRows, selectedRowText } from './fixtures/selection'
import { unsupportedBackend } from './fixtures/fake-backend'
import { waitForFrame } from './fixtures/wait'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined
let cwd = ''

beforeEach(async () => {
  cwd = await realpath(await mkdtemp(join(tmpdir(), 'mux-sesh-steps-')))
})

afterEach(async () => {
  const fixture = screen
  screen = undefined

  await rm(cwd, { recursive: true, force: true })

  if (!fixture) return
  fixture.destroy()
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

const MODES: KeybindMode[] = ['vim', 'standard']

function project(title: string, path = `/fixture/${title}`): Item {
  return { title, desc: '', path, isSession: false, itemKind: 'project' }
}

function fileRow(path: string): Item {
  return {
    title: path.split('/').at(-1) ?? path,
    desc: '',
    path,
    isSession: false,
    itemKind: 'file',
  }
}

// Opening always fails with an expected error, so a launch reports instead of exiting the test.
function recordingBackend(kind: BackendKind = 'herdr', workspaces: LiveWorkspace[] = []) {
  const calls: string[] = []

  const backend: MultiplexerBackend = unsupportedBackend({
    kind,
    capabilities: { previousWorkspace: false },
    async list() {
      return workspaces
    },
    async details(workspace) {
      return { workspace, isActive: true, unitLabel: 'Tabs', units: [], agents: [] }
    },
    async create(input) {
      calls.push(`create ${input.title} ${input.path}`)

      return { workspace: { backend: kind, id: 'w9', title: input.title }, rootPaneId: 'w9:p1' }
    },
    async start(created, command) {
      calls.push(`start ${created.rootPaneId} ${command}`)
    },
    async open(target) {
      calls.push(`open ${target.id}`)

      throw new MultiplexerError('command-failed', 'the fixture has no attached client')
    },
  })

  return { backend, calls }
}

function tmuxSession(id: string, title: string, path: string): LiveWorkspace {
  return { backend: 'tmux', id, title, path, isActive: false, unitCount: 1 }
}

async function openNew(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('New session')
  await fixture.pressKey('RETURN')
  await fixture.settle()
}

async function press(fixture: Screen, key: string, ctrl = false): Promise<string> {
  await fixture.pressKey(key, ctrl ? { ctrl: true } : undefined)
  await fixture.settle()

  return fixture.frame()
}

// Path checks hit the real filesystem, so planning can outlast one settle on a slow runner.
async function plannedFrame(fixture: Screen): Promise<string> {
  const frame = await waitForFrame(
    fixture,
    shown => !shown.includes('Checking what Enter will open…'),
    10_000
  )

  if (frame !== undefined) return frame

  throw new Error('The New launch preview never finished planning')
}

async function replaceField(fixture: Screen, text: string): Promise<string> {
  await fixture.replaceQuery(text)

  return plannedFrame(fixture)
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

function fieldText(fixture: Screen): string {
  const focused = fixture.renderer.currentFocusedRenderable

  if (!(focused instanceof TextareaRenderable))
    throw new Error('Expected the New text field to own focus')

  return focused.plainText
}

const STEP_KEYS = ['n', 't', 'g', 'o'] as const

describe('New secondary steps', () => {
  test.each(MODES)('%s: browse footer advertises each step key', async keybindMode => {
    const { backend } = recordingBackend()

    screen = await renderSessionScreen(
      { width: 140, height: 36 },
      { keybindMode, backend, projects: [project('api')], config: { defaultSession: {} } }
    )
    await openNew(screen)

    expect(footerOf(await screen.frame())).toEqual(newFooter('create'))
  })

  test.each(MODES)(
    '%s: esc from every step returns to the same query and selection',
    async keybindMode => {
      const { backend, calls } = recordingBackend()

      screen = await renderSessionScreen(
        { width: 140, height: 36 },
        {
          keybindMode,
          backend,
          projects: [project('api'), project('beta'), project('bravo')],
          config: { defaultSession: {} },
          fileSearchDebounceMs: 0,
        }
      )
      await openNew(screen)
      await screen.typeText('b')
      await screen.settle()
      await press(screen, 'ARROW_DOWN')

      for (const key of STEP_KEYS) {
        await press(screen, key, true)
        await replaceField(screen, 'zz')
        expect(fieldText(screen)).toBe('zz')

        const back = await press(screen, 'ESCAPE')
        expect(fieldText(screen)).toBe('b')
        expect(back).toContain('New Workspace')
        expect(back).toContain("Create 'bravo' in /fixture/bravo")
        expect(await selectedRowText(screen)).toMatch(listRow('  bravo\\s+create'))
      }

      expect(calls).toEqual([])
    }
  )

  test.each(MODES)('%s: ctrl+n renames the planned session before Enter', async keybindMode => {
    const { backend, calls } = recordingBackend()

    screen = await renderSessionScreen(
      { width: 140, height: 36 },
      {
        keybindMode,
        backend,
        projects: [project('api'), project('beta')],
        config: { defaultSession: { startupCommand: 'bun dev' } },
      }
    )
    await openNew(screen)

    const editing = await press(screen, 'n', true)
    expect(fieldText(screen)).toBe('api')
    expect(editing).toContain('Name')
    expect(footerOf(editing)).toEqual(newFooter('apply', CANCEL))

    const drafted = await replaceField(screen, 'api-two')
    expect(drafted).toContain("Create 'api-two' in /fixture/api, then run: bun dev")
    expect(calls).toEqual([])

    const applied = await press(screen, 'RETURN')
    expect(fieldText(screen)).toBe('')
    expect(calls).toEqual([])
    expect(applied).toContain("Create 'api-two' in /fixture/api, then run: bun dev")
    expect(footerOf(applied)).toEqual(newFooter('create'))

    await press(screen, 'RETURN')
    expect(calls).toEqual(['create api-two /fixture/api', 'start w9:p1 bun dev', 'open w9'])
  })

  test('ctrl+t edits the startup command, and an empty one runs nothing', async () => {
    const { backend, calls } = recordingBackend()

    screen = await renderSessionScreen(
      { width: 140, height: 36 },
      {
        backend,
        projects: [project('api')],
        config: { defaultSession: { startupCommand: 'bun dev' } },
      }
    )
    await openNew(screen)

    await press(screen, 't', true)
    expect(fieldText(screen)).toBe('bun dev')

    const cleared = await replaceField(screen, '')
    expect(cleared).toContain("Create 'api' in /fixture/api")
    expect(cleared).not.toContain('then run')

    await press(screen, 'RETURN')
    await press(screen, 'RETURN')
    expect(calls).toEqual(['create api /fixture/api', 'open w9'])
  })

  test('an edited name is dropped when the selection changes', async () => {
    const { backend } = recordingBackend()

    screen = await renderSessionScreen(
      { width: 140, height: 36 },
      { backend, projects: [project('api'), project('beta')], config: { defaultSession: {} } }
    )
    await openNew(screen)
    await press(screen, 'n', true)
    await replaceField(screen, 'custom')
    await press(screen, 'RETURN')

    expect(await press(screen, 'ARROW_DOWN')).toContain("Create 'beta' in /fixture/beta")
    expect(await press(screen, 'ARROW_UP')).toContain("Create 'api' in /fixture/api")
  })

  test('an invalid name keeps the draft and the step, and creates nothing', async () => {
    const { backend, calls } = recordingBackend('tmux')

    screen = await renderSessionScreen(
      { width: 140, height: 36 },
      { backend, projects: [project('api')], config: { defaultSession: {} } }
    )
    await openNew(screen)
    await press(screen, 'n', true)

    const empty = await replaceField(screen, '  ')
    expect(empty).toContain('cannot be empty')
    expect(footerOf(empty)).toEqual(newFooter('', CANCEL))
    await press(screen, 'RETURN')
    expect(fieldText(screen)).toBe('  ')

    const invalid = await replaceField(screen, 'api:2')
    expect(invalid).toContain("cannot contain ':'")

    const refused = await press(screen, 'RETURN')
    expect(fieldText(screen)).toBe('api:2')
    expect(refused).toContain("cannot contain ':'")
    expect(calls).toEqual([])
  })
})

describe('named session here', () => {
  test.each(MODES)('%s: shows the caller directory first and creates there', async keybindMode => {
    const { backend, calls } = recordingBackend()

    screen = await renderSessionScreen(
      { width: 140, height: 36 },
      {
        keybindMode,
        backend,
        invocationCwd: cwd,
        projects: [project('api')],
        config: { defaultSession: {} },
      }
    )
    await openNew(screen)

    const prompt = await press(screen, 'g', true)
    expect(fieldText(screen)).toBe('')
    expect(prompt).toContain(`Type a name; Enter creates it in ${cwd}`)
    expect(footerOf(prompt)).toEqual(newFooter('', CANCEL))

    const named = await replaceField(screen, 'scratch')
    expect(named).toContain(`Create 'scratch' in ${cwd}`)
    expect(
      (await selectedRows(screen)).filter(row => listRow('  api\\s+create').test(row))
    ).toEqual([])
    expect(footerOf(named)).toEqual(newFooter('create', CANCEL))

    await press(screen, 'RETURN')
    expect(calls).toEqual([`create scratch ${cwd}`, 'open w9'])
  })

  test('a missing caller directory refuses and keeps the draft', async () => {
    const { backend, calls } = recordingBackend()
    const missing = join(cwd, 'gone')

    screen = await renderSessionScreen(
      { width: 140, height: 36 },
      { backend, invocationCwd: missing, projects: [project('api')] }
    )
    await openNew(screen)
    await press(screen, 'g', true)

    const refused = await replaceField(screen, 'scratch')
    expect(refused).toContain(`${missing} no longer exists`)

    await press(screen, 'RETURN')
    expect(calls).toEqual([])
    expect(fieldText(screen)).toBe('scratch')
  })

  test('a tmux name already used elsewhere refuses instead of focusing it', async () => {
    const { backend, calls } = recordingBackend('tmux', [tmuxSession('$1', 'scratch', '/other')])

    screen = await renderSessionScreen(
      { width: 160, height: 36 },
      { backend, invocationCwd: cwd, projects: [project('api')], config: { defaultSession: {} } }
    )
    await openNew(screen)
    await press(screen, 'g', true)

    const refused = await replaceField(screen, 'scratch')
    expect(refused).toContain("A tmux session named 'scratch' already exists")

    await press(screen, 'RETURN')
    expect(calls).toEqual([])
    expect(fieldText(screen)).toBe('scratch')
  })
})

describe('open file step', () => {
  const config = { ...getDefaultConfig('/fixture'), editor: 'nvim', defaultSession: {} }

  test.each(MODES)('%s: lists only file matches and opens the selected file', async keybindMode => {
    const { backend, calls } = recordingBackend()
    const searches: string[] = []

    screen = await renderSessionScreen(
      { width: 160, height: 36 },
      {
        keybindMode,
        backend,
        projects: [project('api')],
        config: { editor: 'nvim', defaultSession: {} },
        fileSearchDebounceMs: 0,
        fileSearch: async query => {
          searches.push(query)

          return {
            kind: 'found',
            items: [fileRow('/fixture/api/alpha.md'), project('apps')],
            nativeMs: 0,
          }
        },
      }
    )
    await openNew(screen)

    const prompt = await press(screen, 'o', true)
    expect(prompt).toContain('Open file')
    expect((await selectedRows(screen)).filter(row => listRow('  api').test(row))).toEqual([])

    const found = await replaceField(screen, 'a')
    expect(searches).toEqual(['a'])
    expect(found).toContain('alpha.md')
    expect(found).not.toContain('apps')
    expect(found).not.toMatch(/P api\s/)
    expect(found).toContain("Create 'api_alpha_md' in /fixture/api")
    expect(footerOf(found)).toEqual(newFooter('create', CANCEL))

    await press(screen, 'RETURN')
    expect(calls).toEqual([
      'create api_alpha_md /fixture/api',
      `start w9:p1 ${buildFileStartupCommand('/fixture/api/alpha.md', config)}`,
      'open w9',
    ])
  })

  const unavailable: [string, FileSearchOutcome, string][] = [
    [
      'unavailable',
      {
        kind: 'failed',
        failure: new FileSearchUnavailableError('the native library could not be loaded'),
      },
      'File search is unavailable: the native library could not be loaded',
    ],
    ['disabled', { kind: 'disabled' }, 'File search is turned off'],
  ]

  test.each(unavailable)(
    '%s file search says so and never falls back to a project',
    async (_label, outcome, text) => {
      const { backend, calls } = recordingBackend()

      screen = await renderSessionScreen(
        { width: 160, height: 36 },
        {
          backend,
          projects: [project('api')],
          config: { defaultSession: {} },
          fileSearchDebounceMs: 0,
          fileSearch: async () => outcome,
        }
      )
      await openNew(screen)
      await press(screen, 'o', true)

      const frame = await replaceField(screen, 'api')
      expect(frame).toContain(text)
      expect(frame).not.toMatch(/P api\s+create/)
      expect(footerOf(frame)).toEqual(newFooter('', CANCEL))

      await press(screen, 'RETURN')
      expect(calls).toEqual([])
      expect(fieldText(screen)).toBe('api')
      expect(await screen.frame()).toContain(text)
    }
  )

  test('a file whose session name is taken by another tmux directory is refused', async () => {
    const { backend, calls } = recordingBackend('tmux', [
      tmuxSession('$1', 'api_alpha_md', '/elsewhere/api'),
    ])

    screen = await renderSessionScreen(
      { width: 160, height: 36 },
      {
        backend,
        projects: [project('api')],
        config: { defaultSession: {} },
        fileSearchDebounceMs: 0,
        fileSearch: async () => ({
          kind: 'found',
          items: [fileRow('/fixture/api/alpha.md')],
          nativeMs: 0,
        }),
      }
    )
    await openNew(screen)
    await press(screen, 'o', true)

    const refused = await replaceField(screen, 'alpha')
    expect(refused).toContain("A tmux session named 'api_alpha_md' already exists")

    await press(screen, 'RETURN')
    expect(calls).toEqual([])
  })

  test('typed paths must name an existing file', async () => {
    const { backend, calls } = recordingBackend()

    screen = await renderSessionScreen(
      { width: 160, height: 36 },
      {
        backend,
        invocationCwd: cwd,
        projects: [project('api')],
        config: { defaultSession: {} },
        fileSearchDebounceMs: 0,
      }
    )
    await openNew(screen)
    await press(screen, 'o', true)

    expect(await replaceField(screen, './missing.md')).toContain(
      `Nothing exists at ${join(cwd, 'missing.md')}`
    )
    await press(screen, 'RETURN')

    expect(await replaceField(screen, './')).toContain('is a directory, not a file')
    await press(screen, 'RETURN')

    expect(calls).toEqual([])
    expect(fieldText(screen)).toBe('./')
  })
})
