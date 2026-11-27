import { afterEach, describe, expect, test } from 'bun:test'
import type { LiveWorkspace } from '../src/multiplexer'
import { renderSessionScreen } from './fixtures/session-screen'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.defects).toEqual([])
})

const workspaces: LiveWorkspace[] = [
  {
    backend: 'tmux',
    id: '$1',
    title: 'api-gateway',
    path: '/fixture/projects/api-gateway',
    isActive: true,
    unitCount: 1,
  },
  {
    backend: 'tmux',
    id: '$2',
    title: 'blog',
    path: '/fixture/projects/blog',
    isActive: false,
    unitCount: 1,
  },
]

const CONFIGURED_ICONS = { tmux: 'T', herdr: 'H', configured: 'C', project: 'P', opencode: 'A' }

describe('row icons', () => {
  test('the default rows and headers show no icon and no extra column', async () => {
    screen = await renderSessionScreen({ width: 110, height: 24 }, { workspaces })
    const frame = await screen.frame()

    expect(frame).toMatch(/^ Live\s*$/m)
    expect(frame).toMatch(/^ [ ┃] {2}● api-gateway  projects\s/m)
    expect(frame).toMatch(/^ {4}○ blog {9}projects\s/m)
    expect(frame).not.toMatch(/[●○] [TPHCA] /)
  })

  test('configured icons still render before the title and the header label', async () => {
    screen = await renderSessionScreen(
      { width: 110, height: 24 },
      { workspaces, config: { icons: CONFIGURED_ICONS } }
    )
    const frame = await screen.frame()

    expect(frame).toMatch(/^ T Live\s*$/m)
    expect(frame).toMatch(/^ [ ┃] {2}● T api-gateway  projects\s/m)
    expect(frame).toMatch(/^ {4}○ T blog {9}projects\s/m)
  })
})
