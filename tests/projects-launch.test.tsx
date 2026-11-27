import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError, type CreatedSessionReceipt } from '../src/multiplexer/types'
import type { KeybindMode } from '../src/types'
import { hints, readFooter } from './fixtures/footer'
import { renderSessionScreen } from './fixtures/session-screen'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined
const roots: string[] = []

afterEach(async () => {
  const fixture = screen
  screen = undefined

  if (fixture) {
    fixture.destroy()
    expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
  }

  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

const MODES: KeybindMode[] = ['vim', 'standard']

function unsupported(): never {
  throw new Error('The Projects backend does not implement that operation')
}

// Each project is a real directory with a marker, so the Projects view discovers it.
async function projectRoot(...names: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mux-sesh-projects-'))
  roots.push(root)

  await Promise.all(names.map(name => mkdir(join(root, name, '.git'), { recursive: true })))

  return root
}

interface BackendOptions {
  readonly workspaces?: LiveWorkspace[]
  readonly create?: Promise<CreatedSessionReceipt>
}

// Opening always fails with an expected error, so a launch reports instead of exiting the test.
function recordingBackend(options: BackendOptions = {}) {
  const calls: string[] = []

  const backend: MultiplexerBackend = {
    kind: 'herdr',
    capabilities: { previousWorkspace: false },
    async list() {
      return options.workspaces ?? []
    },
    async details(workspace) {
      return { workspace, isActive: true, unitLabel: 'Tabs', units: [], agents: [] }
    },
    async create(input) {
      calls.push(`create ${input.title} ${input.path}`)

      return (
        options.create ??
        Promise.resolve({
          workspace: { backend: 'herdr', id: 'w9', title: input.title },
          rootPaneId: 'w9:p1',
        })
      )
    },
    async start(created, command) {
      calls.push(`start ${created.rootPaneId} ${command}`)
    },
    async open(target) {
      calls.push(`open ${target.id}`)

      throw new MultiplexerError('command-failed', 'the fixture has no attached client')
    },
    async openOrCreate(input) {
      calls.push(`openOrCreate ${input.title} ${input.path}`)

      throw new MultiplexerError('command-failed', 'the fixture has no attached client')
    },
    rename: unsupported,
    close: unsupported,
    current: unsupported,
    directory: unsupported,
    openEditor: unsupported,
  }

  return { backend, calls }
}

async function render(keybindMode: KeybindMode, root: string, options: BackendOptions = {}) {
  const recording = recordingBackend(options)

  screen = await renderSessionScreen(
    { width: 100, height: 30 },
    {
      keybindMode,
      backend: recording.backend,
      config: {
        projectPaths: [root],
        zoxideMode: 'off',
        defaultSession: { startupCommand: 'bun dev' },
      },
    }
  )

  return { screen, calls: recording.calls }
}

// Both keybinding modes reach Projects through the palette; vim also has `p`.
async function showProjects(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('Show projects')
  await fixture.pressKey('RETURN')
  await fixture.settle()
}

// Discovery and planning hit the real filesystem, so both can outlast one settle.
async function waitForFrame(fixture: Screen, text: string): Promise<string> {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    const frame = await fixture.frame()

    if (frame.includes(text)) return frame
    await fixture.settle()
    await Bun.sleep(5)
  }

  throw new Error(`The screen never showed '${text}':\n${await fixture.frame()}`)
}

// Standard mode browses Projects from Search, so its screen hints are Search's.
function screenHints(keybindMode: KeybindMode): string {
  return keybindMode === 'vim'
    ? hints(['search', 'i'], ['new', 'n'], ['commands', 'ctrl+p'], ['prefix', 'ctrl+x'])
    : hints(['commands', 'ctrl+p'], ['cancel', 'esc'])
}

describe('Projects view Enter', () => {
  test.each(MODES)(
    '%s: Enter creates the selected project exactly as the summary says',
    async keybindMode => {
      const root = await projectRoot('api')
      const { screen, calls } = await render(keybindMode, root)
      await showProjects(screen)

      const frame = await waitForFrame(
        screen,
        `Create 'api' in ${join(root, 'api')}, then run: bun dev`
      )

      expect(readFooter(frame)).toMatchObject({
        global: screenHints(keybindMode),
        target: hints(['create', 'enter']),
      })

      await screen.pressKey('RETURN')
      await waitForFrame(screen, 'Workspace created, but not opened')

      expect(calls).toEqual([`create api ${join(root, 'api')}`, 'start w9:p1 bun dev', 'open w9'])
      expect(await screen.frame()).toContain("Created workspace 'api'")
      expect(screen.defects).toEqual([])
    }
  )

  test.each(MODES)(
    '%s: a project with a live workspace in its directory is focused, not created',
    async keybindMode => {
      const root = await projectRoot('alpha')

      const alpha: LiveWorkspace = {
        backend: 'herdr',
        id: 'w1',
        title: 'alpha',
        path: join(root, 'alpha'),
        isActive: false,
        unitCount: 1,
      }

      const { screen, calls } = await render(keybindMode, root, { workspaces: [alpha] })
      await showProjects(screen)

      const frame = await waitForFrame(screen, `Focus existing 'alpha' in ${join(root, 'alpha')}`)
      expect(readFooter(frame)).toMatchObject({
        global: screenHints(keybindMode),
        // The live workspace is also a session row, which vim can close directly.
        target:
          keybindMode === 'vim'
            ? hints(['focus', 'enter'], ['close', 'd'])
            : hints(['focus', 'enter']),
      })

      await screen.pressKey('RETURN')
      await waitForFrame(screen, "Could not open workspace 'alpha'")

      expect(calls).toEqual(['open w1'])
      expect(screen.defects).toEqual([])
    }
  )

  test('a second Enter while the launch runs does not start another', async () => {
    const root = await projectRoot('api')
    const created = Promise.withResolvers<CreatedSessionReceipt>()
    const { screen, calls } = await render('vim', root, { create: created.promise })
    await showProjects(screen)
    await waitForFrame(screen, "Create 'api'")

    await screen.pressKey('RETURN')
    await screen.settle()
    await screen.pressKey('RETURN')
    await waitForFrame(screen, 'A launch is already running')

    created.resolve({
      workspace: { backend: 'herdr', id: 'w9', title: 'api' },
      rootPaneId: 'w9:p1',
    })
    await waitForFrame(screen, 'Workspace created, but not opened')

    expect(calls).toEqual([`create api ${join(root, 'api')}`, 'start w9:p1 bun dev', 'open w9'])
  })

  test('the Sessions view keeps its Enter hint and opens the session directly', async () => {
    const root = await projectRoot('api')

    const beta: LiveWorkspace = {
      backend: 'herdr',
      id: 'w2',
      title: 'beta',
      path: join(root, 'beta'),
      isActive: false,
      unitCount: 1,
    }

    const { screen, calls } = await render('vim', root, { workspaces: [beta] })
    const frame = await waitForFrame(screen, 'beta')

    expect(readFooter(frame).target).toStartWith(hints(['select', 'enter']))
    expect(frame).not.toContain("Focus existing 'beta'")

    await screen.pressKey('RETURN')
    await waitForFrame(screen, 'the fixture has no attached client')

    expect(calls).toEqual(['open w2'])
  })
})
