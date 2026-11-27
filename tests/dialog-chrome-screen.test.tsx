import { afterEach, describe, expect, test } from 'bun:test'
import { TextAttributes } from '@opentui/core'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { resolveTheme } from '../src/styles/theme'
import type { ThemeColors } from '../src/types'
import { renderSessionScreen } from './fixtures/session-screen'
import { cellsOf, contrastRatio, sameColor, type Cell } from './fixtures/selection'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

const WIDTH = 110
const HEIGHT = 30
const INSET = 2

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.defects).toEqual([])
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

const THEMES = [
  { theme: 'github', colorScheme: 'light' as const },
  { theme: 'rosepine', colorScheme: 'dark' as const },
]

function colorsOf(theme: string, colorScheme: 'light' | 'dark'): ThemeColors {
  return resolveTheme(theme, {}, colorScheme).colors
}

function textOf(row: Cell[]): string {
  return row.map(cell => cell.char).join('')
}

async function capture(fixture: Screen): Promise<Cell[][]> {
  await fixture.frame()

  return fixture.captureSpans().lines.map(cellsOf)
}

function rowWith(rows: Cell[][], text: string, from = 0): number {
  const index = rows.findIndex((row, at) => at >= from && textOf(row).includes(text))

  if (index < 0) throw new Error(`No rendered row contains ${text}`)

  return index
}

function rowAt(rows: Cell[][], index: number): Cell[] {
  const row = rows[index]

  if (!row) throw new Error(`Row ${index} was not rendered`)

  return row
}

function cellAt(row: Cell[], column: number): Cell {
  const cell = row[column]

  if (!cell) throw new Error(`Column ${column} was not rendered`)

  return cell
}

interface Dialog {
  rows: Cell[][]
  titleRow: number
  footerRow: number
  left: number
  right: number
}

// The dialog spans the modal-colored cells of its title row; the footer is the row holding hint.
async function dialogOf(
  fixture: Screen,
  colors: ThemeColors,
  title: string,
  hint: string
): Promise<Dialog> {
  const rows = await capture(fixture)
  const titleRow = rowWith(rows, title)
  const header = rowAt(rows, titleRow)
  const left = header.findIndex(cell => sameColor(cell.bg, colors.surfaceModal))
  const right = header.findLastIndex(cell => sameColor(cell.bg, colors.surfaceModal))
  const footerRow = rowWith(rows, hint, titleRow)

  return { rows, titleRow, footerRow, left, right }
}

function inner(dialog: Dialog, index: number): string {
  return textOf(rowAt(dialog.rows, index).slice(dialog.left, dialog.right + 1))
}

function expectHeader(dialog: Dialog, colors: ThemeColors, title: string): void {
  const header = rowAt(dialog.rows, dialog.titleRow)
  const text = textOf(header)
  const titleColumn = text.indexOf(title)
  const escColumn = text.lastIndexOf('esc')

  expect(titleColumn).toBe(dialog.left + INSET)
  expect(escColumn + 'esc'.length - 1).toBe(dialog.right - INSET)
  expect(sameColor(cellAt(header, titleColumn).fg, colors.text)).toBe(true)
  expect(sameColor(cellAt(header, escColumn).fg, colors.textMuted)).toBe(true)
}

// The band runs edge to edge in the raised color; each label is text-colored and its key muted.
function expectFooter(
  dialog: Dialog,
  colors: ThemeColors,
  hints: ReadonlyArray<readonly [string, string]>
): void {
  const footer = rowAt(dialog.rows, dialog.footerRow)
  const band = footer.slice(dialog.left, dialog.right + 1)
  const text = textOf(footer)

  expect(band.every(cell => sameColor(cell.bg, colors.surfaceAlt))).toBe(true)
  expect(text.indexOf(hints[0]?.[0] ?? '')).toBe(dialog.left + INSET)
  expect(text).toContain(hints.map(([label, key]) => `${label} ${key}`).join('  '))

  for (const [label, key] of hints) {
    const at = text.indexOf(`${label} ${key}`)

    expect(sameColor(cellAt(footer, at).fg, colors.text)).toBe(true)
    expect(sameColor(cellAt(footer, at + label.length + 1).fg, colors.textMuted)).toBe(true)
  }

  // One blank dialog row separates the body from the band, and the band is the last dialog row.
  expect(inner(dialog, dialog.footerRow - 1).trim()).toBe('')

  const below = rowAt(dialog.rows, dialog.footerRow + 1)
  expect(
    below.slice(dialog.left, dialog.right + 1).some(cell => sameColor(cell.bg, colors.surfaceModal))
  ).toBe(false)
}

function workspace(id: string, title: string, extra: Partial<LiveWorkspace> = {}): LiveWorkspace {
  return {
    backend: 'tmux',
    id,
    title,
    path: `/fixture/${title}`,
    isActive: false,
    unitCount: 1,
    ...extra,
  }
}

function unsupported(): never {
  throw new Error('The dialog-chrome backend does not implement that operation')
}

const closingBackend: MultiplexerBackend = {
  kind: 'tmux',
  capabilities: { previousWorkspace: true },
  async list() {
    return [workspace('$1', 'alpha', { isActive: true }), workspace('$2', 'beta')]
  },
  async details(target) {
    return { workspace: target, isActive: false, unitLabel: 'Windows', units: [], agents: [] }
  },
  async open() {
    return { kind: 'focused' }
  },
  async current() {
    return undefined
  },
  async close() {},
  openOrCreate: unsupported,
  create: unsupported,
  start: unsupported,
  rename: unsupported,
  directory: unsupported,
  openEditor: unsupported,
}

describe('shared dialog chrome', () => {
  test.each(THEMES)(
    'Commands has the shared header, gaps, muted bold sections and footer band ($theme $colorScheme)',
    async ({ theme, colorScheme }) => {
      const colors = colorsOf(theme, colorScheme)
      screen = await renderSessionScreen(
        { width: WIDTH, height: HEIGHT },
        { theme, config: { colorScheme } }
      )
      await screen.pressKey('p', { ctrl: true })

      const dialog = await dialogOf(screen, colors, 'Commands', 'navigate ↑/↓')
      expectHeader(dialog, colors, 'Commands')

      // The description sits right under the title, then one blank row opens the body.
      const description = rowAt(dialog.rows, dialog.titleRow + 1)
      const descriptionColumn = textOf(description).indexOf(theme)
      expect(descriptionColumn).toBe(dialog.left + INSET)
      expect(sameColor(cellAt(description, descriptionColumn).fg, colors.textMuted)).toBe(true)
      expect(inner(dialog, dialog.titleRow + 2).trim()).toBe('')
      expect(inner(dialog, dialog.titleRow + 3)).toContain('Search')

      const sectionRow = rowAt(dialog.rows, rowWith(dialog.rows, 'Direct', dialog.titleRow))
      const section = cellAt(sectionRow, textOf(sectionRow).indexOf('Direct'))
      expect(sameColor(section.fg, colors.textMuted)).toBe(true)
      expect(section.attributes & TextAttributes.BOLD).toBe(TextAttributes.BOLD)

      expectFooter(dialog, colors, [
        ['navigate', '↑/↓'],
        ['run', 'enter'],
        ['close', 'esc'],
      ])

      // Hint labels meet WCAG AA on the raised band in both a light and a dark theme.
      expect(contrastRatio(colors.text, colors.surfaceAlt)).toBeGreaterThanOrEqual(4.5)
      // Muted keys lose under a tenth of the contrast muted text has on the dialog body.
      expect(contrastRatio(colors.textMuted, colors.surfaceAlt)).toBeGreaterThanOrEqual(
        0.9 * contrastRatio(colors.textMuted, colors.surfaceModal)
      )
    }
  )

  test.each([18, 24, 30, 36])(
    'Commands never ends its window on a section header at height %i',
    async height => {
      const colors = colorsOf('catppuccin', 'dark')
      screen = await renderSessionScreen({ width: WIDTH, height })
      await screen.pressKey('p', { ctrl: true })

      const dialog = await dialogOf(screen, colors, 'Commands', 'navigate ↑/↓')
      const last = inner(dialog, dialog.footerRow - 2).trim()

      expect(last).not.toBe('')
      expect(['Direct', 'Prefix ctrl+x']).not.toContain(last)
    }
  )

  test('the theme picker marks the saved theme with a dot that stays while previewing', async () => {
    const colors = colorsOf('catppuccin', 'dark')
    screen = await renderSessionScreen({ width: WIDTH, height: HEIGHT }, { workspaces: [] })
    await screen.pressKey('p', { ctrl: true })
    await screen.replaceQuery('Themes')
    await screen.pressKey('RETURN')

    const opened = await dialogOf(screen, colors, 'Theme', 'navigate ↑/↓')
    expectHeader(opened, colors, 'Theme')
    expectFooter(opened, colors, [
      ['navigate', '↑/↓'],
      ['apply', 'enter'],
      ['back', 'esc'],
    ])

    const frame = await screen.frame()
    expect(frame.match(/●/g)).toHaveLength(1)
    expect(frame).toMatch(/┃● Catppuccin\s{2,}catppuccin /)

    await screen.pressKey('ARROW_DOWN')
    const previewing = await screen.frame()
    expect(previewing.match(/●/g)).toHaveLength(1)
    expect(previewing).toMatch(/ ● Catppuccin\s{2,}catppuccin /)
    expect(previewing).toMatch(/┃ {2}Catppuccin Frappe/)

    // The dot is painted in the accent, and on the highlight it takes the highlight's text color.
    const preview = colorsOf('catppuccin-frappe', 'dark')
    const rows = await capture(screen)
    const saved = rowAt(rows, rowWith(rows, '● Catppuccin '))
    expect(sameColor(cellAt(saved, textOf(saved).indexOf('●')).fg, preview.primary)).toBe(true)
  })

  test('close review, batch review and receipt share the footer band', async () => {
    const colors = colorsOf('catppuccin', 'dark')
    screen = await renderSessionScreen(
      { width: WIDTH, height: HEIGHT },
      { workspaces: [], backend: closingBackend }
    )
    await screen.settle()
    await screen.pressKey('j')
    await screen.pressKey('d')

    const review = await dialogOf(screen, colors, "Close tmux session 'beta'?", 'close enter')
    expectHeader(review, colors, "Close tmux session 'beta'?")
    expect(inner(review, review.titleRow + 1).trim()).toBe('/fixture/beta')
    expectFooter(review, colors, [
      ['close', 'enter'],
      ['keep', 'esc'],
    ])

    await screen.pressKey('ESCAPE')
    await screen.pressKey('m')
    await screen.pressKey('d')

    const batch = await dialogOf(screen, colors, 'Close 1 marked tmux session?', 'close 1 enter')
    expectHeader(batch, colors, 'Close 1 marked tmux session?')
    expectFooter(batch, colors, [
      ['close 1', 'enter'],
      ['keep', 'esc'],
    ])
  })

  test('the rename dialog shares the chrome', async () => {
    const colors = colorsOf('catppuccin', 'dark')
    screen = await renderSessionScreen(
      { width: WIDTH, height: HEIGHT },
      { workspaces: [workspace('$1', 'alpha')] }
    )
    await screen.pressKey('x', { ctrl: true })
    await screen.pressKey('r')

    const rename = await dialogOf(screen, colors, 'Rename Session', 'apply enter')
    expectHeader(rename, colors, 'Rename Session')
    expectFooter(rename, colors, [
      ['apply', 'enter'],
      ['cancel', 'esc'],
    ])
  })
})
