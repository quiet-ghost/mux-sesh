import { afterEach, describe, expect, test } from 'bun:test'
import { RGBA } from '@opentui/core'
import type { LiveWorkspace } from '../src/multiplexer'
import { resolveTheme } from '../src/styles/theme'
import type { KeybindMode } from '../src/config/config-model'
import type { Item } from '../src/items/item'
import { CURRENT_VERSION } from '../src/update/version'
import { footerHints, footerLineOf, hints, readFooter } from './fixtures/footer'
import { cellsOf, contrastRatio, sameColor } from './fixtures/selection'
import { renderSessionScreen } from './fixtures/session-screen'
import { waitForFrame } from './fixtures/wait'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

const VERSION = `v${CURRENT_VERSION}`

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

function project(title: string): Item {
  return { title, desc: '', path: `/fixture/${title}`, isSession: false, itemKind: 'project' }
}

async function waitForFooter(fixture: Screen, label: string): Promise<string> {
  const frame = await waitForFrame(
    fixture,
    shown => footerHints(shown).some(text => text.startsWith(label)),
    4_000
  )

  if (frame !== undefined) return frame

  throw new Error(`The footer never offered '${label}':\n${await fixture.frame()}`)
}

describe('main footer', () => {
  test('Normal names screen actions on the left and row actions on the right', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 })

    expect(readFooter(await screen.frame())).toEqual({
      global: hints(['search', 'i'], ['new', 'n'], ['commands', 'ctrl+p'], ['prefix', 'ctrl+x']),
      target: hints(['select', 'enter'], ['close', 'd']),
      version: VERSION,
    })
  })

  test.each([
    { theme: 'github', colorScheme: 'light' as const },
    { theme: 'rosepine', colorScheme: 'dark' as const },
  ])(
    'screen hints are muted; row actions keep text labels and muted keys ($theme $colorScheme)',
    async ({ theme, colorScheme }) => {
      screen = await renderSessionScreen(
        { width: 110, height: 30 },
        { theme, config: { colorScheme } }
      )
      await screen.frame()

      const colors = resolveTheme(theme, {}, colorScheme).colors
      const line = screen.captureSpans().lines.at(-1)
      const cells = line ? cellsOf(line) : []
      const text = cells.map(cell => cell.char).join('')

      // Every cell of `part`, within the first `whole` on the footer, is painted in `hex`.
      const painted = (whole: string, part: string, hex: string) => {
        const at = text.indexOf(whole) + whole.indexOf(part)
        const span = cells.slice(at, at + part.length)

        return text.includes(whole) && span.every(cell => sameColor(cell.fg, hex))
      }

      for (const [label, key] of [
        ['search', 'i'],
        ['new', 'n'],
        ['commands', 'ctrl+p'],
        ['prefix', 'ctrl+x'],
      ] as const) {
        expect(painted(`${label} ${key}`, label, colors.textMuted)).toBe(true)
        expect(painted(`${label} ${key}`, ` ${key}`, colors.textSubtle)).toBe(true)
      }

      for (const [label, key] of [
        ['select', 'enter'],
        ['close', 'd'],
      ] as const) {
        expect(painted(`${label} ${key}`, label, colors.text)).toBe(true)
        expect(painted(`${label} ${key}`, ` ${key}`, colors.textMuted)).toBe(true)
      }

      expect(painted(VERSION, VERSION, colors.textSubtle)).toBe(true)
      expect(cells.every(cell => sameColor(cell.bg, colors.surface))).toBe(true)

      // The muted hints stay readable on the footer: at least the 3:1 large-text minimum.
      expect(contrastRatio(colors.textMuted, colors.surface)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(colors.textSubtle, colors.surface)).toBeGreaterThanOrEqual(3)
    }
  )

  test('an active prefix is shown on its hint until the next key', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 })

    await screen.pressKey('x', { ctrl: true })
    const waiting = await screen.frame()

    expect(readFooter(waiting).global).toEndWith(hints(['prefix', 'ctrl+x …']))

    const colors = resolveTheme('catppuccin', {}, 'dark').colors

    const prefix = screen
      .captureSpans()
      .lines.at(-1)
      ?.spans.find(span => span.text.includes('prefix'))

    expect(prefix?.fg.toInts()).toEqual(RGBA.fromHex(colors.primary).toInts())

    await screen.pressKey('ESCAPE')
    expect(readFooter(await screen.frame()).global).toEndWith(hints(['prefix', 'ctrl+x']))
  })

  test('marked rows name the batch close on the right', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 })

    await screen.pressKey('m')
    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('m')

    expect(readFooter(await screen.frame()).target).toBe(
      hints(['select', 'enter'], ['close 2 marked', 'd'])
    )
  })

  test('Search keeps commands and cancel on the left', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 }, { keybindMode: 'standard' })

    expect(readFooter(await screen.frame())).toEqual({
      global: hints(['commands', 'ctrl+p'], ['cancel', 'esc']),
      target: hints(['select', 'enter']),
      version: VERSION,
    })
  })

  test.each<KeybindMode>(['vim', 'standard'])(
    '%s Agents puts focus on the right',
    async keybindMode => {
      screen = await renderSessionScreen(
        { width: 110, height: 30 },
        { keybindMode, workspaces: agentWorkspaces }
      )

      if (keybindMode === 'vim') {
        await screen.pressKey('o')
      } else {
        await screen.pressKey('x', { ctrl: true })
        await screen.pressKey('o')
      }

      expect(readFooter(await screen.frame())).toEqual({
        global: hints(['back', 'esc'], ['commands', 'ctrl+p'], ['prefix', 'ctrl+x']),
        target: hints(['focus', 'enter']),
        version: VERSION,
      })
    }
  )

  test('New puts the planned Enter on the right and its steps on the left', async () => {
    screen = await renderSessionScreen(
      { width: 110, height: 30 },
      { projects: [project('api')], config: { defaultSession: {} } }
    )

    await screen.pressKey('n')
    const frame = await waitForFooter(screen, 'create')

    expect(readFooter(frame)).toEqual({
      global: hints(
        ['name', 'ctrl+n'],
        ['startup', 'ctrl+t'],
        ['here', 'ctrl+g'],
        ['file', 'ctrl+o'],
        ['cancel', 'esc']
      ),
      target: hints(['create', 'enter']),
      version: VERSION,
    })
  })
})

describe('main footer at 60 columns', () => {
  test('Normal keeps row actions, commands, and the version, then fills by priority', async () => {
    screen = await renderSessionScreen({ width: 60, height: 18 })

    const frame = await screen.frame()
    expect(footerLineOf(frame)).toHaveLength(60)
    expect(readFooter(frame)).toEqual({
      global: hints(['search', 'i'], ['commands', 'ctrl+p']),
      target: hints(['select', 'enter'], ['close', 'd']),
      version: VERSION,
    })
  })

  test('an active prefix takes the left group', async () => {
    screen = await renderSessionScreen({ width: 60, height: 18 })

    await screen.pressKey('x', { ctrl: true })

    expect(readFooter(await screen.frame())).toEqual({
      global: hints(['search', 'i'], ['prefix', 'ctrl+x …']),
      target: hints(['select', 'enter'], ['close', 'd']),
      version: VERSION,
    })
  })

  test('New keeps the planned Enter, cancel, and the version', async () => {
    screen = await renderSessionScreen(
      { width: 60, height: 18 },
      { projects: [project('api')], config: { defaultSession: {} } }
    )

    await screen.pressKey('n')
    const frame = await waitForFooter(screen, 'create')

    expect(readFooter(frame)).toEqual({
      global: hints(['name', 'ctrl+n'], ['cancel', 'esc']),
      target: hints(['create', 'enter']),
      version: VERSION,
    })
  })

  test('the dev badge stays visible', async () => {
    const previous = process.env.MUX_SESH_DEV
    process.env.MUX_SESH_DEV = '1'

    try {
      screen = await renderSessionScreen({ width: 60, height: 18 })
      expect(readFooter(await screen.frame()).version).toBe('dev')
    } finally {
      if (previous === undefined) delete process.env.MUX_SESH_DEV
      else process.env.MUX_SESH_DEV = previous
    }
  })
})
