import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type { BaseRenderable } from '@opentui/core'
import type { TestRendererSetup } from '@opentui/core/testing'
import { testRender } from '@opentui/react/test-utils'
import { Effect } from 'effect'
import { act } from 'react'
import type { AppEffectRuntime, OperationOutcome } from '../src/app/effect-runtime'
import { createEffectRuntime } from '../src/app/effect-runtime'
import { useHerdrAgentPolling } from '../src/app/herdr-refresh'
import {
  createSessionInventory,
  type InventoryRequest,
  type SessionInventory,
} from '../src/app/session-inventory'
import { useEffectRuntime } from '../src/app/use-effect-runtime'
import { getDefaultConfig } from '../src/config'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { getOmarchyColorsPath } from '../src/styles/omarchy'
import { resolveTheme, type ThemeResolver } from '../src/styles/theme'
import type { SubscribeThemeFollowOptions } from '../src/styles/theme-follow'
import { AppMode, ViewMode, type Item } from '../src/types'
import { IDLE } from '../src/util/pending'
import { renderSessionScreen } from './fixtures/session-screen'
import { createFakeSpinnerMotion } from './fixtures/spinner-motion'
import { createPickerCorpus, PICKER_QUERIES } from './perf/picker-corpus'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

// Assigned inside act(), so control-flow narrowing cannot track a local binding.
interface MountedRenderer {
  setup?: TestRendererSetup
}

interface RuntimeOwnerSlot {
  runtime?: AppEffectRuntime
}

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

function unsupported(): never {
  throw new Error('This work-budget fixture does not implement that operation')
}

function mountScreen(screen: Screen): Screen {
  cleanups.push(() => screen.destroy())

  return screen
}

interface CallCounter {
  readonly name: string
  readonly spy: {
    readonly mock: { readonly calls: ReadonlyArray<unknown> }
    mockClear(): void
    mockRestore(): void
  }
}

interface FilesystemProbe {
  calls(): Record<string, number>
  clear(): void
}

const ASYNC_FILESYSTEM_CALLS = [
  'access',
  'lstat',
  'open',
  'readFile',
  'readdir',
  'realpath',
  'stat',
] as const

const SYNC_FILESYSTEM_CALLS = [
  'existsSync',
  'lstatSync',
  'readFileSync',
  'readdirSync',
  'realpathSync',
  'statSync',
  'watch',
] as const

// Spies call through, so production code keeps its behavior while every filesystem touch is counted.
function recordFilesystem(): FilesystemProbe {
  const counters: CallCounter[] = [
    ...ASYNC_FILESYSTEM_CALLS.map(name => ({
      name: `fs/promises.${name}`,
      spy: spyOn(fsPromises, name),
    })),
    ...SYNC_FILESYSTEM_CALLS.map(name => ({ name: `fs.${name}`, spy: spyOn(fs, name) })),
    { name: 'Bun.file', spy: spyOn(Bun, 'file') },
  ]

  cleanups.push(() => {
    for (const counter of counters) counter.spy.mockRestore()
  })

  return {
    calls: () =>
      Object.fromEntries(
        counters.flatMap(({ name, spy }) =>
          spy.mock.calls.length > 0 ? [[name, spy.mock.calls.length]] : []
        )
      ),
    clear: () => {
      for (const counter of counters) counter.spy.mockClear()
    },
  }
}

interface ThemeProbe {
  resolve: ThemeResolver
  resolutions(): number
}

function countThemeResolutions(): ThemeProbe {
  let resolutions = 0

  return {
    resolutions: () => resolutions,
    resolve: (...args) => {
      resolutions++

      return resolveTheme(...args)
    },
  }
}

interface FollowProbe {
  options: SubscribeThemeFollowOptions
  watches: string[]
  closes: number
  listeners: Array<() => void>
}

function createFollowProbe(): FollowProbe {
  const probe: FollowProbe = {
    watches: [],
    closes: 0,
    listeners: [],
    options: {
      debounceMs: 0,
      watch: path => {
        probe.watches.push(path)

        return {
          close: () => {
            probe.closes++
          },
        }
      },
      onSignal: (_signal, listener) => {
        probe.listeners.push(listener)

        return () => {
          probe.listeners.splice(probe.listeners.indexOf(listener), 1)
        }
      },
    },
  }

  return probe
}

async function createOmarchyHome(): Promise<string> {
  const homeDir = await fsPromises.mkdtemp(join(tmpdir(), 'mux-sesh-work-budgets-'))
  cleanups.push(() => fsPromises.rm(homeDir, { recursive: true, force: true }))
  const colorsPath = getOmarchyColorsPath(homeDir)
  await fsPromises.mkdir(dirname(colorsPath), { recursive: true })
  await fsPromises.copyFile(
    join(import.meta.dir, 'fixtures', 'omarchy', 'rose-pine-dark.toml'),
    colorsPath
  )

  return homeDir
}

function countRenderables(node: BaseRenderable): number {
  return node.getChildren().reduce((count, child) => count + countRenderables(child), 1)
}

function workspaces(count: number): LiveWorkspace[] {
  return Array.from({ length: count }, (_, index) => ({
    backend: 'herdr',
    id: `w${index}`,
    title: `session-${String(index).padStart(3, '0')}`,
    path: `/fixture/sessions/session-${index}`,
    isActive: index === 0,
    unitCount: 1,
  }))
}

function projects(count: number): Item[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `project-${String(index).padStart(5, '0')}`,
    desc: 'fixture',
    path: `/fixture/projects/project-${index}`,
    isSession: false,
    itemKind: 'project',
  }))
}

describe('navigation and query work budget at the baseline corpus', () => {
  test('after startup, navigation and project queries stat nothing, read no files, and resolve no theme', async () => {
    const homeDir = await createOmarchyHome()
    const corpus = createPickerCorpus()
    const theme = countThemeResolutions()
    const follow = createFollowProbe()
    const filesystem = recordFilesystem()
    const spinner = createFakeSpinnerMotion()

    const screen = mountScreen(
      await renderSessionScreen(
        { width: 120, height: 36 },
        {
          ...corpus,
          theme: 'system',
          homeDir,
          resolveTheme: theme.resolve,
          themeFollow: follow.options,
          spinnerMotion: spinner.motion,
        }
      )
    )

    // The spies see the system theme's palette read at startup, so silence below is meaningful.
    expect(filesystem.calls()).toHaveProperty(['fs.readFileSync'])
    expect(theme.resolutions()).toBeGreaterThan(0)
    filesystem.clear()
    const startupResolutions = theme.resolutions()
    const startupWork = { ...corpus.work }

    await screen.settle()
    const spinnerStartsAtStartup = spinner.starts()
    expect(spinner.active()).toBe(0)

    for (let step = 1; step <= 10; step++) await screen.pressKey('ARROW_DOWN')
    expect(await screen.frame()).toMatch(/› .*session-010/)
    // Idle navigation starts no spinner timer and draws no spinner frame.
    expect(spinner.starts()).toBe(spinnerStartsAtStartup)
    expect(spinner.frameReads()).toBe(0)

    await screen.pressKey('n')
    expect(await screen.frame()).toMatch(/› .*project-00000/)

    for (const query of PICKER_QUERIES) {
      await screen.replaceQuery(query)
      expect(await screen.frame()).toMatch(new RegExp(`› .*${query}`))
    }

    await screen.replaceQuery('project-0')

    for (let step = 0; step < 5; step++) await screen.pressKey('ARROW_DOWN')
    await screen.settle()

    expect(filesystem.calls()).toEqual({})
    expect(theme.resolutions()).toBe(startupResolutions)
    // New plans each selection behind a spinner; once every plan settles, no timer remains.
    expect(spinner.active()).toBe(0)
    // Search counts depend on the native debounce; picker-baseline.test.ts pins them per query.
    expect([corpus.work.inventory, corpus.work.preview, corpus.work.subprocess]).toEqual([
      startupWork.inventory,
      startupWork.preview,
      startupWork.subprocess,
    ])
    expect(screen.defects).toEqual([])
  })
})

describe('the header spinner runs only while work is pending', () => {
  test('a refresh in flight animates the header, and its timer stops when the load settles', async () => {
    const spinner = createFakeSpinnerMotion()
    const lists: Array<PromiseWithResolvers<LiveWorkspace[]>> = []

    const alpha: LiveWorkspace = {
      backend: 'herdr',
      id: 'w1',
      title: 'alpha',
      path: '/fixture/alpha',
      isActive: true,
      unitCount: 1,
    }

    const backend: MultiplexerBackend = {
      kind: 'herdr',
      capabilities: { previousWorkspace: false },
      list() {
        if (lists.length === 0) {
          lists.push(Promise.withResolvers())

          return Promise.resolve([alpha])
        }

        const deferred = Promise.withResolvers<LiveWorkspace[]>()
        lists.push(deferred)

        return deferred.promise
      },
      open: unsupported,
      openOrCreate: unsupported,
      create: unsupported,
      start: unsupported,
      rename: unsupported,
      close: unsupported,
      current: unsupported,
      directory: unsupported,
      details: unsupported,
      openEditor: unsupported,
    }

    const screen = mountScreen(
      await renderSessionScreen(
        { width: 80, height: 20 },
        { backend, spinnerMotion: spinner.motion }
      )
    )

    await screen.settle()
    const header = async () => (await screen.frame()).split('\n')[0] ?? ''
    expect(await header()).not.toMatch(/[⠋⠙⠹]/)
    expect(spinner.active()).toBe(0)

    await screen.pressKey('x', { ctrl: true })
    await screen.pressKey('R', { shift: true })
    await screen.settle()

    expect(lists).toHaveLength(2)
    expect(await header()).toMatch(/⠋ /)
    expect(spinner.active()).toBe(1)
    spinner.tick()
    expect(await header()).toMatch(/⠙ /)

    await act(async () => lists[1]?.resolve([alpha]))
    await screen.settle()

    expect(await header()).not.toMatch(/[⠋⠙⠹]/)
    expect(spinner.active()).toBe(0)
    expect(spinner.starts()).toBe(1)
  })
})

describe('rendered rows are bounded by the viewport', () => {
  async function sessionRenderables(count: number): Promise<number> {
    const screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { workspaces: workspaces(count) }
    )

    try {
      for (let step = 0; step < 5; step++) await screen.pressKey('ARROW_DOWN')
      expect(await screen.frame()).toMatch(/› .*session-/)

      return countRenderables(screen.renderer.root)
    } finally {
      screen.destroy()
    }
  }

  async function projectRenderables(count: number): Promise<number> {
    const screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { projects: projects(count) }
    )

    try {
      await screen.pressKey('n')
      await screen.replaceQuery('project-0')
      expect(await screen.frame()).toMatch(/› .*project-00000/)

      return countRenderables(screen.renderer.root)
    } finally {
      screen.destroy()
    }
  }

  test('200 sessions build the same renderable tree as 60', async () => {
    expect(await sessionRenderables(200)).toBe(await sessionRenderables(60))
  })

  test('5,000 project candidates build the same renderable tree as 300', async () => {
    expect(await projectRenderables(5000)).toBe(await projectRenderables(300))
  })
})

describe('owned resources are released', () => {
  test('unmounting the picker closes the system theme watcher and its signal listener', async () => {
    const homeDir = await createOmarchyHome()
    const follow = createFollowProbe()

    const screen = await renderSessionScreen(
      { width: 80, height: 24 },
      { theme: 'system', homeDir, themeFollow: follow.options }
    )

    expect(follow.watches).toHaveLength(1)
    expect(follow.listeners).toHaveLength(1)
    screen.destroy()

    expect(screen.lifecycle).toEqual(['mounted', 'unmounted'])
    expect(follow.closes).toBe(1)
    expect(follow.listeners).toHaveLength(0)
    expect(screen.renderer.stdin.listenerCount('data')).toBe(0)
  })

  test('unmounting Agents clears the Herdr poll interval it started', async () => {
    const requests: InventoryRequest[] = []

    const inventory: SessionInventory = {
      async refresh(request) {
        requests.push(request)

        return { kind: 'superseded' }
      },
      observe: () => {},
      status: () => ({ kind: 'fresh' }),
      revision: () => 0,
      subscribe: () => () => {},
      loading: IDLE,
      dispose: () => {},
    }

    const backend: MultiplexerBackend = {
      kind: 'herdr',
      capabilities: { previousWorkspace: false },
      list: unsupported,
      open: unsupported,
      openOrCreate: unsupported,
      create: unsupported,
      start: unsupported,
      rename: unsupported,
      close: unsupported,
      current: unsupported,
      directory: unsupported,
      details: unsupported,
      openEditor: unsupported,
    }

    const config = getDefaultConfig('/fixture')

    function Polling() {
      useHerdrAgentPolling(inventory, AppMode.AgentsManage, ViewMode.Sessions, config, backend)

      return <text>agents</text>
    }

    const started = spyOn(globalThis, 'setInterval')
    const cleared = spyOn(globalThis, 'clearInterval')
    cleanups.push(() => {
      started.mockRestore()
      cleared.mockRestore()
    })

    const mounted: MountedRenderer = {}
    await act(async () => {
      mounted.setup = await testRender(<Polling />, { width: 20, height: 2 })
    })
    const { setup } = mounted

    if (!setup) throw new Error('Polling fixture did not mount')
    cleanups.push(() => act(() => setup.renderer.destroy()))

    const polls = started.mock.results.filter(result => result.type === 'return')
    expect(polls).toHaveLength(1)
    expect(requests).toEqual([{ kind: 'agents-poll' }])

    act(() => setup.renderer.destroy())

    expect(cleared).toHaveBeenCalledWith(polls[0]?.value)
    expect(requests).toEqual([{ kind: 'agents-poll' }])
  })

  test('unmounting the app runtime interrupts its in-flight work', async () => {
    const owner: RuntimeOwnerSlot = {}

    function RuntimeOwner() {
      owner.runtime = useEffectRuntime()

      return <text>runtime</text>
    }

    const mounted: MountedRenderer = {}
    await act(async () => {
      mounted.setup = await testRender(<RuntimeOwner />, { width: 20, height: 2 })
    })
    const { setup } = mounted
    const { runtime } = owner

    if (!setup || !runtime) throw new Error('Runtime fixture did not mount')
    const pending: Promise<OperationOutcome<never, never>> = runtime.run(Effect.never)

    act(() => setup.renderer.destroy())

    expect(await pending).toEqual({ kind: 'interrupted' })
  })

  test('disposing the inventory owner interrupts its load and never publishes the late result', async () => {
    const effects = createEffectRuntime({ run: unsupported })
    cleanups.push(() => effects.dispose())
    const listed = Promise.withResolvers<LiveWorkspace[]>()
    let listCalls = 0
    const published: unknown[] = []
    const defects: unknown[] = []

    const backend: MultiplexerBackend = {
      kind: 'tmux',
      capabilities: { previousWorkspace: false },
      list: () => {
        listCalls++

        return listed.promise
      },
      open: unsupported,
      openOrCreate: unsupported,
      create: unsupported,
      start: unsupported,
      rename: unsupported,
      close: unsupported,
      current: unsupported,
      directory: unsupported,
      details: unsupported,
      openEditor: unsupported,
    }

    const inventory = createSessionInventory({
      effects,
      measure: async (_name, run) => run(),
      publish: snapshot => published.push(snapshot),
      report: () => {},
      onDefect: cause => defects.push(cause),
    })

    const config = { ...getDefaultConfig('/fixture'), projectPaths: [] }
    const outcome = inventory.refresh({ kind: 'startup' }, { config, backend })

    for (let tick = 0; listCalls === 0; tick++) {
      if (tick > 100) throw new Error('The inventory load never reached the backend')
      await Bun.sleep(0)
    }

    inventory.dispose()
    expect(await outcome).toEqual({ kind: 'interrupted' })

    listed.resolve(workspaces(3))

    for (let tick = 0; tick < 10; tick++) await Bun.sleep(0)

    expect(listCalls).toBe(1)
    expect(published).toEqual([])
    expect(defects).toEqual([])
  })
})
