import { afterEach, describe, expect, test } from 'bun:test'
import { RGBA } from '@opentui/core'
import { resolveTheme } from '../src/styles/theme'
import { renderSessionScreen } from './fixtures/session-screen'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.renderer.isDestroyed).toBe(true)
})

function sameColor(left: RGBA, right: RGBA): boolean {
  return left.toInts().every((channel, index) => channel === right.toInts()[index])
}

function rowsWithBackground(fixture: Screen, color: string): string[] {
  const background = RGBA.fromHex(color)

  return fixture
    .captureSpans()
    .lines.filter(line =>
      line.spans.some(span => span.text.trim().length > 0 && sameColor(span.bg, background))
    )
    .map(line => line.spans.map(span => span.text).join(''))
}

async function highlightedRows(fixture: Screen, themeId: string): Promise<string[]> {
  await fixture.frame()

  return rowsWithBackground(fixture, resolveTheme(themeId, {}, 'dark').colors.selection)
}

async function expectHighlighted(fixture: Screen, themeId: string, text: string): Promise<void> {
  const rows = await highlightedRows(fixture, themeId)

  expect(rows).toHaveLength(1)
  expect(rows[0]).toContain(text)
}

async function dialogBounds(fixture: Screen, themeId: string, title: string) {
  await fixture.frame()
  const modal = RGBA.fromHex(resolveTheme(themeId, {}, 'dark').colors.surfaceModal)

  const line = fixture
    .captureSpans()
    .lines.find(row => row.spans.some(span => span.text.includes(title)))

  if (!line) throw new Error(`Dialog title ${title} was not rendered`)

  let column = 0
  let left = -1
  let right = -1

  for (const span of line.spans) {
    if (sameColor(span.bg, modal)) {
      if (left < 0) left = column
      right = column + span.width
    }

    column += span.width
  }

  return { left, right }
}

async function expectDialogFits(
  fixture: Screen,
  title: string,
  placeholderOrQuery: string,
  hint: string
) {
  const lines = (await fixture.frame()).split('\n')
  const titleRow = lines.findIndex(line => line.includes(title) && line.includes('esc'))

  const inputRow = lines.findIndex(
    (line, index) => index > titleRow && line.includes(placeholderOrQuery)
  )

  const hintRow = lines.findIndex(line => line.includes(hint))

  expect(titleRow).toBeGreaterThanOrEqual(0)
  expect(inputRow).toBeGreaterThan(titleRow)
  expect(hintRow).toBeGreaterThan(inputRow)
}

async function openCommands(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
}

async function openThemes(fixture: Screen): Promise<void> {
  await openCommands(fixture)
  await fixture.replaceQuery('Themes')
  await fixture.pressKey('RETURN')
}

async function pressDown(fixture: Screen, times: number): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await fixture.pressKey('ARROW_DOWN')
  }
}

const COMMAND_HINT = '↑/↓ navigate  enter run  esc close'
const THEME_HINT = '↑/↓ navigate  enter apply  esc back'
const SETTINGS_HINT = '↑/↓ navigate  enter open  esc close'

describe('searchable dialog viewports', () => {
  test.each([
    [60, 18],
    [80, 24],
    [120, 36],
  ] as const)('Commands, Settings, and Themes fit a %ix%i terminal', async (width, height) => {
    screen = await renderSessionScreen({ width, height })

    await openCommands(screen)
    await expectDialogFits(screen, 'Commands', 'Search', COMMAND_HINT)

    await screen.replaceQuery('Open settings')
    await screen.pressKey('RETURN')
    await expectDialogFits(screen, 'Settings', 'Search settings', SETTINGS_HINT)
    await screen.pressKey('ESCAPE')

    await openThemes(screen)
    await expectDialogFits(screen, 'Theme', 'Filter options', THEME_HINT)
  })

  test.each(['vim', 'standard'] as const)(
    'Commands scroll to reveal items past the window in %s mode',
    async keybindMode => {
      screen = await renderSessionScreen({ width: 60, height: 18 }, { keybindMode })
      await openCommands(screen)

      await pressDown(screen, 12)
      await expectHighlighted(screen, 'catppuccin', 'Refresh')
      await expectDialogFits(screen, 'Commands', 'Search', COMMAND_HINT)

      await screen.pressKey('ARROW_UP')
      await expectHighlighted(screen, 'catppuccin', 'Root session')

      for (let index = 0; index < 12; index += 1) await screen.pressKey('ARROW_UP')
      await expectHighlighted(screen, 'catppuccin', 'Search')
      await expectDialogFits(screen, 'Commands', 'Search', COMMAND_HINT)
    }
  )

  test('every theme option is reachable by keyboard with one highlight', async () => {
    screen = await renderSessionScreen({ width: 60, height: 18 })
    await openThemes(screen)

    await pressDown(screen, 40)
    await expectHighlighted(screen, 'zenburn', 'Zenburn')
    await expectDialogFits(screen, 'Theme', 'Filter options', THEME_HINT)
  })

  test('filtering keeps the selected theme when it still matches', async () => {
    screen = await renderSessionScreen({ width: 60, height: 18 })
    await openThemes(screen)
    await pressDown(screen, 9)
    await expectHighlighted(screen, 'gruvbox', 'Gruvbox')

    await screen.replaceQuery('o')
    await expectHighlighted(screen, 'gruvbox', 'Gruvbox')
    await expectDialogFits(screen, 'Theme', 'o', THEME_HINT)

    await screen.replaceQuery('nord')
    await expectHighlighted(screen, 'nord', 'Nord')

    await screen.pressKey('ARROW_DOWN')
    await expectHighlighted(screen, 'nord', 'Nord')
  })

  test.each(['vim', 'standard'] as const)(
    'typing in the focused theme filter in %s mode selects and shows the match',
    async keybindMode => {
      screen = await renderSessionScreen({ width: 60, height: 18 }, { keybindMode })
      await openThemes(screen)
      await pressDown(screen, 24)
      await expectHighlighted(screen, 'palenight', 'Palenight')

      await screen.typeText('nord')
      await expectHighlighted(screen, 'nord', 'Nord')
      await expectDialogFits(screen, 'Theme', 'nord', THEME_HINT)
    }
  )

  test('filtering Commands keeps the selected command when it still matches', async () => {
    screen = await renderSessionScreen({ width: 60, height: 18 })
    await openCommands(screen)
    await pressDown(screen, 11)
    await expectHighlighted(screen, 'catppuccin', 'Root session')

    await screen.replaceQuery('session')
    await expectHighlighted(screen, 'catppuccin', 'Root session')

    await screen.replaceQuery('theme')
    await expectHighlighted(screen, 'catppuccin', 'Themes')
  })

  test('resizing keeps a low selected theme selected and visible', async () => {
    screen = await renderSessionScreen({ width: 120, height: 36 })
    await openThemes(screen)
    await pressDown(screen, 27)
    await expectHighlighted(screen, 'synthwave84', "Synthwave '84")
    await expectDialogFits(screen, 'Theme', 'Filter options', THEME_HINT)

    await screen.resize(60, 18)
    await expectHighlighted(screen, 'synthwave84', "Synthwave '84")
    await expectDialogFits(screen, 'Theme', 'Filter options', THEME_HINT)
  })

  test.each([60, 40] as const)('dialogs stay inside a %i-column terminal', async width => {
    screen = await renderSessionScreen({ width, height: 18 })
    await openCommands(screen)

    const bounds = await dialogBounds(screen, 'catppuccin', 'Commands')
    expect(bounds.left).toBeGreaterThan(0)
    expect(bounds.right).toBeLessThan(width)
    await expectDialogFits(screen, 'Commands', 'Search', '↑/↓ navigate')
  })
})
