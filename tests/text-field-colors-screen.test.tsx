import { afterEach, describe, expect, test } from 'bun:test'
import { RGBA, TextareaRenderable } from '@opentui/core'
import { resolveTheme } from '../src/styles/theme'
import type { ThemeColors, ThemeColorScheme } from '../src/styles/theme-model'
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

interface ThemeCase {
  theme: string
  colorScheme: ThemeColorScheme
}

const THEMES: ThemeCase[] = [
  { theme: 'github', colorScheme: 'light' },
  { theme: 'catppuccin', colorScheme: 'dark' },
]

function ints(color: RGBA | undefined): number[] | undefined {
  return color?.toInts()
}

function focusedTextarea(fixture: Screen): TextareaRenderable {
  const focused = fixture.renderer.currentFocusedRenderable

  if (!(focused instanceof TextareaRenderable)) {
    throw new Error('Expected a focused textarea, but no text field owns focus')
  }

  return focused
}

// The field and the terminal cursor it pushes both follow the theme the screen is painted with.
async function expectThemedField(fixture: Screen, colors: ThemeColors): Promise<void> {
  await fixture.frame()
  const field = focusedTextarea(fixture)

  expect({
    cursor: ints(field.cursorColor),
    selectionBg: ints(field.selectionBg),
    selectionFg: ints(field.selectionFg),
    terminalCursor: ints(fixture.renderer.getCursorState().color),
  }).toEqual({
    cursor: RGBA.fromHex(colors.text).toInts(),
    selectionBg: RGBA.fromHex(colors.selection).toInts(),
    selectionFg: RGBA.fromHex(colors.selectionText).toInts(),
    terminalCursor: RGBA.fromHex(colors.text).toInts(),
  })
}

async function runPaletteCommand(fixture: Screen, title: string): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery(title)
  await fixture.pressKey('RETURN')
}

async function renderThemed({ theme, colorScheme }: ThemeCase): Promise<Screen> {
  return renderSessionScreen({ width: 120, height: 36 }, { theme, config: { colorScheme } })
}

describe('text fields take the theme cursor and selection colours', () => {
  test.each(THEMES)('$theme $colorScheme main search', async themeCase => {
    screen = await renderThemed(themeCase)
    await screen.pressKey('i')

    await expectThemedField(screen, resolveTheme(themeCase.theme, {}, themeCase.colorScheme).colors)
  })

  test.each(THEMES)('$theme $colorScheme dialog filter', async themeCase => {
    screen = await renderThemed(themeCase)
    await screen.pressKey('p', { ctrl: true })

    await expectThemedField(screen, resolveTheme(themeCase.theme, {}, themeCase.colorScheme).colors)
  })

  test.each(THEMES)('$theme $colorScheme setting editor', async themeCase => {
    screen = await renderThemed(themeCase)
    await runPaletteCommand(screen, 'Open settings')
    await screen.replaceQuery('Editor Command')
    await screen.pressKey('RETURN')
    expect(await screen.frame()).toContain('Edit value and press Enter')

    await expectThemedField(screen, resolveTheme(themeCase.theme, {}, themeCase.colorScheme).colors)
  })

  test('the theme picker filter follows the previewed theme', async () => {
    screen = await renderThemed({ theme: 'github', colorScheme: 'light' })
    await runPaletteCommand(screen, 'Themes')
    await screen.replaceQuery('nord')

    const nord = resolveTheme('nord', {}, 'light').colors
    expect(screen.colors()).toEqual(nord)
    await expectThemedField(screen, nord)
  })
})
