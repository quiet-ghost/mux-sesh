import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'path'
import { RGBA, TextareaRenderable } from '@opentui/core'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError } from '../src/multiplexer/types'
import { resolveTheme } from '../src/styles/theme'
import { renderSessionScreen } from './fixtures/session-screen'
import { listRow, selectedRowText } from './fixtures/selection'

let screen: Awaited<ReturnType<typeof renderSessionScreen>> | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.renderer.isDestroyed).toBe(true)
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
  expect(fixture.renderer.stdin.listenerCount('data')).toBe(0)
})

describe('production session screen', () => {
  test.each([
    { width: 60, height: 18 },
    { width: 80, height: 24 },
    { width: 120, height: 36 },
  ])('moves the selected row at $width x $height', async dimensions => {
    screen = await renderSessionScreen(dimensions)

    expect(await selectedRowText(screen)).toMatch(listRow('.*alpha'))
    expect(screen.captureSpans()).toMatchObject({ cols: dimensions.width, rows: dimensions.height })

    await screen.pressKey('ARROW_DOWN')

    const selected = await selectedRowText(screen)
    expect(selected).toMatch(listRow('.*beta'))
    expect(selected).not.toContain('alpha')

    expect(screen.calls).toEqual([{ operation: 'list' }])
  })

  test('keeps the selected row through terminal resize', async () => {
    screen = await renderSessionScreen({ width: 120, height: 36 })
    await screen.pressKey('ARROW_DOWN')

    await screen.resize(60, 18)

    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))
    expect(screen.captureSpans()).toMatchObject({ cols: 60, rows: 18 })
    expect(await screen.frame()).not.toContain('Status inactive')

    await screen.resize(80, 24)

    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))
    expect(screen.captureSpans()).toMatchObject({ cols: 80, rows: 24 })
    expect(await screen.frame()).not.toContain('Status inactive')

    await screen.resize(120, 36)

    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))
    expect(await screen.frame()).toContain('Status inactive')
  })

  test.each(['catppuccin', 'gruvbox'])('paints %s theme colors', async theme => {
    screen = await renderSessionScreen({ width: 80, height: 24 }, { theme })
    await screen.frame()
    const colors = resolveTheme(theme, {}, 'dark').colors
    const spans = screen.captureSpans().lines.flatMap(line => line.spans)
    const title = spans.find(span => span.text.includes('mux-sesh'))

    expect(title?.fg.toInts()).toEqual(RGBA.fromHex(colors.text).toInts())
    expect(title?.bg.toInts()).toEqual(RGBA.fromHex(colors.surface).toInts())
  })

  test('focuses the real search input and filters rendered rows', async () => {
    screen = await renderSessionScreen({ width: 60, height: 18 })
    expect(screen.renderer.currentFocusedRenderable?.id ?? null).toBeNull()

    await screen.pressKey('i')

    const input = screen.renderer.currentFocusedRenderable

    if (!(input instanceof TextareaRenderable)) {
      throw new Error('Search mode did not focus its textarea')
    }

    expect(input.focused).toBe(true)

    await screen.typeText('beta')

    const frame = await screen.frame()
    expect(input.plainText).toBe('beta')
    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))
    expect(frame).not.toContain('alpha')

    await screen.pressKey('ESCAPE')

    expect(screen.renderer.currentFocusedRenderable?.id ?? null).toBeNull()
    expect(await screen.frame()).toContain('alpha')
  })

  test.each([
    { key: 'q', opened: [] },
    { key: 'RETURN', opened: ['w2'] },
  ])(
    'exits after $key with renderer and effects released',
    async ({ key, opened }) => {
      const proc = Bun.spawn(
        [process.execPath, join(import.meta.dir, 'fixtures/session-screen-exit.ts'), key],
        {
          cwd: join(import.meta.dir, '..'),
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 5000,
          killSignal: 'SIGKILL',
        }
      )

      try {
        const [exitCode, stdout, stderr] = await Promise.all([
          proc.exited,
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ])

        expect(stderr).toBe('')
        expect(exitCode).toBe(0)
        const report: unknown = JSON.parse(stdout)
        expect(report).toEqual({
          exitCode: 0,
          selectedBeta: true,
          rendererDestroyed: true,
          inputListeners: 0,
          lifecycle: ['mounted', 'unmounted'],
          opened,
        })
      } finally {
        if (proc.exitCode === null) proc.kill('SIGKILL')
        await proc.exited
      }
    },
    10000
  )
})

function liveWorkspace(title: string, isActive = false): LiveWorkspace {
  return { backend: 'tmux', id: title, title, path: `/fixture/${title}`, isActive, unitCount: 1 }
}

interface ScriptedBackendState {
  lists: number
  next: () => Promise<LiveWorkspace[]>
}

// Each list() answers with the latest scripted rows or failure; the test counts every query.
function createScriptedBackend(initial: LiveWorkspace[]) {
  function unsupportedBackendCall(): never {
    throw new Error('The inventory screen probe only lists and previews sessions')
  }

  const state: ScriptedBackendState = {
    lists: 0,
    next: async () => initial,
  }

  const backend: MultiplexerBackend = {
    kind: 'tmux',
    capabilities: { previousWorkspace: false },
    async list() {
      state.lists++

      return state.next()
    },
    async details(workspace) {
      return { workspace, isActive: false, unitLabel: 'Windows', units: [], agents: [] }
    },
    open: unsupportedBackendCall,
    openOrCreate: unsupportedBackendCall,
    create: unsupportedBackendCall,
    start: unsupportedBackendCall,
    rename: unsupportedBackendCall,
    close: unsupportedBackendCall,
    current: unsupportedBackendCall,
    directory: unsupportedBackendCall,
    openEditor: unsupportedBackendCall,
  }

  return {
    backend,
    lists: () => state.lists,
    respond(rows: LiveWorkspace[]) {
      state.next = async () => rows
    },
    fail(error: Error) {
      state.next = async () => {
        throw error
      }
    },
  }
}

async function refreshScreen(fixture: Awaited<ReturnType<typeof renderSessionScreen>>) {
  await fixture.pressKey('x', { ctrl: true })
  await fixture.pressKey('R', { shift: true })
  await fixture.settle()
}

describe('session inventory on the production screen', () => {
  test('arrow navigation never queries the backend inventory', async () => {
    const scripted = createScriptedBackend([
      liveWorkspace('alpha'),
      liveWorkspace('beta'),
      liveWorkspace('delta'),
    ])

    screen = await renderSessionScreen({ width: 120, height: 36 }, { backend: scripted.backend })
    const listsAfterMount = scripted.lists()

    for (const key of ['ARROW_DOWN', 'ARROW_DOWN', 'ARROW_UP', 'ARROW_UP']) {
      await screen.pressKey(key)
      await screen.settle()
    }

    expect(await selectedRowText(screen)).toMatch(listRow('.*alpha'))
    expect(scripted.lists()).toBe(listsAfterMount)
  })

  test('selection follows its key across refreshes and falls back to the nearest row', async () => {
    const scripted = createScriptedBackend([
      liveWorkspace('alpha'),
      liveWorkspace('beta'),
      liveWorkspace('delta'),
    ])

    screen = await renderSessionScreen({ width: 120, height: 36 }, { backend: scripted.backend })
    await screen.pressKey('ARROW_DOWN')
    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))

    scripted.respond([
      liveWorkspace('aaron'),
      liveWorkspace('alpha'),
      liveWorkspace('beta', true),
      liveWorkspace('delta'),
    ])
    await refreshScreen(screen)
    const reordered = await screen.frame()
    expect(reordered).toContain('aaron')
    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))

    scripted.respond([liveWorkspace('aaron'), liveWorkspace('alpha'), liveWorkspace('delta')])
    await refreshScreen(screen)
    const removed = await screen.frame()
    expect(removed).not.toContain('beta')
    expect(await selectedRowText(screen)).toMatch(listRow('.*delta'))
  })

  test('an expected list failure keeps rows and selection, reports staleness, and recovers', async () => {
    const scripted = createScriptedBackend([liveWorkspace('alpha'), liveWorkspace('beta')])
    screen = await renderSessionScreen({ width: 120, height: 36 }, { backend: scripted.backend })
    await screen.pressKey('ARROW_DOWN')

    scripted.fail(new MultiplexerError('server-stopped', 'fixture server stopped'))
    await refreshScreen(screen)
    const stale = await screen.frame()
    expect(stale).toContain('alpha')
    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))
    expect(stale).toMatch(/fixture server stopped\s+Existing\s+sessions are unchanged/)

    scripted.respond([liveWorkspace('alpha'), liveWorkspace('beta'), liveWorkspace('delta')])
    await refreshScreen(screen)
    const recovered = await screen.frame()
    expect(recovered).toContain('delta')
    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))
    expect(recovered).not.toContain('Existing sessions are unchanged')
  })
})
