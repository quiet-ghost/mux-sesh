import { TextareaRenderable, type TerminalColors } from '@opentui/core'
import type { TestRendererOptions, TestRendererSetup } from '@opentui/core/testing'
import { useRenderer } from '@opentui/react'
import { testRender } from '@opentui/react/test-utils'
import { act, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { executeCommand as executeAppCommand } from '../../src/app/commands'
import { createAppControls } from '../../src/app/controls'
import { useAppCoreState } from '../../src/app/core-state'
import { loadSessionItems } from '../../src/app/data'
import { getSessionCommandState, getSettingsState } from '../../src/app/derived'
import {
  useNormalModeSessionReset,
  useOpenHistory,
  usePendingCloseReset,
  useSearchFiltering,
  useSelectionMemory,
} from '../../src/app/effects'
import { FocusOwner } from '../../src/app/focus-owner'
import { createAppHandlers, handleSelectItem } from '../../src/app/handlers'
import { useDetailsInspector } from '../../src/app/inspector'
import { useAppKeyboard } from '../../src/app/keyboard'
import {
  getLaunchScope,
  planProjectRow,
  useLaunchRequest,
  type LaunchPlanning,
} from '../../src/app/launch-scope'
import {
  LAUNCHER_QUERY_SERVICES,
  useLauncherQuery,
  type LauncherQueryServices,
} from '../../src/app/launcher-query'
import { useAppModalState } from '../../src/app/modal-state'
import { getNewSessionStepControls, useNewSessionSteps } from '../../src/app/new-session-step'
import { openOutcomeModal } from '../../src/app/modals'
import { AppModalsLayer } from '../../src/app/modals-layer'
import { OptionPicker } from '../../src/app/option-picker'
import { useLiveResolvedTheme } from '../../src/app/resolved-theme'
import { createAppRuntime } from '../../src/app/runtime'
import { AppScreen } from '../../src/app/screen'
import { useSessionInventory } from '../../src/app/session-inventory'
import { useStartOnCurrentSession } from '../../src/app/start-cursor'
import { useEffectRuntime } from '../../src/app/use-effect-runtime'
import { getDefaultConfig } from '../../src/config'
import type { LiveWorkspace, MultiplexerBackend, WorkspaceRef } from '../../src/multiplexer'
import { filterAndSortItems } from '../../src/search'
import type { FileSearchOutcome } from '../../src/search/fff'
import type { OpenHistory } from '../../src/search/frecency-store'
import type { CloneServices } from '../../src/sessions/clone-plan'
import { getSettingEditorTitle, isOptionSetting } from '../../src/settings'
import { resolveTheme, ThemeProvider, type ThemeResolver } from '../../src/styles/theme'
import type { SubscribeThemeFollowOptions } from '../../src/styles/theme-follow'
import {
  AppMode,
  type Config,
  type Item,
  type KeybindMode,
  type ThemeColors,
} from '../../src/types'
import { useLaunchPreview } from '../../src/ui/launch-preview'
import {
  BusyContext,
  SpinnerMotionContext,
  STILL_MOTION,
  type SpinnerMotion,
} from '../../src/ui/Spinner'
import { anyPending, createPendingFlag } from '../../src/util/pending'
import { shouldShowDetailPanel, useTerminalSize } from '../../src/util/terminal'

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

interface SessionFixture {
  config: Config
  saveConfig: (config: Config) => Promise<void>
  backend: MultiplexerBackend
  items: Item[]
  projects: Item[]
  filterItems: typeof filterAndSortItems
  lifecycle: string[]
  defects: unknown[]
  homeDir: string
  resolveTheme: ThemeResolver
  themeFollow?: SubscribeThemeFollowOptions
  launcher: LauncherQueryServices
  invocationCwd: string
  clone: CloneServices
  handle: FixtureHandle
  spinnerMotion: SpinnerMotion
  openHistory?: OpenHistory
}

interface FixtureHandle {
  refresh?: () => Promise<void>
  colors?: ThemeColors
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
  // Search history as the app wires it: loaded from config, and the default filters rank by it.
  // Opens record into the production history, which this follows only when it is passed here.
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

const passthroughMeasure = async <T,>(_name: string, run: () => Promise<T>): Promise<T> => run()

// The test terminal never answers a palette query; palette changes arrive only as emitted events.
function useSilentTerminalPalette(): void {
  const renderer = useRenderer()

  renderer.getPalette = async () => {
    throw new Error('The fixture terminal does not report its palette')
  }
}

function SessionScreenFixture({ fixture }: { fixture: SessionFixture }) {
  useSilentTerminalPalette()
  const effects = useEffectRuntime()
  const core = useAppCoreState()
  const modal = useAppModalState()
  const dimensions = useTerminalSize()
  const [config, setConfig] = useState(fixture.config)
  const { backend, items, projects, filterItems, lifecycle, homeDir } = fixture

  const settings = getSettingsState(
    config,
    modal.modalState,
    modal.settingsSearchQuery,
    modal.settingOptionsSearchQuery
  )

  const resolvedTheme = useLiveResolvedTheme(
    {
      themeId:
        OptionPicker.previewedThemeId(
          modal.modalState,
          settings.filteredSettingOptions,
          modal.settingOptionsCursor
        ) ?? config.theme,
      customThemes: config.themes,
      colorScheme: config.colorScheme,
      homeDir,
    },
    { resolve: fixture.resolveTheme, follow: fixture.themeFollow }
  )

  const theme = resolvedTheme.colors

  useLayoutEffect(() => {
    fixture.handle.colors = theme
  }, [fixture.handle, theme])

  const derived = getSessionCommandState(
    core.appMode,
    core.viewMode,
    core.items,
    core.cursor,
    core.agentCursor,
    config,
    modal.commandsSearchQuery,
    backend,
    core.markedItems,
    core.pendingClose
  )

  const inventory = useSessionInventory(effects, passthroughMeasure, {
    ...core,
    ...derived,
    config,
    backend,
    setMessage: core.setInventoryStatus,
  })

  const details = useDetailsInspector({
    effects,
    inventory,
    visible: shouldShowDetailPanel(dimensions.columns, core.appMode === AppMode.NewSession),
    item: derived.selectedPrimaryItem,
    config,
    backend,
  })

  const { refreshItems, refreshList, reloadSessions } = createAppRuntime({
    config,
    backend,
    viewMode: core.viewMode,
    inventory,
    showToast: core.showToast,
  })

  useEffect(() => {
    fixture.handle.refresh = () => refreshItems()
  })

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

  usePendingCloseReset(
    core.pendingClose,
    derived.selectedPrimaryItem,
    modal.modalState !== null,
    core.setPendingClose
  )

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

  useStartOnCurrentSession({ ...core, ...derived, backend })

  const launcherFiles = useLauncherQuery(
    { ...core, config, backend, setMessage: core.setFileSearchStatus },
    fixture.launcher
  )

  const appControls = createAppControls({
    ...core,
    ...modal,
    config,
    backend,
    inventoryRevision: () => inventory.revision(),
  })

  const controls = {
    ...appControls,
    openSettingOptions: OptionPicker.openAtSaved(
      config,
      appControls.openSettingOptions,
      modal.setSettingOptionsCursor
    ),
  }

  const [launchGuard] = useState(createPendingFlag)
  const [busy] = useState(() => anyPending([inventory.loading, launchGuard]))

  const onDefect = useCallback(
    (cause: unknown) => {
      fixture.defects.push(cause)
    },
    [fixture.defects]
  )

  useOpenHistory(fixture.openHistory ? config : null, fixture.openHistory, onDefect)

  const newSession = useNewSessionSteps({
    active: core.appMode === AppMode.NewSession,
    config,
    searchQuery: core.searchQuery,
    setSearchQuery: core.setSearchQuery,
    selected: derived.selectedPrimaryItem,
    files: launcherFiles,
    onDefect,
  })

  const launchScope = getLaunchScope(core.appMode, core.viewMode, derived.selectedPrimaryItem)

  const launchRequest = useLaunchRequest(
    launchScope,
    newSession.request,
    derived.selectedPrimaryItem
  )

  const launchPlanning: LaunchPlanning = {
    config,
    backend: backend.kind,
    invocationCwd: fixture.invocationCwd,
    liveSessions: core.sessionItems,
    clone: fixture.clone,
  }

  const launchPreview = useLaunchPreview({
    ...launchPlanning,
    active: launchScope !== 'none',
    request: launchRequest,
    onDefect: cause => {
      fixture.defects.push(cause)
    },
  })

  const handlers = createAppHandlers({
    ...core,
    ...modal,
    ...derived,
    ...controls,
    clone: fixture.clone,
    launchGuard,
    backend,
    config,
    showOutcome: report => openOutcomeModal(report, modal.setModalState),
    refreshItems,
    refreshList,
    reloadSessions,
    toggleDetails: details.toggle,
    saveConfig: fixture.saveConfig,
    setConfig,
    renamedValue: '',
    settingEditorPlainText: modal.settingEditorTextareaRef.current?.plainText,
    launchPreview,
    rememberedSessions: () => {},
    inventoryRevision: () => inventory.revision(),
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
    handleSelect: item => handleSelectItem(item, config, backend),
    launchPlanned: handlers.handleNewSessionSubmit,
    launchProjectRow: item => handlers.handleNewSessionSubmit(planProjectRow(item, launchPlanning)),
    executeCommand: command =>
      executeAppCommand(command, {
        keybindMode: config.keybindMode ?? 'vim',
        ...core,
        ...derived,
        ...controls,
        togglePinnedSession: unsupportedFixtureAction,
        refreshItems,
        refreshList,
        handleLastSession: unsupportedFixtureAction,
        handleRootSession: unsupportedFixtureAction,
        handleEditTarget: unsupportedFixtureAction,
        toggleDetails: details.toggle,
      }),
    handleSettingOptionSubmit: handlers.handleSettingOptionSubmit,
    handleSettingsEditorSubmit: handlers.handleSettingsEditorSubmit,
    handleSettingStep: handlers.handleSettingStep,
    handleRenameSubmit: unsupportedFixtureAction,
    newSession: getNewSessionStepControls(
      newSession,
      launchPreview,
      handlers.handleNewSessionSubmit,
      core.showToast
    ),
    handleOutcomeRetry: handlers.handleOutcomeRetry,
    confirmCloseReview: handlers.confirmCloseReview,
    confirmBatchClose: handlers.confirmBatchClose,
    retryBatchClose: handlers.retryBatchClose,
    onDefect: cause => {
      fixture.defects.push(cause)
    },
    togglePinnedSession: unsupportedFixtureAction,
    refreshItems,
    refreshList,
    handleLastSession: unsupportedFixtureAction,
    handleRootSession: unsupportedFixtureAction,
    handleEditTarget: unsupportedFixtureAction,
  })

  return (
    <ThemeProvider theme={theme}>
      <SpinnerMotionContext value={fixture.spinnerMotion}>
        <BusyContext value={busy}>
          <AppScreen
            {...core}
            {...derived}
            {...dimensions}
            theme={theme}
            focusOwner={FocusOwner.of({ ...core, modalState: modal.modalState })}
            config={config}
            backend={backend}
            details={details}
            launchPreview={launchPreview}
            newSession={newSession}
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
        </BusyContext>
      </SpinnerMotionContext>
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

  const { sessionItems } = await loadSessionItems(config, async (_name, run) => run(), backend)
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

  try {
    await act(async () => {
      mounted.setup = await testRender(
        <SessionScreenFixture
          fixture={{
            config,
            saveConfig: data.saveConfig ?? unsupportedFixtureAction,
            backend,
            items: sessionItems,
            projects,
            filterItems,
            lifecycle,
            defects,
            homeDir: data.homeDir ?? '/fixture',
            resolveTheme: data.resolveTheme ?? resolveTheme,
            themeFollow: data.themeFollow,
            launcher,
            handle,
            invocationCwd: data.invocationCwd ?? '/fixture',
            clone: data.clone ?? NO_GIT,
            spinnerMotion: data.spinnerMotion ?? STILL_MOTION,
            openHistory: history,
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
      await act(async () => {
        for (let tick = 0; tick < 10; tick++) await Bun.sleep(0)
      })
    },
    async refresh(): Promise<void> {
      const { refresh } = handle

      if (!refresh) throw new Error('The session-screen fixture has not mounted its refresh handle')
      await act(async () => refresh())
      await act(async () => {
        for (let tick = 0; tick < 10; tick++) await Bun.sleep(0)
      })
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
