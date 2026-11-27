import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { lstat, mkdir, readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { CommandTimeoutError, type CommandResult } from '../src/multiplexer/command'
import { MultiplexerError } from '../src/multiplexer/types'
import type { KeybindMode } from '../src/types'
import { createLocalGitHub, type LocalGitHub } from './fixtures/local-github'
import { footerGroups, hints } from './fixtures/footer'
import { renderSessionScreen } from './fixtures/session-screen'
import { createFakeSpinnerMotion } from './fixtures/spinner-motion'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined
let github: LocalGitHub

beforeEach(async () => {
  github = await createLocalGitHub()
})

afterEach(async () => {
  const fixture = screen
  screen = undefined

  if (fixture) {
    fixture.destroy()
    expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
  }

  await github.remove()
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

function unsupported(): never {
  throw new Error('The clone backend does not implement that operation')
}

interface BackendScript {
  start?: () => Promise<void>
}

// Opening always fails with an expected error, so a launch reports instead of exiting the test.
function recordingBackend(script: BackendScript = {}) {
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

      if (script.start) await script.start()
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

async function mount(
  backend: MultiplexerBackend,
  keybindMode: KeybindMode = 'vim',
  startupCommand?: string
): Promise<Screen> {
  screen = await renderSessionScreen(
    { width: 150, height: 36 },
    {
      keybindMode,
      backend,
      config: {
        reposPath: github.reposPath,
        defaultSession: startupCommand ? { startupCommand } : {},
      },
      clone: github.services,
    }
  )

  return screen
}

async function openNewWith(fixture: Screen, query: string): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('New session')
  await fixture.pressKey('RETURN')
  await fixture.settle()
  await fixture.replaceQuery(query)
  await fixture.settle()
}

function footerOf(frame: string) {
  return footerGroups(frame)
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false
  )
}

const FRAME_WAIT_MS = 10_000

// Dialogs wrap long temp paths, so frames are compared with all whitespace removed.
function squashed(text: string): string {
  return text.replace(/\s+/g, '')
}

// Bounded by time, not ticks: a real local git clone can outlast many settles on a slow runner.
async function waitForFrame(fixture: Screen, text: string): Promise<string> {
  const deadline = Date.now() + FRAME_WAIT_MS

  while (Date.now() < deadline) {
    const frame = await fixture.frame()

    if (squashed(frame).includes(squashed(text))) return squashed(frame)
    await fixture.settle()
    await Bun.sleep(5)
  }

  throw new Error(`The screen never showed '${text}':\n${await fixture.frame()}`)
}

function expectShown(frame: string, text: string): void {
  expect(frame).toContain(squashed(text))
}

describe('clone from New', () => {
  test.each(MODES)(
    '%s: the summary names the frozen clone, and a failed startup keeps the clone and the created session',
    async keybindMode => {
      await github.publish('acme', 'widget')

      const { backend, calls } = recordingBackend({
        start: async () => {
          throw new MultiplexerError('command-failed', 'pane run refused')
        },
      })

      const fixture = await mount(backend, keybindMode, 'bun dev')
      const destination = join(github.reposPath, 'widget')

      await openNewWith(fixture, 'https://github.com/acme/widget')

      const planned = await waitForFrame(fixture, 'Clone acme/widget')
      expectShown(
        planned,
        `Clone acme/widget into ${destination}, then create 'widget', then run: bun dev`
      )
      expect(footerOf(await fixture.frame())).toMatchObject({ target: hints(['clone', 'enter']) })
      expect(github.clones).toEqual([])

      await fixture.pressKey('RETURN')
      const outcome = await waitForFrame(fixture, 'startup command failed')

      expect(github.clones).toHaveLength(1)
      expect(calls).toEqual([`create widget ${destination}`, 'start w9:p1 bun dev'])
      expectShown(outcome, `Cloned acme/widget into ${destination}`)
      expectShown(outcome, "Created workspace 'widget'")
      expectShown(outcome, 'pane run refused')
      expectShown(outcome, "open 'widget' enter")
      expect(await exists(join(destination, '.git'))).toBe(true)

      await fixture.pressKey('RETURN')
      await fixture.settle()

      expect(github.clones).toHaveLength(1)
      expect(calls).toEqual([`create widget ${destination}`, 'start w9:p1 bun dev', 'open w9'])
      expect(fixture.defects).toEqual([])
    }
  )

  test('an existing checkout of the same repository is reused, never cloned again', async () => {
    const destination = join(github.reposPath, 'widget')
    await github.checkout(destination, 'https://github.com/acme/widget.git', true)
    const { backend, calls } = recordingBackend()
    const fixture = await mount(backend)

    await openNewWith(fixture, 'git@github.com:acme/widget.git')

    const planned = await waitForFrame(fixture, 'Reuse')
    expectShown(planned, `Reuse the acme/widget checkout at ${destination}, then create 'widget'`)
    expect(footerOf(await fixture.frame())).toMatchObject({ target: hints(['create', 'enter']) })

    await fixture.pressKey('RETURN')
    const outcome = await waitForFrame(fixture, 'not opened')

    expectShown(outcome, `Reused the acme/widget checkout at ${destination}`)
    expectShown(outcome, "Created workspace 'widget'")
    expect(github.clones).toEqual([])
    expect(calls).toEqual([`create widget ${destination}`, 'open w9'])
  })

  test('a credentialed URL is refused without echoing the token, and nothing runs', async () => {
    const { backend, calls } = recordingBackend()
    const fixture = await mount(backend)

    await openNewWith(fixture, 'https://x-access-token:ghp_s3cret@github.com/acme/widget')

    const refused = await waitForFrame(fixture, 'username or token')
    expectShown(refused, 'https://github.com/acme/widget.git')
    expect(footerOf(await fixture.frame())).toMatchObject({ target: '' })

    await fixture.pressKey('RETURN')
    await fixture.settle()

    const after = await fixture.frame()
    // Only the query field still shows what was typed.
    expect(after.split('ghp_s3cret')).toHaveLength(2)
    expect(github.clones).toEqual([])
    expect(calls).toEqual([])
    expect(await exists(join(github.reposPath, 'widget'))).toBe(false)
  })

  test('an owner/basename collision or unrelated directory is refused and left untouched', async () => {
    const { backend, calls } = recordingBackend()
    await github.checkout(
      join(github.reposPath, 'widget'),
      'https://github.com/other/widget.git',
      true
    )
    await mkdir(join(github.reposPath, 'notes'))
    await writeFile(join(github.reposPath, 'notes', 'todo.txt'), 'mine')
    const fixture = await mount(backend)

    await openNewWith(fixture, 'https://github.com/acme/widget')
    expectShown(
      await waitForFrame(fixture, 'already holds'),
      'already holds other/widget, not acme/widget'
    )

    await fixture.pressKey('RETURN')
    await fixture.settle()

    await fixture.replaceQuery('https://github.com/acme/notes')
    await fixture.settle()
    expectShown(await waitForFrame(fixture, 'not a git checkout'), join(github.reposPath, 'notes'))

    await fixture.pressKey('RETURN')
    await fixture.settle()

    expect(github.clones).toEqual([])
    expect(calls).toEqual([])
    expect(await readdir(join(github.reposPath, 'notes'))).toEqual(['todo.txt'])
  })

  test('a second Enter, or leaving and coming back, while a clone runs never starts another clone', async () => {
    await github.publish('acme', 'widget')
    const gate = Promise.withResolvers<void>()

    github.interceptClone(async run => {
      await gate.promise

      return run()
    })

    const { backend, calls } = recordingBackend()
    const fixture = await mount(backend)

    await openNewWith(fixture, 'https://github.com/acme/widget')
    await waitForFrame(fixture, 'Clone acme/widget')

    await fixture.pressKey('RETURN')
    await fixture.settle()
    await fixture.pressKey('RETURN')
    expect(await waitForFrame(fixture, 'A launch is already running')).toBeTruthy()

    await fixture.pressKey('ESCAPE')
    await openNewWith(fixture, 'https://github.com/acme/widget')
    await fixture.pressKey('RETURN')
    await fixture.settle()

    expect(github.clones).toHaveLength(1)

    gate.resolve()
    await waitForFrame(fixture, 'not opened')

    expect(github.clones).toHaveLength(1)
    expect(calls).toEqual([`create widget ${join(github.reposPath, 'widget')}`, 'open w9'])
  })

  test('the header spinner runs while a clone runs and stops once it finishes', async () => {
    await github.publish('acme', 'widget')
    const gate = Promise.withResolvers<void>()
    const spinner = createFakeSpinnerMotion()

    github.interceptClone(async run => {
      await gate.promise

      return run()
    })

    const { backend } = recordingBackend()

    screen = await renderSessionScreen(
      { width: 150, height: 36 },
      {
        backend,
        config: { reposPath: github.reposPath, defaultSession: {} },
        clone: github.services,
        spinnerMotion: spinner.motion,
      }
    )

    const fixture = screen
    const header = async () => (await fixture.frame()).split('\n')[0] ?? ''

    await openNewWith(fixture, 'https://github.com/acme/widget')
    await waitForFrame(fixture, 'Clone acme/widget')
    expect(await header()).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
    expect(spinner.active()).toBe(0)

    await fixture.pressKey('RETURN')
    await fixture.settle()

    expect(await header()).toMatch(/⠋ /)
    expect(spinner.active()).toBe(1)

    gate.resolve()
    await waitForFrame(fixture, 'not opened')

    // After the launch, inventory refreshes and New plans again with real git; both then settle.
    for (let wait = 0; spinner.active() > 0 && wait < FRAME_WAIT_MS / 5; wait++) {
      await fixture.settle()
      await Bun.sleep(5)
    }

    expect(await header()).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
    expect(spinner.active()).toBe(0)
  })

  test('a timed-out clone is reported as unknown, its leftovers are kept, and the next Enter refuses them', async () => {
    const destination = join(github.reposPath, 'widget')

    github.interceptClone(async (): Promise<CommandResult> => {
      await github.checkout(destination, 'https://github.com/acme/widget.git', false)

      throw new CommandTimeoutError({ executable: 'git', timeoutMs: 600_000 })
    })

    const { backend, calls } = recordingBackend()
    const fixture = await mount(backend)

    await openNewWith(fixture, 'https://github.com/acme/widget')
    await waitForFrame(fixture, 'Clone acme/widget')
    await fixture.pressKey('RETURN')

    const outcome = await waitForFrame(fixture, 'did not finish')
    expectShown(outcome, 'may hold a partial checkout')
    expectShown(outcome, 'nothing was deleted')
    expect(calls).toEqual([])

    await fixture.pressKey('RETURN')
    await fixture.settle()
    await fixture.replaceQuery('')
    await fixture.settle()
    await fixture.replaceQuery('https://github.com/acme/widget')
    await fixture.settle()

    expectShown(await waitForFrame(fixture, 'may be a partial clone'), destination)

    await fixture.pressKey('RETURN')
    await fixture.settle()

    expect(github.clones).toHaveLength(1)
    expect(calls).toEqual([])
    expect(await exists(join(destination, '.git'))).toBe(true)
  })
})
