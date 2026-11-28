import { TextareaRenderable, type TerminalColors } from '@opentui/core'
import type { TestRendererOptions, TestRendererSetup } from '@opentui/core/testing'
import { useRenderer } from '@opentui/react'
import { testRender } from '@opentui/react/test-utils'
import { act, useEffect, useLayoutEffect } from 'react'
import type { AppServices } from '../../src/app/app-services'
import { useAppController } from '../../src/app/controller'
import { LAUNCHER_QUERY_SERVICES, type LauncherQueryServices } from '../../src/app/launcher-query'
import { AppModalsLayer } from '../../src/app/modals-layer'
import { AppScreen } from '../../src/app/screen'
import type { StartupState } from '../../src/app/startup'
import { getDefaultConfig, getHomeDir } from '../../src/config'
import type { LiveWorkspace, MultiplexerBackend, WorkspaceRef } from '../../src/multiplexer'
import type { ProjectDiscovery } from '../../src/projects/discovery-service'
import { PROJECT_DISCOVERY } from '../../src/projects/project-items'
import { filterAndSortItems } from '../../src/search'
import type { FileSearchOutcome } from '../../src/search/fff'
import type { OpenHistory } from '../../src/search/frecency-store'
import type { CloneServices } from '../../src/sessions/clone-plan'
import { resolveTheme, ThemeProvider, type ThemeResolver } from '../../src/styles/theme'
import type { SubscribeThemeFollowOptions } from '../../src/styles/theme-follow'
import type { Config, Item, KeybindMode, ThemeColors } from '../../src/types'
import {
  BusyContext,
  SpinnerMotionContext,
  STILL_MOTION,
  type SpinnerMotion,
} from '../../src/ui/Spinner'
import { StartupErrorScreen } from '../../src/ui/StartupErrorScreen'
import { settleTicks } from './wait'

type BackendCall = { operation: 'list' } | { operation: 'details' | 'open'; id: string }

interface SessionScreenHarness {
  renderer: TestRendererSetup['renderer']
  calls: BackendCall[]
  lifecycle: string[]
  defects: unknown[]
  frame(): Promise<string>
  captureSpans: TestRendererSetup['captureSpans']
  // The colors of the theme the screen last rendered with, including a previewed theme.
  colors(): ThemeColors
  pressKey(...args: Parameters<TestRendererSetup['mockInput']['pressKey']>): Promise<void>
  typeText(text: string): Promise<void>
  replaceQuery(text: string): Promise<void>
  settle(): Promise<void>
  // Reloads inventory as a manual refresh would, then lets React settle.
  refresh(): Promise<void>
  resize(width: number, height: number): Promise<void>
  emitPalette(colors: TerminalColors): Promise<void>
  destroy(): void
}

interface FixtureHandle {
  refresh?: () => Promise<void>
  colors?: ThemeColors
  startup?: StartupState['kind']
}

interface SessionScreenData {
  keybindMode?: KeybindMode
  theme?: string
  workspaces?: LiveWorkspace[]
  // The default backend's current(); defaults to refusing, which leaves the cursor at the top.
  current?: () => Promise<WorkspaceRef | undefined>
  backend?: MultiplexerBackend
  projects?: Item[]
  // Candidate discovery for New; defaults to resolving the fixture projects at once.
  loadCandidates?: () => Promise<Item[]>
  // Native file search for New; defaults to finding nothing.
  fileSearch?: (query: string) => Promise<FileSearchOutcome>
  fileSearchDebounceMs?: number
  // The directory mux-sesh was started in; defaults to '/fixture'.
  invocationCwd?: string
  // Git for clones; defaults to refusing to run git at all.
  clone?: CloneServices
  config?: Partial<Config>
  filterItems?: typeof filterAndSortItems
  homeDir?: string
  resolveTheme?: ThemeResolver
  themeFollow?: SubscribeThemeFollowOptions
  saveConfig?: (config: Config) => Promise<void>
  // Spinner timers; defaults to still, so no frame depends on the wall clock.
  spinnerMotion?: SpinnerMotion
  // Search history as the app wires it: loaded from config, ranking Search and recording opens.
  // Without one, history stays off.
  openHistory?: OpenHistory
}

// Assigned inside act(), so control-flow narrowing cannot track a local binding.
interface MountedRenderer {
  setup?: TestRendererSetup
}

function unsupportedFixtureAction(): never {
  throw new Error('This session-screen fixture does not implement that action')
}

const NO_GIT: CloneServices = {
  inspect: { run: unsupportedFixtureAction },
  clone: { run: unsupportedFixtureAction },
}

// The test terminal never answers a palette query; palette changes arrive only as emitted events.
function useSilentTerminalPalette(): void {
  const renderer = useRenderer()

  renderer.getPalette = async () => {
    throw new Error('The fixture terminal does not report its palette')
  }
}

interface ControllerFixture {
  services: AppServices
  invocationCwd: string
  spinnerMotion: SpinnerMotion
  lifecycle: string[]
  handle: FixtureHandle
}

function ignoreQuit(): void {}

// The production controller and screens, with every service outside React supplied by the test.
function ControllerScreenFixture({ fixture }: { fixture: ControllerFixture }) {
  useSilentTerminalPalette()

  const { startup, retryStartup, theme, busy, refreshItems, screenProps, modalProps } =
    useAppController(fixture.invocationCwd, fixture.services)

  const { handle, lifecycle } = fixture

  useLayoutEffect(() => {
    handle.colors = theme
    handle.startup = startup.kind
  }, [handle, theme, startup.kind])

  useEffect(() => {
    handle.refresh = () => refreshItems()
  })

  useEffect(() => {
    lifecycle.push('mounted')

    return () => {
      lifecycle.push('unmounted')
    }
  }, [lifecycle])

  return (
    <ThemeProvider theme={theme}>
      <SpinnerMotionContext value={fixture.spinnerMotion}>
        {startup.kind === 'failed' || startup.kind === 'retrying' ? (
          <StartupErrorScreen startup={startup} onRetry={retryStartup} onQuit={ignoreQuit} />
        ) : (
          <BusyContext value={busy}>
            <AppScreen {...screenProps} />
            <AppModalsLayer {...modalProps} />
          </BusyContext>
        )}
      </SpinnerMotionContext>
    </ThemeProvider>
  )
}

const NO_OPEN_HISTORY: OpenHistory = {
  configure() {},
  load: async () => {},
  boost: () => 0,
  record: async () => ({ kind: 'off' }),
}

function staticProjectDiscovery(items: Item[]): ProjectDiscovery {
  return {
    load: async () => ({ items, failures: [] }),
    refresh() {},
    subscribeFailures: () => () => {},
  }
}

const STARTUP_WAIT_MS = 5_000

export async function renderSessionScreen(
  options: TestRendererOptions,
  data: SessionScreenData = {}
): Promise<SessionScreenHarness> {
  const config: Config = {
    ...getDefaultConfig('/fixture'),
    keybindMode: data.keybindMode ?? 'vim',
    theme: data.theme ?? 'catppuccin',
    colorScheme: 'dark',
    autoUpdate: false,
    projectPaths: [],
    ...data.config,
  }

  const workspaces: LiveWorkspace[] = data.workspaces ?? [
    {
      backend: 'herdr',
      id: 'w1',
      title: 'alpha',
      path: '/fixture/alpha',
      isActive: true,
      unitCount: 1,
    },
    {
      backend: 'herdr',
      id: 'w2',
      title: 'beta',
      path: '/fixture/beta',
      isActive: false,
      unitCount: 1,
    },
  ]

  const calls: BackendCall[] = []
  const lifecycle: string[] = []
  const defects: unknown[] = []

  const backend: MultiplexerBackend = data.backend ?? {
    kind: 'herdr',
    capabilities: { previousWorkspace: false },
    async list() {
      calls.push({ operation: 'list' })

      return workspaces
    },
    async details(workspace) {
      calls.push({ operation: 'details', id: workspace.id })

      return {
        workspace,
        isActive: workspace.id === 'w1',
        unitLabel: 'Tabs',
        units: [],
        agents: [],
      }
    },
    async open(workspace) {
      calls.push({ operation: 'open', id: workspace.id })

      return { kind: 'focused' }
    },
    openOrCreate: unsupportedFixtureAction,
    create: unsupportedFixtureAction,
    start: unsupportedFixtureAction,
    rename: unsupportedFixtureAction,
    close: unsupportedFixtureAction,
    current: data.current ?? unsupportedFixtureAction,
    directory: unsupportedFixtureAction,
    openEditor: unsupportedFixtureAction,
  }

  const history = data.openHistory

  const filterItems: typeof filterAndSortItems =
    data.filterItems ??
    (history
      ? (items, query) => filterAndSortItems(items, query, { boost: item => history.boost(item) })
      : filterAndSortItems)

  const projects = data.projects ?? []

  // Native search, warm-up, and candidate discovery stay offline; candidates are the fixture rows.
  const fileSearch =
    data.fileSearch ??
    (async (): Promise<FileSearchOutcome> => ({ kind: 'found', items: [], nativeMs: 0 }))

  const launcher: LauncherQueryServices = {
    debounceMs: data.fileSearchDebounceMs ?? LAUNCHER_QUERY_SERVICES.debounceMs,
    onDefect: cause => {
      throw cause
    },
    filterItems,
    openFileSearch: () => ({
      warm: async () => {},
      search: async query => fileSearch(query),
      dispose: () => {},
    }),
    onDiscardedSearch: () => {},
    loadCandidates: data.loadCandidates ?? (async () => projects),
    linkSessions: async items => items,
  }

  const mounted: MountedRenderer = {}
  const handle: FixtureHandle = {}

  const services: AppServices = {
    startup: { loadConfig: async () => config, resolveBackend: async () => backend },
    saveConfig: data.saveConfig ?? unsupportedFixtureAction,
    configPath: () => '/fixture/config.json',
    homeDir: () => data.homeDir ?? getHomeDir(),
    clone: data.clone ?? NO_GIT,
    launcher,
    projects: data.projects ? staticProjectDiscovery(data.projects) : PROJECT_DISCOVERY,
    openHistory: history ?? NO_OPEN_HISTORY,
    createSearchFilter: () => filterItems,
    theme: { resolve: data.resolveTheme ?? resolveTheme, follow: data.themeFollow },
    updates: { on: () => () => {} },
    autoUpdate: { schedule: () => () => {} },
    onDefect: cause => {
      defects.push(cause)
    },
  }

  const element = (
    <ControllerScreenFixture
      fixture={{
        services,
        invocationCwd: data.invocationCwd ?? '/fixture',
        spinnerMotion: data.spinnerMotion ?? STILL_MOTION,
        lifecycle,
        handle,
      }}
    />
  )

  try {
    await act(async () => {
      mounted.setup = await testRender(element, {
        ...options,
        consoleMode: 'disabled',
        exitOnCtrlC: false,
        kittyKeyboard: true,
      })
    })
  } catch (error) {
    act(() => mounted.setup?.renderer.destroy())
    throw error
  }

  if (!mounted.setup) throw new Error('Session-screen fixture renderer was not created')
  const setup = mounted.setup

  function destroy(): void {
    act(() => setup.renderer.destroy())
  }

  async function frame(): Promise<string> {
    await setup.renderOnce()

    return setup.captureCharFrame()
  }

  // Startup loads config, the backend and the first inventory through async effects; a test
  // starts on the screen it produces, as a user would.
  async function waitForStartup(): Promise<void> {
    const deadline = Date.now() + STARTUP_WAIT_MS

    while (handle.startup === undefined || handle.startup === 'loading') {
      if (Date.now() > deadline) {
        throw new Error(`The session-screen fixture never finished startup:\n${await frame()}`)
      }

      await act(() => settleTicks(1))
    }
  }

  try {
    await waitForStartup()
    await frame()
  } catch (error) {
    destroy()
    throw error
  }

  return {
    renderer: setup.renderer,
    calls,
    lifecycle,
    defects,
    frame,
    captureSpans: setup.captureSpans,
    colors(): ThemeColors {
      if (!handle.colors) throw new Error('Session-screen fixture has not rendered a theme yet')

      return handle.colors
    },
    async pressKey(...args: Parameters<typeof setup.mockInput.pressKey>): Promise<void> {
      await act(async () => setup.mockInput.pressKey(...args))
    },
    async typeText(text: string): Promise<void> {
      await act(async () => setup.mockInput.typeText(text))
    },
    async replaceQuery(text: string): Promise<void> {
      const input = setup.renderer.currentFocusedRenderable

      if (!(input instanceof TextareaRenderable)) {
        throw new Error('Query replacement requires a focused search textarea')
      }

      await act(async () => input.setText(text))
    },
    async settle(): Promise<void> {
      await act(() => settleTicks(10))
    },
    async refresh(): Promise<void> {
      const { refresh } = handle

      if (!refresh) throw new Error('The session-screen fixture has not mounted its refresh handle')
      await act(async () => refresh())
      await act(() => settleTicks(10))
    },
    async resize(width: number, height: number): Promise<void> {
      await act(async () => setup.resize(width, height))
    },
    async emitPalette(colors: TerminalColors): Promise<void> {
      await act(async () => {
        setup.renderer.emit('palette', colors)
      })
    },
    destroy,
  }
}
