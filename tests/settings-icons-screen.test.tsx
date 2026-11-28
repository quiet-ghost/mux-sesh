import { afterEach, describe, expect, test } from 'bun:test'
import { NERD_FONT_ICONS } from '../src/settings/settings-icons'
import type { Config } from '../src/types'
import { selectedRows } from './fixtures/selection'
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

const NO_GLYPHS = { tmux: '', herdr: '', configured: '', project: '', opencode: '' }

async function render(saved: Config[], config: Partial<Config> = {}): Promise<Screen> {
  return renderSessionScreen(
    { width: 100, height: 28 },
    {
      config,
      saveConfig: async next => {
        saved.push(next)
      },
    }
  )
}

async function openIcons(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('Open settings')
  await fixture.pressKey('RETURN')
  await fixture.replaceQuery('Icons')
  await fixture.pressKey('RETURN')
  await fixture.settle()
}

async function selected(fixture: Screen): Promise<string> {
  return (await selectedRows(fixture)).at(-1)?.trim() ?? ''
}

describe('Icons form', () => {
  test('lists the on/off row and one glyph per kind, saving as they change', async () => {
    screen = await render([])
    await openIcons(screen)

    const frame = await screen.frame()
    expect(frame).toContain('┌─ Icons')
    expect(frame).toContain('Changes save as you make them')

    for (const title of ['tmux sessions', 'Herdr workspaces', 'Configured projects', 'Agents'])
      expect(frame).toMatch(new RegExp(`│   ${title} +none ↵ +│`))

    expect(await selected(screen)).toMatch(/^Icons +‹ off ›$/)
    expect(frame).toContain('change ←/→/enter  back esc')
  })

  test('→ on the Icons row turns the Nerd Font set on', async () => {
    const saved: Config[] = []
    screen = await render(saved)
    await openIcons(screen)
    await screen.pressKey('ARROW_RIGHT')
    await screen.settle()

    expect(saved.map(config => config.icons?.tmux)).toEqual([NERD_FONT_ICONS.tmux])
    expect(await selected(screen)).toMatch(/^Icons +‹ on ›$/)
  })

  test('Enter edits a glyph in place and saves it; ctrl+r clears it', async () => {
    const saved: Config[] = []
    screen = await render(saved)
    await openIcons(screen)
    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('ARROW_DOWN')
    expect(await selected(screen)).toMatch(/^Herdr workspaces +none ↵$/)
    expect(await screen.frame()).not.toContain('clear ctrl+r')

    await screen.pressKey('RETURN')
    await screen.settle()

    const editing = await screen.frame()
    expect(editing).toMatch(/│   Herdr workspaces +› /)
    expect(editing).toContain('apply enter  cancel esc')

    await screen.replaceQuery('H')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(saved.map(config => config.icons?.herdr)).toEqual(['H'])
    expect(await selected(screen)).toMatch(/^Herdr workspaces +H ↵$/)
    expect(await screen.frame()).toContain('clear ctrl+r')

    await screen.pressKey('r', { ctrl: true })
    await screen.settle()

    expect(saved.map(config => config.icons?.herdr)).toEqual(['H', ''])
    expect(await selected(screen)).toMatch(/^Herdr workspaces +none ↵$/)
  })

  test('esc cancels an edit, then goes back to the Icons row in Settings', async () => {
    const saved: Config[] = []
    screen = await render(saved, { icons: { ...NO_GLYPHS, opencode: 'A' } })
    await openIcons(screen)

    for (let press = 0; press < 5; press++) await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('RETURN')
    await screen.replaceQuery('B')
    await screen.pressKey('ESCAPE')
    await screen.settle()

    expect(saved).toEqual([])
    expect(await selected(screen)).toMatch(/^Agents +A ↵$/)

    await screen.pressKey('ESCAPE')
    await screen.settle()

    expect(await screen.frame()).toContain('┌─ Settings')
    expect(await selected(screen)).toMatch(/^Icons +on ↵$/)
  })
})
