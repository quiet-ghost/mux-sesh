import { afterEach, describe, expect, test } from 'bun:test'
import { RGBA, type TerminalColors } from '@opentui/core'
import { resolveTheme } from '../src/styles/theme'
import { terminalColorsToPalette } from '../src/styles/terminal-palette'
import type { Config, ThemeColors } from '../src/types'
import { renderSessionScreen } from './fixtures/session-screen'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

const PICKER = 'Select an option to apply it immediately'

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.defects).toEqual([])
})

function colorsOf(themeId: string): ThemeColors {
  return resolveTheme(themeId, {}, 'dark').colors
}

function systemColors(colors: TerminalColors | null): ThemeColors {
  return resolveTheme('system', {}, 'dark', {
    homeDir: '/fixture',
    terminalPalette: colors ? terminalColorsToPalette(colors) : null,
  }).colors
}

function sameColor(left: RGBA, right: RGBA): boolean {
  return left.toInts().every((channel, index) => channel === right.toInts()[index])
}

async function highlightedRows(fixture: Screen, colors: ThemeColors): Promise<string[]> {
  await fixture.frame()
  const selection = RGBA.fromHex(colors.selection)

  return fixture
    .captureSpans()
    .lines.filter(line =>
      line.spans.some(span => span.text.trim().length > 0 && sameColor(span.bg, selection))
    )
    .map(line => line.spans.map(span => span.text).join(''))
}

// The highlighted option is painted with the previewed theme, so one row proves both agree.
async function expectPreview(fixture: Screen, colors: ThemeColors, label: string): Promise<void> {
  const rows = await highlightedRows(fixture, colors)

  expect(rows).toHaveLength(1)
  expect(rows[0]).toContain(label)
}

async function expectScreenPainted(fixture: Screen, colors: ThemeColors): Promise<void> {
  await fixture.frame()

  const title = fixture
    .captureSpans()
    .lines.flatMap(line => line.spans)
    .find(span => span.text.includes('mux-sesh'))

  if (!title) throw new Error('Session screen title was not rendered')
  expect(title.bg.toInts()).toEqual(RGBA.fromHex(colors.surface).toInts())
  expect(title.fg.toInts()).toEqual(RGBA.fromHex(colors.text).toInts())
}

async function openThemesFromPalette(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('Themes')
  await fixture.pressKey('RETURN')
}

async function openThemesFromSettings(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('Open settings')
  await fixture.pressKey('RETURN')
  await fixture.replaceQuery('Theme')
  await fixture.pressKey('RETURN')
}

function terminalColors(background: string, foreground: string): TerminalColors {
  return {
    palette: [
      background,
      '#cc3333',
      '#33cc33',
      '#cccc33',
      '#3333cc',
      '#cc33cc',
      '#33cccc',
      foreground,
    ],
    defaultForeground: foreground,
    defaultBackground: background,
    cursorColor: foreground,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
  }
}

interface SaveProbe {
  saved: Config[]
  save: (config: Config) => Promise<void>
  failWith: (reason: string | null) => void
  hold: () => () => void
}

function saveProbe(): SaveProbe {
  const saved: Config[] = []
  let failure: string | null = null
  let held: Promise<void> | null = null

  return {
    saved,
    save: async config => {
      if (held) await held

      if (failure) throw new Error(failure)
      saved.push(config)
    },
    failWith: reason => {
      failure = reason
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

describe('theme picker preview', () => {
  test('opens on the saved theme and keeps navigation, filtering, and preview together', async () => {
    screen = await renderSessionScreen({ width: 80, height: 24 })
    await openThemesFromPalette(screen)
    await expectPreview(screen, colorsOf('catppuccin'), 'Catppuccin')

    await screen.pressKey('ARROW_DOWN')
    await expectPreview(screen, colorsOf('catppuccin-frappe'), 'Catppuccin Frappe')

    await screen.replaceQuery('nord')
    await expectPreview(screen, colorsOf('nord'), 'Nord')

    await screen.replaceQuery('o')
    await expectPreview(screen, colorsOf('nord'), 'Nord')

    // Filtered options are ranked best match first; `Shades of Purple` ranks just above `Nord`.
    await screen.pressKey('ARROW_UP')
    const [upRow] = await highlightedRows(screen, colorsOf('shadesofpurple'))
    expect(upRow).toContain('Shades of Purple')
  })

  test('Escape from the palette restores the saved theme on the main screen', async () => {
    screen = await renderSessionScreen({ width: 80, height: 24 })
    await openThemesFromPalette(screen)
    await screen.replaceQuery('nord')
    await expectPreview(screen, colorsOf('nord'), 'Nord')

    await screen.pressKey('ESCAPE')

    const frame = await screen.frame()
    expect(frame).not.toContain(PICKER)
    expect(frame).not.toContain('Search settings')
    await expectScreenPainted(screen, colorsOf('catppuccin'))
  })

  test('Escape from Settings restores the saved theme and returns to Settings', async () => {
    screen = await renderSessionScreen({ width: 80, height: 24 })
    await openThemesFromSettings(screen)
    await screen.pressKey('ARROW_DOWN')
    await expectPreview(screen, colorsOf('catppuccin-frappe'), 'Catppuccin Frappe')

    await screen.pressKey('ESCAPE')

    expect(await screen.frame()).toContain('Settings')
    await expectPreview(screen, colorsOf('catppuccin'), 'Theme')
  })

  test('a System preview follows terminal palette events and Escape restores the saved theme', async () => {
    screen = await renderSessionScreen({ width: 80, height: 24 }, { theme: 'gruvbox' })
    await openThemesFromPalette(screen)
    await screen.replaceQuery('system')
    await screen.settle()
    await expectPreview(screen, systemColors(null), 'System')

    const first = terminalColors('#101820', '#e0e8f0')
    await screen.emitPalette(first)
    await expectPreview(screen, systemColors(first), 'System')

    const second = terminalColors('#f4f0e8', '#202020')
    await screen.emitPalette(second)
    await expectPreview(screen, systemColors(second), 'System')

    await screen.pressKey('ESCAPE')
    expect(await screen.frame()).not.toContain(PICKER)
    await expectScreenPainted(screen, colorsOf('gruvbox'))
  })
})

describe('theme picker save', () => {
  test('a failed save keeps the unsaved preview, says so, and retries', async () => {
    const probe = saveProbe()
    probe.failWith('EACCES: permission denied')
    screen = await renderSessionScreen({ width: 80, height: 24 }, { saveConfig: probe.save })
    await openThemesFromPalette(screen)
    await screen.replaceQuery('nord')

    await screen.pressKey('RETURN')
    await screen.settle()

    const failed = await screen.frame()
    expect(failed).toContain(PICKER)
    expect(failed).toContain('permission denied')
    expect(failed).toContain('Nord is still unsaved')
    expect(failed).not.toContain('Theme updated')
    expect(probe.saved).toEqual([])
    await expectPreview(screen, colorsOf('nord'), 'Nord')

    probe.failWith(null)
    await screen.pressKey('RETURN')
    await screen.settle()

    const saved = await screen.frame()
    expect(saved).not.toContain('unsaved')
    expect(probe.saved.map(config => config.theme)).toEqual(['nord'])
    await expectPreview(screen, colorsOf('nord'), 'Nord')

    await screen.pressKey('ESCAPE')
    await expectScreenPainted(screen, colorsOf('nord'))
    expect(await screen.frame()).toContain('Theme updated')
  })

  test('a failed save then Escape restores the saved theme', async () => {
    const probe = saveProbe()
    probe.failWith('disk full')
    screen = await renderSessionScreen({ width: 80, height: 24 }, { saveConfig: probe.save })
    await openThemesFromPalette(screen)
    await screen.replaceQuery('nord')
    await screen.pressKey('RETURN')
    await screen.settle()

    await screen.pressKey('ESCAPE')

    expect(await screen.frame()).not.toContain(PICKER)
    await expectScreenPainted(screen, colorsOf('catppuccin'))
  })

  test('the preview stays while a save is still running', async () => {
    const probe = saveProbe()
    const release = probe.hold()
    screen = await renderSessionScreen({ width: 80, height: 24 }, { saveConfig: probe.save })
    await openThemesFromPalette(screen)
    await screen.replaceQuery('nord')

    await screen.pressKey('RETURN')
    await screen.settle()

    expect(await screen.frame()).toContain('Saving Nord')
    await expectPreview(screen, colorsOf('nord'), 'Nord')

    await screen.pressKey('RETURN')
    release()
    await screen.settle()

    expect(probe.saved.map(config => config.theme)).toEqual(['nord'])
    expect(await screen.frame()).not.toContain('Saving Nord')
    await expectPreview(screen, colorsOf('nord'), 'Nord')
  })
})
