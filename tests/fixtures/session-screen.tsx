import { TextareaRenderable } from '@opentui/core'
import type { TestRendererOptions, TestRendererSetup } from '@opentui/core/testing'
import { testRender } from '@opentui/react/test-utils'
import { act, useEffect } from 'react'
import { useAppCoreState } from '../../src/app/core-state'
import { loadSessionItems } from '../../src/app/data'
import { getSessionCommandState } from '../../src/app/derived'
import {
  useNormalModeSessionReset,
  useOpencodeStatsPolling,
  useSearchFiltering,
} from '../../src/app/effects'
import { handleSelectItem } from '../../src/app/handlers'
import { useAppKeyboard } from '../../src/app/keyboard'
import { useAppModalState } from '../../src/app/modal-state'
import { AppScreen } from '../../src/app/screen'
import { getDefaultConfig } from '../../src/config'
import type { LiveWorkspace, MultiplexerBackend } from '../../src/multiplexer'
import { filterAndSortItems } from '../../src/search'
import { isOptionSetting } from '../../src/settings'
import { resolveTheme, ThemeProvider } from '../../src/styles/theme'
import type { Config, Item, OpencodeSessionStats } from '../../src/types'
import { useTerminalSize } from '../../src/util/terminal'

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
  resize(width: number, height: number): Promise<void>
  destroy(): void
}

interface SessionFixture {
  config: Config
  backend: MultiplexerBackend
  items: Item[]
  projects: Item[]
  filterItems: typeof filterAndSortItems
  loadStatistics: (name: string) => Promise<OpencodeSessionStats | null>
  lifecycle: string[]
}

interface SessionScreenData {
  backend?: MultiplexerBackend
  projects?: Item[]
  filterItems?: typeof filterAndSortItems
  loadStatistics?: (name: string) => Promise<OpencodeSessionStats | null>
}

function unsupportedFixtureAction(): never {
  throw new Error('This session-screen fixture does not implement that action')
}

function SessionScreenFixture({ fixture }: { fixture: SessionFixture }) {
  const core = useAppCoreState()
  const modal = useAppModalState()
  const dimensions = useTerminalSize()
  const { config, backend, items, projects, filterItems, loadStatistics, lifecycle } = fixture
  const theme = resolveTheme(config.theme, config.themes, config.colorScheme).colors
  const derived = getSessionCommandState(
    core.appMode,
    core.viewMode,
    core.items,
    core.cursor,
    core.agentCursor,
    config,
    modal.commandsSearchQuery
  )
  const {
    setItems,
    setAllItems,
    setSessionItems,
    setProjectSourceItems,
    setSessionCandidateItems,
    prefixTimeoutRef,
  } = core

  useEffect(() => {
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
    items,
    projects,
    lifecycle,
    prefixTimeoutRef,
    setAllItems,
    setItems,
    setProjectSourceItems,
    setSessionCandidateItems,
    setSessionItems,
  ])

  useNormalModeSessionReset(
    core.appMode,
    core.viewMode,
    core.sessionItems,
    core.lastSessionSelectionRef,
    core.setAllItems,
    core.setItems,
    core.setCursor
  )
  useSearchFiltering(
    core.appMode,
    core.searchQuery,
    core.allItems,
    core.setItems,
    core.setCursor,
    filterItems
  )
  useOpencodeStatsPolling(derived.selectedAgentSession, loadStatistics)

  useAppKeyboard({
    ...core,
    ...modal,
    ...derived,
    config,
    filteredSettingsEntries: [],
    filteredSettingOptions: [],
    isOptionSetting,
    clearPendingKill: () => core.setPendingKillSessionName(null),
    handleSelect: item => handleSelectItem(item, config, backend),
    executeCommand: unsupportedFixtureAction,
    handleSettingOptionSubmit: unsupportedFixtureAction,
    handleSettingsEditorSubmit: unsupportedFixtureAction,
    handleRenameSubmit: unsupportedFixtureAction,
    handleNewSessionSubmit: unsupportedFixtureAction,
    openSettingOptions: unsupportedFixtureAction,
    openSettingEditor: unsupportedFixtureAction,
    closeModal: unsupportedFixtureAction,
    requestKillSession: unsupportedFixtureAction,
    togglePinnedSession: unsupportedFixtureAction,
    openRenameModal: unsupportedFixtureAction,
    openCommandsModal: unsupportedFixtureAction,
    openSettingsModal: unsupportedFixtureAction,
    refreshItems: unsupportedFixtureAction,
    handleKillSession: unsupportedFixtureAction,
    handleLastSession: unsupportedFixtureAction,
    handleRootSession: unsupportedFixtureAction,
    handleEditTarget: unsupportedFixtureAction,
    loadOpencodeStatsForSession: loadStatistics,
  })

  return (
    <ThemeProvider theme={theme}>
      <AppScreen
        {...core}
        {...derived}
        {...dimensions}
        theme={theme}
        config={config}
        backend={backend}
        projectCount={projects.length}
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
    theme: 'catppuccin',
    colorScheme: 'dark',
    autoUpdate: false,
    projectPaths: [],
    icons: { tmux: 'T', herdr: 'H', configured: 'C', project: 'P', opencode: 'A' },
  }
  const workspaces: LiveWorkspace[] = [
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
    },
    openOrCreate: unsupportedFixtureAction,
    rename: unsupportedFixtureAction,
    close: unsupportedFixtureAction,
    current: unsupportedFixtureAction,
    directory: unsupportedFixtureAction,
    openEditor: unsupportedFixtureAction,
  }
  const { sessionItems } = await loadSessionItems(config, async (_name, run) => run(), backend)
  const mounted: { setup?: TestRendererSetup } = {}
  try {
    await act(async () => {
      mounted.setup = await testRender(
        <SessionScreenFixture
          fixture={{
            config,
            backend,
            items: sessionItems,
            projects: data.projects ?? [],
            filterItems: data.filterItems ?? filterAndSortItems,
            loadStatistics: data.loadStatistics ?? unsupportedFixtureAction,
            lifecycle,
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
    async resize(width: number, height: number): Promise<void> {
      await act(async () => setup.resize(width, height))
    },
    destroy,
  }
}
