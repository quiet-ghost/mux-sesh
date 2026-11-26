import { afterEach, describe, expect, test } from 'bun:test'
import { TextareaRenderable } from '@opentui/core'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import type { KeybindMode } from '../src/types'
import { renderSessionScreen } from './fixtures/session-screen'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.renderer.isDestroyed).toBe(true)
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

const MODES: KeybindMode[] = ['vim', 'standard']

const agentWorkspaces: LiveWorkspace[] = [
  {
    backend: 'herdr',
    id: 'plain',
    title: 'plain',
    path: '/fixture/plain',
    isActive: false,
    unitCount: 1,
  },
  {
    backend: 'herdr',
    id: 'agents',
    title: 'agent-one',
    path: '/fixture/one',
    isActive: false,
    unitCount: 1,
    agentStatus: 'working',
    target: { kind: 'agent', tabId: 'agents:t1', paneId: 'agents:p1' },
  },
]

function createTmuxBackend(mutations: string[]): MultiplexerBackend {
  function unexpected(operation: string): () => never {
    return () => {
      mutations.push(operation)
      throw new Error(`The live tmux fixture does not implement ${operation}`)
    }
  }

  return {
    kind: 'tmux',
    capabilities: { previousWorkspace: true },
    async list() {
      return [
        {
          backend: 'tmux',
          id: 'alpha',
          title: 'alpha',
          path: '/fixture/alpha',
          isActive: false,
          unitCount: 1,
        },
      ]
    },
    async details(workspace) {
      return { workspace, isActive: false, unitLabel: 'Windows', units: [], agents: [] }
    },
    open: unexpected('open'),
    openOrCreate: unexpected('openOrCreate'),
    create: unexpected('create'),
    start: unexpected('start'),
    rename: unexpected('rename'),
    close: unexpected('close'),
    current: unexpected('current'),
    directory: unexpected('directory'),
    openEditor: unexpected('openEditor'),
  }
}

function footerOf(frame: string): string {
  const line = frame
    .split('\n')
    .findLast(row => row.includes('ctrl+p commands') || row.includes('esc cancel'))

  if (line === undefined) throw new Error(`No footer hint was rendered:\n${frame}`)

  return line
}

async function pressPrefixed(fixture: Screen, key: string): Promise<void> {
  await fixture.pressKey('x', { ctrl: true })
  await fixture.pressKey(key)
}

async function runPaletteCommand(fixture: Screen, title: string): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery(title)
  await fixture.pressKey('RETURN')
}

async function enterAgents(fixture: Screen, keybindMode: KeybindMode): Promise<void> {
  if (keybindMode === 'standard') {
    await pressPrefixed(fixture, 'o')
  } else {
    await fixture.pressKey('o')
  }

  expect(await fixture.frame()).toContain('Agent Sessions')
}

describe('actions on an empty session list', () => {
  test.each(MODES)('%s palette runs global actions', async keybindMode => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode, workspaces: [] })

    await screen.pressKey('p', { ctrl: true })
    const palette = await screen.frame()

    for (const title of ['Search', 'New session', 'Open settings', 'Themes', 'Refresh']) {
      expect(palette).toContain(title)
    }

    expect(palette).toMatch(/Open agent sessions\s+No agent sessions/)
    await screen.pressKey('ESCAPE')

    await runPaletteCommand(screen, 'Refresh')
    await screen.settle()
    expect(await screen.frame()).toContain('Refreshed')

    await runPaletteCommand(screen, 'Open settings')
    expect(await screen.frame()).toContain('Search settings')
    await screen.pressKey('ESCAPE')

    await runPaletteCommand(screen, 'Search')
    const searching = await screen.frame()
    expect(searching).not.toContain('Commands')
    expect(searching).toContain('Type to search...')

    const search = screen.renderer.currentFocusedRenderable
    expect(search instanceof TextareaRenderable && !search.isDestroyed).toBe(true)

    await runPaletteCommand(screen, 'New session')
    expect(await screen.frame()).toContain('New Workspace')
  })

  test('vim footer offers only global keys', async () => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [] })

    const footer = footerOf(await screen.frame())
    expect(footer).toContain('i search')
    expect(footer).toContain('n new')
    expect(footer).toContain('ctrl+p commands')
    expect(footer).not.toContain('enter select')
    expect(footer).not.toContain('d close')
    expect(footer).not.toContain('o agents')
  })

  test('standard footer offers commands without a selection', async () => {
    screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { keybindMode: 'standard', workspaces: [] }
    )

    const footer = footerOf(await screen.frame())
    expect(footer).toContain('ctrl+p commands')
    expect(footer).not.toContain('enter select')
  })
})

describe('footer follows the live screen context', () => {
  test('vim footer offers agents when agent panes exist', async () => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: agentWorkspaces })

    expect(footerOf(await screen.frame())).toContain('o agents')
  })

  test('standard footer omits vim-only direct keys', async () => {
    screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { keybindMode: 'standard', workspaces: agentWorkspaces }
    )

    const footer = footerOf(await screen.frame())
    expect(footer).toContain('ctrl+p commands')
    expect(footer).not.toContain('i search')
    expect(footer).not.toMatch(/(^|\s)o agents/)
  })
})

describe('actions on a targeted Herdr agent', () => {
  test.each(MODES)('%s palette shows rename and close as unavailable', async keybindMode => {
    screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { keybindMode, workspaces: agentWorkspaces }
    )
    await enterAgents(screen, keybindMode)

    const footer = footerOf(await screen.frame())
    expect(footer).toContain('esc back')
    expect(footer).not.toContain('close')
    expect(footer).not.toContain('rename')

    await screen.pressKey('p', { ctrl: true })
    const palette = await screen.frame()
    expect(palette).toMatch(/Close session\s+Close it in Herdr/)
    expect(palette).toMatch(/Rename session\s+Rename it in Herdr/)

    await screen.replaceQuery('Close session')
    await screen.pressKey('RETURN')
    const refused = await screen.frame()
    expect(refused).toContain('Commands')
    expect(refused).toContain('Close session unavailable: Close it in Herdr')
    expect(screen.calls.filter(call => call.operation === 'open')).toEqual([])
  })

  test.each(MODES)('%s rename and close keys explain the refusal', async keybindMode => {
    screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { keybindMode, workspaces: agentWorkspaces }
    )
    await enterAgents(screen, keybindMode)

    if (keybindMode === 'vim') {
      await screen.pressKey('d')
    } else {
      await pressPrefixed(screen, 'd')
    }

    expect(await screen.frame()).toContain('Close session unavailable: Close it in Herdr')

    await pressPrefixed(screen, 'r')
    const renamed = await screen.frame()
    expect(renamed).toContain('Rename session unavailable: Rename it in Herdr')
    expect(renamed).not.toContain('Rename Session')
    expect(screen.calls.filter(call => call.operation === 'open')).toEqual([])
  })
})

describe('previous session on Herdr', () => {
  test.each(MODES)('%s palette and keys agree it is unavailable', async keybindMode => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })

    await screen.pressKey('p', { ctrl: true })
    expect(await screen.frame()).toMatch(
      /Last session\s+Herdr does not track the previous workspace/
    )

    await screen.replaceQuery('Last session')
    await screen.pressKey('RETURN')
    expect(await screen.frame()).toContain(
      'Last session unavailable: Herdr does not track the previous workspace'
    )
    await screen.pressKey('ESCAPE')

    await screen.settle()
    await pressPrefixed(screen, 'l')
    expect(await screen.frame()).toContain(
      'Last session unavailable: Herdr does not track the previous workspace'
    )
  })
})

describe('actions on a live tmux session', () => {
  test.each(MODES)('%s palette, footer, and keys agree', async keybindMode => {
    const mutations: string[] = []
    screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { keybindMode, backend: createTmuxBackend(mutations) }
    )

    const footer = footerOf(await screen.frame())
    expect(footer).toContain('enter select')
    expect(footer).not.toContain('o agents')

    if (keybindMode === 'vim') expect(footer).toContain('d close')

    await screen.pressKey('p', { ctrl: true })
    const palette = await screen.frame()

    for (const title of ['Close session', 'Rename session', 'Pin session', 'Last session']) {
      expect(palette).toContain(title)
    }

    for (const reason of ['Select a', 'Close it in', 'Rename it in', 'does not track']) {
      expect(palette).not.toContain(reason)
    }

    expect(palette).toMatch(/Edit target\s+Only configured projects have one/)
    await screen.pressKey('ESCAPE')

    await pressPrefixed(screen, 'r')
    expect(await screen.frame()).toContain('Rename Session')
    await screen.pressKey('ESCAPE')

    await runPaletteCommand(screen, 'Rename session')
    expect(await screen.frame()).toContain('Rename Session')
    await screen.pressKey('ESCAPE')

    if (keybindMode === 'vim') {
      await screen.pressKey('d')
    } else {
      await pressPrefixed(screen, 'd')
    }

    expect(await screen.frame()).not.toContain('unavailable')
    expect(mutations).toEqual([])
  })
})
