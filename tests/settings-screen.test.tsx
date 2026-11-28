import { afterEach, describe, expect, test } from 'bun:test'
import { TextareaRenderable } from '@opentui/core'
import type { Config } from '../src/types'
import { withoutSideBorders } from './fixtures/pane'
import { sameColor, selectedRows } from './fixtures/selection'
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

interface SaveProbe {
  saved: Config[]
  save: (config: Config) => Promise<void>
  hold: () => () => void
}

function saveProbe(): SaveProbe {
  const saved: Config[] = []
  let held: Promise<void> | null = null

  return {
    saved,
    save: async config => {
      if (held) await held
      saved.push(config)
    },
    hold: () => {
      let release = () => {}

      held = new Promise(resolve => {
        release = resolve
      })

      return () => {
        held = null
        release()
      }
    },
  }
}

function focusedQuery(fixture: Screen): string {
  const input = fixture.renderer.currentFocusedRenderable

  if (!(input instanceof TextareaRenderable)) throw new Error('No text field has focus')

  return input.plainText
}

async function openSettings(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('Open settings')
  await fixture.pressKey('RETURN')
}

describe('Settings startup command', () => {
  test('one Startup command row edits the default session startup command', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await openSettings(screen)
    await screen.replaceQuery('editor command')

    const searched = await screen.frame()
    expect(searched).not.toContain('Editor Command')
    expect(searched).not.toContain('Default Startup')

    await screen.replaceQuery('Startup')
    await screen.pressKey('RETURN')
    expect(await screen.frame()).toContain('┌─ Startup command')

    await screen.replaceQuery('helix')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(probe.saved.map(config => config.defaultSession?.startupCommand)).toEqual(['helix'])
  })
})

describe('Settings name depth', () => {
  test('→ and ← step Name depth and save each step', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await openSettings(screen)
    await screen.replaceQuery('Name depth')
    expect(await screen.frame()).toContain('1 · mux-sesh')

    await screen.pressKey('ARROW_RIGHT')
    await screen.settle()
    expect(await screen.frame()).toContain('2 · dev/mux-sesh')

    await screen.pressKey('ARROW_LEFT')
    await screen.settle()

    expect(probe.saved.map(config => config.dirLength)).toEqual([2, 1])
    expect(await screen.frame()).toContain('1 · mux-sesh')
  })

  test('stepping past the limit saves nothing and says nothing', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await openSettings(screen)
    await screen.replaceQuery('Name depth')

    await screen.pressKey('ARROW_LEFT')
    await screen.settle()

    expect(probe.saved).toEqual([])
    expect(await screen.frame()).not.toContain('updated')
  })

  test('a step waits for the save before it saves again', async () => {
    const probe = saveProbe()
    const release = probe.hold()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await openSettings(screen)
    await screen.replaceQuery('Name depth')

    await screen.pressKey('ARROW_RIGHT')
    await screen.settle()
    await screen.pressKey('ARROW_RIGHT')
    release()
    await screen.settle()

    expect(probe.saved.map(config => config.dirLength)).toEqual([2])
  })

  test('Enter on Name depth opens no editor', async () => {
    screen = await renderSessionScreen({ width: 100, height: 28 })
    await openSettings(screen)
    await screen.replaceQuery('Name depth')
    await screen.pressKey('RETURN')

    const frame = await screen.frame()
    expect(frame).toContain('┌─ Settings')
    expect(frame).not.toContain('Edit value')
  })

  test('applying an unchanged value saves nothing and says nothing', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await openSettings(screen)
    await screen.replaceQuery('Startup')
    await screen.pressKey('RETURN')
    await screen.pressKey('RETURN')
    await screen.settle()

    const frame = await screen.frame()
    expect(probe.saved).toEqual([])
    expect(frame).not.toContain('updated')
    expect(frame).toContain('┌─ Settings')
  })
})

// The highlighted Settings row; the main list's own highlighted row sits outside the dialog.
async function selectedSetting(fixture: Screen): Promise<string> {
  const rows = await selectedRows(fixture)
  const row = rows.at(-1)

  if (row === undefined) throw new Error('No Settings row is highlighted')

  return row.trim()
}

async function searchSettings(fixture: Screen, query: string): Promise<void> {
  await openSettings(fixture)
  await fixture.replaceQuery(query)
  await fixture.settle()
}

describe('Settings list', () => {
  test('groups settings under category headers with one description line', async () => {
    screen = await renderSessionScreen({ width: 100, height: 28 })
    await openSettings(screen)

    const top = withoutSideBorders(await screen.frame())

    const order = ['Appearance', 'Keys', 'Sessions', 'Launch'].map(header =>
      top.indexOf(` ${header} `)
    )

    expect(order.every(index => index > 0)).toBe(true)
    expect([...order].sort((left, right) => left - right)).toEqual(order)
    expect(top).toContain('Colors for every screen; System follows Omarchy or the terminal')
    expect(top).not.toContain('Search for a setting')
    expect(top).not.toContain('Catppuccin (dark)')
    const rows = await screen.frame()
    expect(rows).toMatch(/│   Theme +Catppuccin ↵  │/)
    expect(rows).toMatch(/│   Color scheme +dark    │/)
    expect(rows).toMatch(/│   Name depth +1 · mux-sesh    │/)

    for (let press = 0; press < 19; press++) await screen.pressKey('ARROW_DOWN')

    const bottom = withoutSideBorders(await screen.frame())
    expect(bottom.indexOf(' Projects ')).toBeGreaterThan(0)
    expect(bottom.indexOf(' General ')).toBeGreaterThan(bottom.indexOf(' Projects '))
    expect(await selectedSetting(screen)).toMatch(/^Search history +‹ on ›$/)
  })

  test('searching is one ranked list with the category in the description line', async () => {
    screen = await renderSessionScreen({ width: 100, height: 28 })
    await searchSettings(screen, 'colors')

    const frame = withoutSideBorders(await screen.frame())
    expect(await selectedSetting(screen)).toMatch(/^Theme +Catppuccin ↵$/)
    expect(frame).not.toMatch(/^ +Appearance +$/m)
    expect(frame).toMatch(/Appearance · \S/)

    await screen.replaceQuery('repos')
    await screen.settle()
    expect(await selectedSetting(screen)).toMatch(/^Clone folder +\S.* ↵$/)
  })

  test('the value is muted while it is the default', async () => {
    screen = await renderSessionScreen({ width: 100, height: 28 })
    await openSettings(screen)
    await screen.frame()

    const colors = screen.colors()
    const spans = screen.captureSpans().lines.flatMap(line => line.spans)
    const changed = spans.find(span => span.text.trim() === 'dark')
    const unchanged = spans.find(span => span.text.trim() === 'off ↵')

    if (!changed || !unchanged) throw new Error('Color scheme or Icons value was not rendered')
    expect(sameColor(changed.fg, colors.text)).toBe(true)
    expect(sameColor(unchanged.fg, colors.textMuted)).toBe(true)
  })
})

describe('Settings inline changes', () => {
  test('→ cycles Sort order in place and saves it', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await searchSettings(screen, 'Sort order')
    expect(await selectedSetting(screen)).toMatch(/^Sort order +‹ live first ›$/)

    await screen.pressKey('ARROW_RIGHT')
    await screen.settle()

    expect(probe.saved.map(config => config.sortOrder)).toEqual(['configured-first'])
    expect(await selectedSetting(screen)).toMatch(/^Sort order +‹ configured first ›$/)
    expect(await screen.frame()).toContain('Sort order updated')
  })

  test('Enter switches a two-value setting', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await searchSettings(screen, 'Keybind mode')
    expect(await screen.frame()).toContain('change ←/→/enter')

    await screen.pressKey('RETURN')
    await screen.settle()

    expect(probe.saved.map(config => config.keybindMode)).toEqual(['standard'])
  })

  test('←/→ on an open-only row changes nothing', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await searchSettings(screen, 'Theme')

    await screen.pressKey('ARROW_RIGHT')
    await screen.settle()

    expect(probe.saved).toEqual([])
    expect(await selectedSetting(screen)).toMatch(/^Theme +Catppuccin ↵$/)
  })

  test('ctrl+r restores the default and is offered only while the value differs', async () => {
    const probe = saveProbe()

    screen = await renderSessionScreen(
      { width: 100, height: 28 },
      { saveConfig: probe.save, config: { sortOrder: 'alphabetical' } }
    )

    await searchSettings(screen, 'Sort order')
    expect(await screen.frame()).toContain('reset ctrl+r')

    await screen.pressKey('r', { ctrl: true })
    await screen.settle()

    expect(probe.saved.map(config => config.sortOrder)).toEqual(['live-first'])
    expect(await selectedSetting(screen)).toMatch(/^Sort order +‹ live first ›$/)

    const reset = await screen.frame()
    expect(reset).toContain('Sort order reset')
    expect(reset).not.toContain('reset ctrl+r')

    await screen.pressKey('r', { ctrl: true })
    await screen.settle()
    expect(probe.saved).toHaveLength(1)
  })

  test('lists are never reset with one key', async () => {
    const probe = saveProbe()

    screen = await renderSessionScreen(
      { width: 100, height: 28 },
      { saveConfig: probe.save, config: { hiddenSessions: ['scratch-*'] } }
    )

    await searchSettings(screen, 'Hidden sessions')
    expect(await screen.frame()).not.toContain('reset ctrl+r')

    await screen.pressKey('r', { ctrl: true })
    await screen.settle()
    expect(probe.saved).toEqual([])
  })
})

describe('Settings returns to the same row', () => {
  test('Esc from a picker lands on the row that opened it', async () => {
    screen = await renderSessionScreen({ width: 100, height: 28 })
    await openSettings(screen)

    for (let press = 0; press < 5; press++) await screen.pressKey('ARROW_DOWN')
    expect(await selectedSetting(screen)).toMatch(/^Sort order/)

    await screen.pressKey('RETURN')
    expect(await screen.frame()).toContain('┌─ Sort order')

    await screen.pressKey('ESCAPE')
    expect(await screen.frame()).toContain('┌─ Settings')
    expect(await selectedSetting(screen)).toMatch(/^Sort order/)
  })

  test('applying an edit returns to its row and keeps the filter', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await searchSettings(screen, 'command')
    await screen.pressKey('ARROW_DOWN')
    expect(await selectedSetting(screen)).toMatch(/^Preview command/)

    await screen.pressKey('RETURN')
    await screen.replaceQuery('eza {}')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(probe.saved.map(config => config.defaultSession?.previewCommand)).toEqual(['eza {}'])
    expect(await selectedSetting(screen)).toMatch(/^Preview command +eza \{\} ↵$/)
    expect(focusedQuery(screen)).toBe('command')
  })
})

describe('Settings Escape', () => {
  test('Esc clears the query first, then closes', async () => {
    screen = await renderSessionScreen({ width: 100, height: 28 })
    await searchSettings(screen, 'zoxide')

    await screen.pressKey('ESCAPE')
    await screen.settle()

    const cleared = await screen.frame()
    expect(cleared).toContain('┌─ Settings')
    expect(cleared).toContain('Search settings')
    expect(focusedQuery(screen)).toBe('')

    await screen.pressKey('ESCAPE')
    expect(await screen.frame()).not.toContain('┌─ Settings')
  })
})
