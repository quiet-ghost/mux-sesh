import { TextareaRenderable } from '@opentui/core'
import type { TestRendererOptions, TestRendererSetup } from '@opentui/core/testing'
import { testRender } from '@opentui/react/test-utils'
import { act, useEffect } from 'react'
import { executeCommand as executeAppCommand } from '../../src/app/commands'
import { createAppControls } from '../../src/app/controls'
import { useAppCoreState } from '../../src/app/core-state'
import { loadSessionItems } from '../../src/app/data'
import { getSessionCommandState, getSettingsState } from '../../src/app/derived'
import {
  useNormalModeSessionReset,
  useSearchFiltering,
  useSelectionMemory,
  useSystemThemeFollow,
} from '../../src/app/effects'
import { FocusOwner } from '../../src/app/focus-owner'
import { handleSelectItem } from '../../src/app/handlers'
import { useDetailsInspector } from '../../src/app/inspector'
import { useAppKeyboard } from '../../src/app/keyboard'
import {
  LAUNCHER_QUERY_SERVICES,
  useLauncherQuery,
  type LauncherQueryServices,
} from '../../src/app/launcher-query'
import { useAppModalState } from '../../src/app/modal-state'
import { AppModalsLayer } from '../../src/app/modals-layer'
import { useResolvedTheme } from '../../src/app/resolved-theme'
import { createAppRuntime } from '../../src/app/runtime'
import { AppScreen } from '../../src/app/screen'
import { useSessionInventory } from '../../src/app/session-inventory'
import { useEffectRuntime } from '../../src/app/use-effect-runtime'
import { getDefaultConfig } from '../../src/config'
import type { LiveWorkspace, MultiplexerBackend } from '../../src/multiplexer'
import { filterAndSortItems } from '../../src/search'
import { getSettingEditorTitle, isOptionSetting } from '../../src/settings'
import { resolveTheme, ThemeProvider, type ThemeResolver } from '../../src/styles/theme'
import type { SubscribeThemeFollowOptions } from '../../src/styles/theme-follow'
import { AppMode, type Config, type Item, type KeybindMode } from '../../src/types'
import { shouldShowDetailPanel, useTerminalSize } from '../../src/util/terminal'

type BackendCall = { operation: 'list' } | { operation: 'details' | 'open'; id: string }

interface SessionScreenHarness {
  renderer: TestRendererSetup['renderer']
  calls: BackendCall[]
  lifecycle: string[]
  frame(): Promise<string>
  captureSpans: TestRendererSetup['captureSpans']
  pressKey(...args: Parameters<TestRendererSetup['mockInput']['pressKey']>): Promise<void>
  typeText(text: string): Promise<void>
  replaceQuery(text: string): Promise<void>
  settle(): Promise<void>
  resize(width: number, height: number): Promise<void>
  destroy(): void
}

interface SessionFixture {
  config: Config
  backend: MultiplexerBackend
  items: Item[]
  projects: Item[]
  filterItems: typeof filterAndSortItems
  lifecycle: string[]
  homeDir: string
  resolveTheme: ThemeResolver
  themeFollow?: SubscribeThemeFollowOptions
  launcher: LauncherQueryServices
}

interface SessionScreenData {
  keybindMode?: KeybindMode
  theme?: string
  workspaces?: LiveWorkspace[]
  backend?: MultiplexerBackend
  projects?: Item[]
  filterItems?: typeof filterAndSortItems
  homeDir?: string
  resolveTheme?: ThemeResolver
  themeFollow?: SubscribeThemeFollowOptions
}

// Assigned inside act(), so control-flow narrowing cannot track a local binding.
interface MountedRenderer {
  setup?: TestRendererSetup
}

function unsupportedFixtureAction(): never {
  throw new Error('This session-screen fixture does not implement that action')
}

const passthroughMeasure = async <T,>(_name: string, run: () => Promise<T>): Promise<T> => run()

function SessionScreenFixture({ fixture }: { fixture: SessionFixture }) {
  const effects = useEffectRuntime()
  const core = useAppCoreState()
  const modal = useAppModalState()
  const dimensions = useTerminalSize()
  const { config, backend, items, projects, filterItems, lifecycle, homeDir } = fixture

  const { resolvedTheme, refreshSystemTheme } = useResolvedTheme(
    {
      themeId: modal.themePreviewId ?? config.theme,
      customThemes: config.themes,
      colorScheme: config.colorScheme,
      homeDir,
    },
    fixture.resolveTheme
  )

  const theme = resolvedTheme.colors

  const derived = getSessionCommandState(
    core.appMode,
    core.viewMode,
    core.items,
    core.cursor,
    core.agentCursor,
    config,
    modal.commandsSearchQuery,
    backend
  )

  const inventory = useSessionInventory(effects, passthroughMeasure, {
    ...core,
    ...derived,
    config,
    backend,
  })

  const details = useDetailsInspector({
    effects,
    inventory,
    visible: shouldShowDetailPanel(dimensions.columns, core.appMode === AppMode.NewSession),
    item: derived.selectedPrimaryItem,
    config,
    backend,
  })

  const { refreshItems } = createAppRuntime({
    config,
    backend,
    viewMode: core.viewMode,
    inventory,
    setMessage: core.setMessage,
  })

  const settings = getSettingsState(
    config,
    modal.modalState,
    modal.settingsSearchQuery,
    modal.settingOptionsSearchQuery
  )

  const {
    setAppMode,
    setItems,
    setAllItems,
    setSessionItems,
    setProjectSourceItems,
    setSessionCandidateItems,
    prefixTimeoutRef,
  } = core

  useNormalModeSessionReset(
    core.appMode,
    core.viewMode,
    core.sessionItems,
    core.lastSessionSelectionRef,
    core.setAllItems,
    core.setItems,
    core.setCursor
  )

  useEffect(() => {
    setAppMode(config.keybindMode === 'standard' ? AppMode.Search : AppMode.Normal)
    setItems(items)
    setAllItems(items)
    setSessionItems(items)
    setProjectSourceItems(projects)
    setSessionCandidateItems(projects)
    lifecycle.push('mounted')

    return () => {
      if (prefixTimeoutRef.current) clearTimeout(prefixTimeoutRef.current)
      lifecycle.push('unmounted')
    }
  }, [
    config.keybindMode,
    items,
    projects,
    lifecycle,
    prefixTimeoutRef,
    setAppMode,
    setAllItems,
    setItems,
    setProjectSourceItems,
    setSessionCandidateItems,
    setSessionItems,
  ])

  useSystemThemeFollow(config.theme, homeDir, refreshSystemTheme, fixture.themeFollow)

  useSelectionMemory(
    core.appMode,
    core.viewMode,
    core.cursor,
    core.items,
    derived.selectedPrimaryItem,
    core.lastProjectSelectionRef,
    core.lastSessionSelectionRef
  )

  useSearchFiltering(
    core.appMode,
    core.searchQuery,
    core.allItems,
    core.setItems,
    core.setCursor,
    filterItems
  )

  useLauncherQuery({ ...core, config, backend }, fixture.launcher)

  const controls = createAppControls({
    ...core,
    ...modal,
    config,
    handleKillSession: unsupportedFixtureAction,
  })

  useAppKeyboard({
    active: true,
    toggleDetails: details.toggle,
    ...core,
    ...modal,
    ...derived,
    ...controls,
    ...settings,
    config,
    isOptionSetting,
    previewThemeOption: modal.setThemePreviewId,
    handleSelect: item => handleSelectItem(item, config, backend),
    executeCommand: command =>
      executeAppCommand(command, {
        keybindMode: config.keybindMode ?? 'vim',
        ...core,
        ...derived,
        ...controls,
        togglePinnedSession: unsupportedFixtureAction,
        refreshItems,
        handleLastSession: unsupportedFixtureAction,
        handleRootSession: unsupportedFixtureAction,
        handleEditTarget: unsupportedFixtureAction,
        showMessage: core.setMessage,
        toggleDetails: details.toggle,
      }),
    handleSettingOptionSubmit: unsupportedFixtureAction,
    handleSettingsEditorSubmit: unsupportedFixtureAction,
    handleRenameSubmit: unsupportedFixtureAction,
    handleNewSessionSubmit: unsupportedFixtureAction,
    togglePinnedSession: unsupportedFixtureAction,
    refreshItems,
    handleKillSession: unsupportedFixtureAction,
    handleLastSession: unsupportedFixtureAction,
    handleRootSession: unsupportedFixtureAction,
    handleEditTarget: unsupportedFixtureAction,
  })

  return (
    <ThemeProvider theme={theme}>
      <AppScreen
        {...core}
        {...derived}
        {...dimensions}
        theme={theme}
        focusOwner={FocusOwner.of({ ...core, modalState: modal.modalState })}
        config={config}
        backend={backend}
        details={details}
        projectCount={projects.length}
      />
      <AppModalsLayer
        {...modal}
        {...derived}
        {...settings}
        {...dimensions}
        configPath="/fixture/config.json"
        themeId={resolvedTheme.id}
        themeName={resolvedTheme.name}
        colorMode={resolvedTheme.mode}
        getSettingEditorTitle={getSettingEditorTitle}
      />
    </ThemeProvider>
  )
}

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
    icons: { tmux: 'T', herdr: 'H', configured: 'C', project: 'P', opencode: 'A' },
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
    current: unsupportedFixtureAction,
    directory: unsupportedFixtureAction,
    openEditor: unsupportedFixtureAction,
  }

  const { sessionItems } = await loadSessionItems(config, async (_name, run) => run(), backend)
  const projects = data.projects ?? []

  // Native search, warm-up, and candidate discovery stay offline; candidates are the fixture rows.
  const launcher: LauncherQueryServices = {
    debounceMs: LAUNCHER_QUERY_SERVICES.debounceMs,
    onDefect: cause => {
      throw cause
    },
    filterItems: data.filterItems ?? filterAndSortItems,
    openFileSearch: () => ({
      warm: async () => {},
      search: async () => ({ kind: 'found', items: [], nativeMs: 0 }),
      dispose: () => {},
    }),
    onDiscardedSearch: () => {},
    loadCandidates: async () => projects,
    linkSessions: async items => items,
  }

  const mounted: MountedRenderer = {}

  try {
    await act(async () => {
      mounted.setup = await testRender(
        <SessionScreenFixture
          fixture={{
            config,
            backend,
            items: sessionItems,
            projects,
            filterItems: data.filterItems ?? filterAndSortItems,
            lifecycle,
            homeDir: data.homeDir ?? '/fixture',
            resolveTheme: data.resolveTheme ?? resolveTheme,
            themeFollow: data.themeFollow,
            launcher,
          }}
        />,
        { ...options, consoleMode: 'disabled', exitOnCtrlC: false, kittyKeyboard: true }
      )
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

  try {
    await frame()
  } catch (error) {
    destroy()
    throw error
  }

  return {
    renderer: setup.renderer,
    calls,
    lifecycle,
    frame,
    captureSpans: setup.captureSpans,
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
      await act(async () => {
        for (let tick = 0; tick < 10; tick++) await Bun.sleep(0)
      })
    },
    async resize(width: number, height: number): Promise<void> {
      await act(async () => setup.resize(width, height))
    },
    destroy,
  }
}
