import { afterEach, describe, expect, test } from 'bun:test'
import { TextareaRenderable } from '@opentui/core'
import type { LiveWorkspace } from '../src/multiplexer'
import { renderSessionScreen } from './fixtures/session-screen'

const workspaces: LiveWorkspace[] = [
  {
    backend: 'herdr',
    id: 'plain',
    title: 'opencode-native-unknown',
    path: '/fixture/plain',
    isActive: false,
    unitCount: 1,
    agentStatus: 'unknown',
  },
  {
    backend: 'herdr',
    id: 'agents',
    title: 'agent-one',
    path: '/fixture/one',
    isActive: false,
    unitCount: 1,
    agentStatus: 'unknown',
    target: { kind: 'agent', tabId: 'agents:t1', paneId: 'agents:p1' },
  },
  {
    backend: 'herdr',
    id: 'agents',
    title: 'agent-two',
    path: '/fixture/two',
    isActive: false,
    unitCount: 1,
    agentStatus: 'working',
    target: { kind: 'agent', tabId: 'agents:t1', paneId: 'agents:p2' },
  },
]

let screen: Awaited<ReturnType<typeof renderSessionScreen>> | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined
  if (!fixture) return
  fixture.destroy()
  expect(fixture.renderer.isDestroyed).toBe(true)
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

describe('Agents navigation through production keyboard wiring', () => {
  test.each(['standard', 'vim'] as const)(
    'opens the palette from %s search and enters Agents',
    async keybindMode => {
      screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode, workspaces })
      if (keybindMode === 'vim') await screen.pressKey('i')
      await screen.replaceQuery('agent')

      await screen.pressKey('p', { ctrl: true })

      expect(await screen.frame()).toContain('Commands')
      await screen.replaceQuery('Open agent sessions')
      await screen.pressKey('RETURN')

      expect(await screen.frame()).toContain('Agent Sessions')
      expect(await screen.frame()).toMatch(/› .*agent-one/)
      await screen.pressKey('ARROW_DOWN')
      expect(await screen.frame()).toMatch(/› .*agent-two/)

      await screen.pressKey('p', { ctrl: true })
      const commands = await screen.frame()
      expect(commands).toContain('Commands')
      expect(commands).not.toContain('Kill session')
      expect(commands).not.toContain('Rename session')

      await screen.replaceQuery('Back')
      await screen.pressKey('RETURN')

      expect(await screen.frame()).not.toContain('Agent Sessions')
      expect(screen.renderer.currentFocusedRenderable instanceof TextareaRenderable).toBe(
        keybindMode === 'standard'
      )
    }
  )

  test.each(['escape', 'prefix'] as const)(
    'standard Agents entry preserves guards and returns via %s',
    async exit => {
      screen = await renderSessionScreen(
        { width: 120, height: 36 },
        { keybindMode: 'standard', workspaces }
      )
      await screen.replaceQuery('agent')
      await screen.pressKey('x', { ctrl: true })
      await screen.pressKey('o')

      const agents = await screen.frame()
      expect(agents).toContain('Agent Sessions')
      expect(agents).toMatch(/› .*agent-one/)
      expect(agents).not.toContain('opencode-native-unknown')
      for (const key of ['d', 'r']) {
        await screen.pressKey('x', { ctrl: true })
        await screen.pressKey(key)
        expect(await screen.frame()).toBe(agents)
      }

      if (exit === 'prefix') await screen.pressKey('x', { ctrl: true })
      await screen.pressKey(exit === 'prefix' ? 'o' : 'ESCAPE')

      expect(screen.renderer.currentFocusedRenderable instanceof TextareaRenderable).toBe(true)
      expect(await screen.frame()).not.toContain('Agent Sessions')
      expect(await screen.frame()).toMatch(/› .*agent-one/)
    }
  )
})
