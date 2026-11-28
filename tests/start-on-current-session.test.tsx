import { afterEach, describe, expect, test } from 'bun:test'
import type { LiveWorkspace, WorkspaceRef } from '../src/multiplexer'
import { renderSessionScreen } from './fixtures/session-screen'
import { listRow, selectedRowText } from './fixtures/selection'
import { unsupportedBackend } from './fixtures/fake-backend'

function workspace(id: string, title: string): LiveWorkspace {
  return { backend: 'herdr', id, title, path: `/fixture/${title}`, isActive: false, unitCount: 1 }
}

const workspaces: LiveWorkspace[] = [
  workspace('w1', 'alpha'),
  workspace('w2', 'beta'),
  workspace('w3', 'gamma'),
]

const GAMMA: WorkspaceRef = { backend: 'herdr', id: 'w3', title: 'gamma' }

let screen: Awaited<ReturnType<typeof renderSessionScreen>> | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined
  fixture?.destroy()
})

describe('the picker starts on the current session', () => {
  test('the cursor starts on the session mux-sesh runs in', async () => {
    screen = await renderSessionScreen(
      { width: 80, height: 20 },
      { workspaces, current: async () => GAMMA }
    )
    await screen.settle()

    expect(await selectedRowText(screen)).toMatch(listRow('. gamma'))
  })

  test('the first frame does not wait for a slow current session', async () => {
    const current = Promise.withResolvers<WorkspaceRef | undefined>()

    screen = await renderSessionScreen(
      { width: 80, height: 20 },
      { workspaces, current: () => current.promise }
    )
    await screen.settle()

    expect(await selectedRowText(screen)).toMatch(listRow('. alpha'))

    current.resolve(GAMMA)
    await screen.settle()

    expect(await selectedRowText(screen)).toMatch(listRow('. gamma'))
  })

  test('a current session known before the first list waits for that list', async () => {
    // The first list lands only after the current session has been read.
    const currentRead = Promise.withResolvers<void>()

    const backend = unsupportedBackend({
      kind: 'herdr',
      capabilities: { previousWorkspace: false },
      async list() {
        await currentRead.promise

        return workspaces
      },
      async details(workspace) {
        return { workspace, isActive: false, unitLabel: 'Tabs', units: [], agents: [] }
      },
      async current() {
        currentRead.resolve()

        return GAMMA
      },
    })

    screen = await renderSessionScreen({ width: 80, height: 20 }, { backend })
    await screen.settle()

    expect(await selectedRowText(screen)).toMatch(listRow('. gamma'))
  })

  test('a key pressed before the current session is known keeps the cursor where the user put it', async () => {
    const current = Promise.withResolvers<WorkspaceRef | undefined>()

    screen = await renderSessionScreen(
      { width: 80, height: 20 },
      { workspaces, current: () => current.promise }
    )
    await screen.settle()
    await screen.pressKey('j')

    expect(await selectedRowText(screen)).toMatch(listRow('. beta'))

    current.resolve(GAMMA)
    await screen.settle()

    expect(await selectedRowText(screen)).toMatch(listRow('. beta'))
  })

  test('a query typed before the current session is known keeps the first match selected', async () => {
    const current = Promise.withResolvers<WorkspaceRef | undefined>()

    screen = await renderSessionScreen(
      { width: 80, height: 20 },
      { keybindMode: 'standard', workspaces, current: () => current.promise }
    )
    await screen.settle()
    await screen.typeText('a')
    await screen.settle()
    const before = await selectedRowText(screen)

    current.resolve(GAMMA)
    await screen.settle()

    expect(await selectedRowText(screen)).toBe(before)
  })

  test('standard mode starts its search list on the current session', async () => {
    screen = await renderSessionScreen(
      { width: 80, height: 20 },
      { keybindMode: 'standard', workspaces, current: async () => GAMMA }
    )
    await screen.settle()

    expect(await selectedRowText(screen)).toMatch(listRow('. gamma'))
  })

  test.each([
    ['is unknown', async (): Promise<WorkspaceRef | undefined> => undefined],
    [
      'is not listed',
      async (): Promise<WorkspaceRef | undefined> => ({
        backend: 'herdr',
        id: 'w9',
        title: 'gone',
      }),
    ],
    [
      'cannot be read',
      async (): Promise<WorkspaceRef | undefined> => {
        throw new Error('Herdr is unavailable')
      },
    ],
  ])(
    'the cursor stays at the top, silently, when the current session %s',
    async (_case, current) => {
      screen = await renderSessionScreen({ width: 80, height: 20 }, { workspaces, current })
      await screen.settle()

      expect(await selectedRowText(screen)).toMatch(listRow('. alpha'))
      expect(await screen.frame()).not.toContain('unavailable')
      expect(screen.defects).toEqual([])
    }
  )

  test('a backend that throws before returning a promise leaves the cursor at the top', async () => {
    screen = await renderSessionScreen({ width: 80, height: 20 }, { workspaces })
    await screen.settle()

    expect(await selectedRowText(screen)).toMatch(listRow('. alpha'))
    expect(screen.defects).toEqual([])
  })

  test('a current session far down the list is scrolled into view', async () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      workspace(`w${index}`, `session-${String(index).padStart(2, '0')}`)
    )

    screen = await renderSessionScreen(
      { width: 80, height: 14 },
      {
        workspaces: many,
        current: async () => ({ backend: 'herdr', id: 'w35', title: 'session-35' }),
      }
    )
    await screen.settle()

    expect(await selectedRowText(screen)).toMatch(listRow('. session-35'))
  })

  test('a pinned current session starts on its pinned row', async () => {
    screen = await renderSessionScreen(
      { width: 80, height: 20 },
      {
        workspaces,
        config: { pinnedSessions: ['beta', 'gamma'] },
        current: async () => GAMMA,
      }
    )
    await screen.settle()
    const frame = await screen.frame()

    expect(await selectedRowText(screen)).toMatch(listRow('. gamma'))
    expect(frame.indexOf('gamma')).toBeLessThan(frame.indexOf('alpha'))
  })

  test('a refresh after the start keeps the current session selected', async () => {
    screen = await renderSessionScreen(
      { width: 80, height: 20 },
      { workspaces, current: async () => GAMMA }
    )
    await screen.settle()
    await screen.refresh()

    expect(await selectedRowText(screen)).toMatch(listRow('. gamma'))
  })

  test('the start is placed once: moving away and refreshing does not return to it', async () => {
    screen = await renderSessionScreen(
      { width: 80, height: 20 },
      { workspaces, current: async () => GAMMA }
    )
    await screen.settle()
    await screen.pressKey('k')
    await screen.refresh()

    expect(await selectedRowText(screen)).toMatch(listRow('. beta'))
  })
})
