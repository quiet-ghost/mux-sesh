import { afterEach, describe, expect, test } from 'bun:test'
import { RGBA } from '@opentui/core'
import type { LiveWorkspace } from '../src/multiplexer'
import { resolveTheme } from '../src/styles/theme'
import type { Item, KeybindMode } from '../src/types'
import { CURRENT_VERSION } from '../src/update/version'
import { footerHints, footerLineOf, hints, readFooter } from './fixtures/footer'
import { renderSessionScreen } from './fixtures/session-screen'

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
  const deadline = Date.now() + 4_000

  while (Date.now() < deadline) {
    await fixture.settle()
    const frame = await fixture.frame()

    if (footerHints(frame).some(text => text.startsWith(label))) return frame
    await Bun.sleep(5)
  }

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

  test('labels use the text color and keys the muted color', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 })
    await screen.frame()

    const colors = resolveTheme('catppuccin', {}, 'dark').colors
    const footer = screen.captureSpans().lines.at(-1)?.spans ?? []
    const label = footer.find(span => span.text.includes('search'))
    const key = footer.find(span => span.text.includes('ctrl+p'))

    expect(label?.fg.toInts()).toEqual(RGBA.fromHex(colors.text).toInts())
    expect(key?.fg.toInts()).toEqual(RGBA.fromHex(colors.textMuted).toInts())
  })

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
