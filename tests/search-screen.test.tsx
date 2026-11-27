import { afterEach, describe, expect, test } from 'bun:test'
import { TextareaRenderable, TextAttributes } from '@opentui/core'
import type { LiveWorkspace } from '../src/multiplexer'
import { resolveTheme } from '../src/styles/theme'
import type { KeybindMode, ThemeColors } from '../src/types'
import { renderSessionScreen } from './fixtures/session-screen'
import { cellsOf, sameColor, SELECTION_BAR, selectedLines, type Cell } from './fixtures/selection'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

const WIDTH = 100
const HEIGHT = 24
const HOME = process.env.HOME ?? ''

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.defects).toEqual([])
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

function workspace(id: string, title: string, path: string, extra: Partial<LiveWorkspace> = {}) {
  const value: LiveWorkspace = {
    backend: 'tmux',
    id,
    title,
    path,
    isActive: false,
    unitCount: 1,
    ...extra,
  }

  return value
}

const workspaces: LiveWorkspace[] = [
  workspace('$1', 'api-gateway', `${HOME}/dev/api-gateway`, { isActive: true }),
  workspace('$2', 'blog', `${HOME}/dev/blog`),
  workspace('$3', 'mux-sesh', `${HOME}/dev/worktrees/projects/an-extremely-long-parent/mux-sesh`),
  workspace('$4', 'dotfiles', `${HOME}/.dotfiles`),
  workspace('$5', 'notes', `${HOME}/notes`),
  workspace('$6', 'infra', `${HOME}/dev/infra`),
  workspace('$7', 'mixer', `${HOME}/dev/mixer`),
]

const colors: ThemeColors = resolveTheme('catppuccin', {}, 'dark').colors

async function openSearch(keybindMode: KeybindMode = 'vim'): Promise<Screen> {
  const fixture = await renderSessionScreen(
    { width: WIDTH, height: HEIGHT },
    { workspaces, keybindMode }
  )

  if (keybindMode === 'vim') await fixture.pressKey('i')

  return fixture
}

function lines(frame: string): string[] {
  return frame.split('\n')
}

function textOf(row: Cell[]): string {
  return row.map(cell => cell.char).join('')
}

async function rowCells(fixture: Screen, text: string): Promise<Cell[]> {
  await fixture.frame()

  const row = fixture
    .captureSpans()
    .lines.map(cellsOf)
    .find(cells => textOf(cells).includes(text))

  if (!row) throw new Error(`No rendered row contains ${text}`)

  return row
}

function cellsFor(row: Cell[], text: string): Cell[] {
  const at = textOf(row).indexOf(text)

  if (at < 0) throw new Error(`The row does not contain ${text}`)

  return row.slice(at, at + text.length)
}

function underlined(cells: Cell[]): boolean[] {
  return cells.map(cell => (cell.attributes & TextAttributes.UNDERLINE) !== 0)
}

describe('search results use the main list rows', () => {
  test('rows keep the status, icon, aligned title column and no unit-count suffix', async () => {
    screen = await openSearch()
    const frame = await screen.frame()

    expect(frame).not.toContain('(1)')
    expect(frame).toMatch(/┃ {2}○ dotfiles {5}~/)
    expect(frame).toMatch(/^ {4}● api-gateway {2}dev/m)
    expect(frame).toMatch(/^ {4}○ blog {9}dev/m)
    // Flat: no section headers while searching.
    expect(frame).not.toMatch(/^ (Pinned|Configured|Live)\s*$/m)
  })

  test('a query shows one flat best-first list in the same rows', async () => {
    screen = await openSearch()
    await screen.replaceQuery('mx')
    const frame = await screen.frame()

    expect(selectedLines(frame)).toHaveLength(1)
    expect(frame).toMatch(/┃ {2}○ mixer {5}dev/)
    expect(frame).toMatch(/^ {4}○ mux-sesh {2}an-extremely-long-parent/m)
  })

  test('arrow keys follow screen order', async () => {
    screen = await openSearch()
    await screen.replaceQuery('dev')
    const before = lines(await screen.frame()).filter(line => / [●○] /.test(line))

    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('ARROW_DOWN')
    const after = lines(await screen.frame())
    const selected = selectedLines(after.join('\n'))

    expect(selected).toHaveLength(1)
    expect(selected[0]?.slice(2)).toBe(before[2]?.slice(2))
  })
})

describe('search results stay windowed', () => {
  test('the list fills exactly the rows between the field and the footer', async () => {
    const many = Array.from({ length: 30 }, (_, index) => {
      const title = `w${String(index + 1).padStart(2, '0')}`

      return workspace(`$${index + 1}`, title, `${HOME}/dev/${title}`)
    })

    screen = await renderSessionScreen({ width: WIDTH, height: HEIGHT }, { workspaces: many })
    await screen.pressKey('i')
    await screen.replaceQuery('w')

    for (let press = 0; press < 25; press++) await screen.pressKey('ARROW_DOWN')

    const rows = lines(await screen.frame())
    const listed = rows.filter(line => / ○ w\d\d /.test(line))

    expect(listed).toHaveLength(HEIGHT - 5)
    expect(selectedLines(rows.join('\n'))[0]).toContain('w26')
    expect(rows[HEIGHT - 1]).toContain('cancel esc')
    expect(rows[2]).toMatch(/30 of 30 {2}$/)
  })
})

describe('search input', () => {
  test('is one row with a prompt glyph, the placeholder, and the result count', async () => {
    screen = await openSearch()
    const rows = lines(await screen.frame())

    expect(rows[2]).toMatch(/^ {2}› Type to search\.\.\. +7 {2}$/)
    // The input is one row, then a gap, then the list.
    expect(rows[3]?.trim()).toBe('')
    expect(rows[4]).toContain(SELECTION_BAR)

    const input = await rowCells(screen, 'Type to search')
    const glyph = cellsFor(input, '›')[0]
    const placeholder = cellsFor(input, 'Type')[0]
    const count = cellsFor(input, '7 ')[0]

    if (!glyph || !placeholder || !count) throw new Error('The input row was not rendered')
    expect(sameColor(glyph.fg, colors.primary)).toBe(true)
    expect(sameColor(glyph.bg, colors.surfaceAlt)).toBe(true)
    expect(sameColor(placeholder.fg, colors.textMuted)).toBe(true)
    expect(sameColor(count.fg, colors.textMuted)).toBe(true)
  })

  test('counts matches against the unfiltered list', async () => {
    screen = await openSearch()

    await screen.replaceQuery('mx')
    expect(lines(await screen.frame())[2]).toMatch(/^ {2}› mx +2 of 7 {2}$/)

    await screen.replaceQuery('xyz')
    expect(lines(await screen.frame())[2]).toMatch(/^ {2}› xyz +0 of 7 {2}$/)
  })

  test('the header keeps the unfiltered status while searching', async () => {
    screen = await openSearch()
    await screen.replaceQuery('mx')

    expect(lines(await screen.frame())[0]).toMatch(/1\/7 active $/)
  })

  test('a pending prefix takes the focused look off the field', async () => {
    screen = await openSearch('standard')
    const focused = cellsFor(await rowCells(screen, 'Type to search'), '›')[0]

    await screen.pressKey('x', { ctrl: true })
    const waiting = cellsFor(await rowCells(screen, 'Type to search'), '›')[0]

    if (!focused || !waiting) throw new Error('The prompt glyph was not rendered')
    expect(sameColor(focused.bg, colors.surfaceAlt)).toBe(true)
    expect(sameColor(waiting.bg, colors.surfaceAlt)).toBe(false)
    expect(sameColor(waiting.fg, colors.textMuted)).toBe(true)

    await screen.pressKey('ESCAPE')
  })

  test('Enter never adds a second line', async () => {
    screen = await openSearch()
    await screen.replaceQuery('zzz')
    await screen.pressKey('RETURN')

    const field = screen.renderer.currentFocusedRenderable
    expect(field instanceof TextareaRenderable ? field.plainText : undefined).toBe('zzz')
    expect(lines(await screen.frame())[2]).toMatch(/^ {2}› zzz +0 of 7 {2}$/)
    expect(lines(await screen.frame())[3]?.trim()).toBe('')
  })
})

describe('search highlights', () => {
  test('context matches are highlighted in the context column', async () => {
    screen = await openSearch()
    await screen.replaceQuery('dev')

    const selected = cellsFor(await rowCells(screen, 'api-gateway'), 'dev')
    expect(underlined(selected)).toEqual([true, true, true])
    expect(selected.every(cell => sameColor(cell.fg, colors.selectionText))).toBe(true)

    const other = cellsFor(await rowCells(screen, 'blog'), 'dev')
    expect(other.every(cell => sameColor(cell.fg, colors.action))).toBe(true)
  })
})

describe('search empty states', () => {
  test.each([
    ['vim' as const, 'esc, then n to start a new workspace'],
    ['standard' as const, 'ctrl+x n to start a new workspace'],
  ])('%s: no match names the query and the next step', async (keybindMode, next) => {
    screen = await openSearch(keybindMode)
    await screen.replaceQuery('xyz')
    const frame = await screen.frame()

    expect(frame).toContain('No matches for "xyz"')
    expect(frame).toContain(next)
  })
})

describe('dialog highlights and empty states', () => {
  test('palette rows highlight their label matches', async () => {
    screen = await renderSessionScreen({ width: WIDTH, height: HEIGHT }, { workspaces })
    await screen.pressKey('p', { ctrl: true })
    await screen.replaceQuery('ses')

    const selected = cellsFor(await rowCells(screen, 'New session'), 'New session')
    expect(underlined(selected)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ])

    const other = cellsFor(await rowCells(screen, 'Pin session'), 'session')
    expect(other.map(cell => sameColor(cell.fg, colors.action))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ])
  })

  test('the palette names a query with no match', async () => {
    screen = await renderSessionScreen({ width: WIDTH, height: HEIGHT }, { workspaces })
    await screen.pressKey('p', { ctrl: true })
    await screen.replaceQuery('zzzq')

    expect(await screen.frame()).toContain('No matches for "zzzq"')
  })

  test('theme options highlight their label matches', async () => {
    screen = await renderSessionScreen({ width: WIDTH, height: HEIGHT }, { workspaces })
    await screen.pressKey('p', { ctrl: true })
    await screen.replaceQuery('Themes')
    await screen.pressKey('RETURN')
    await screen.replaceQuery('cat')

    const frappe = cellsFor(await rowCells(screen, 'Catppuccin Frappe'), 'Catppuccin')
    expect(frappe.slice(0, 4).map(cell => sameColor(cell.fg, colors.action))).toEqual([
      true,
      true,
      true,
      false,
    ])
  })
})
