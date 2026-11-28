import { afterEach, describe, expect, test } from 'bun:test'
import { TextAttributes, type CapturedLine } from '@opentui/core'
import type { LiveWorkspace } from '../src/multiplexer'
import { resolveTheme } from '../src/styles/theme'
import type { ThemeColors } from '../src/styles/theme-model'
import { renderSessionScreen } from './fixtures/session-screen'
import {
  cellsOf,
  contrastRatio,
  listRow,
  sameColor,
  selectedRows,
  selectedRowText,
  type Cell,
} from './fixtures/selection'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

const WIDTH = 110
const HEIGHT = 30

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.defects).toEqual([])
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

function workspace(id: string, title: string, extra: Partial<LiveWorkspace> = {}): LiveWorkspace {
  return {
    backend: 'tmux',
    id,
    title,
    path: `/fixture/projects/${title}`,
    isActive: false,
    unitCount: 1,
    ...extra,
  }
}

const workspaces: LiveWorkspace[] = [
  workspace('$1', 'alpha', { isActive: true, unitCount: 2 }),
  workspace('$2', 'beta', { agentStatus: 'working' }),
  workspace('$3', 'charlie'),
]

// A light and a dark built-in theme, so the highlight is checked against both backgrounds.
const THEMES = [
  { theme: 'github', colorScheme: 'light' as const },
  { theme: 'rosepine', colorScheme: 'dark' as const },
]

function colorsOf(theme: string, colorScheme: 'light' | 'dark'): ThemeColors {
  return resolveTheme(theme, {}, colorScheme).colors
}

async function lineWith(fixture: Screen, text: string): Promise<CapturedLine> {
  await fixture.frame()

  const line = fixture.captureSpans().lines.find(candidate =>
    candidate.spans
      .map(span => span.text)
      .join('')
      .includes(text)
  )

  if (!line) throw new Error(`No rendered line contains ${text}`)

  return line
}

// The list's first column is its padding; every row starts on the next one.
const ROW_START = 1

function highlightedCells(cells: Cell[], colors: ThemeColors): Cell[] {
  return cells.filter(cell => sameColor(cell.bg, colors.selection))
}

describe('selected session row', () => {
  test.each(THEMES)(
    'shows a full-width readable highlight and no bar ($theme $colorScheme)',
    async ({ theme, colorScheme }) => {
      const colors = colorsOf(theme, colorScheme)
      screen = await renderSessionScreen(
        { width: WIDTH, height: HEIGHT },
        { workspaces, theme, config: { colorScheme } }
      )
      await screen.pressKey('j')

      const frame = await screen.frame()
      expect(frame).not.toContain('›')
      expect(frame).not.toContain('┃')
      expect(await selectedRowText(screen)).toMatch(listRow('○ beta {5}projects$'))
      expect(frame).toMatch(/^ {3}● alpha {4}projects\s/m)
      expect(frame).toMatch(/^ {3}○ charlie {2}projects\s/m)

      const cells = cellsOf(await lineWith(screen, 'beta'))

      // The highlight runs from the row's first cell to the list's right edge, on the panel.
      expect(sameColor(cells[0]?.bg ?? colors.selection, colors.surface)).toBe(true)
      const row = cells.slice(ROW_START, WIDTH - 1)
      expect(row.every(cell => sameColor(cell.bg, colors.selection))).toBe(true)
      expect(highlightedCells(cells, colors)).toHaveLength(row.length)

      const title = cells.find(cell => cell.char === 'b')

      if (!title) throw new Error('The selected row title was not rendered')
      expect(sameColor(title.fg, colors.selectionText)).toBe(true)

      // Text on the highlight meets WCAG AA.
      expect(contrastRatio(colors.selectionText, colors.selection)).toBeGreaterThanOrEqual(4.5)

      // Rows that are not selected keep the panel background.
      const other = cellsOf(await lineWith(screen, 'charlie'))
      expect(other.every(cell => sameColor(cell.bg, colors.surface))).toBe(true)
    }
  )

  test('a marked row keeps its own marker, and a selected marked row shows both', async () => {
    const colors = colorsOf('catppuccin', 'dark')
    screen = await renderSessionScreen({ width: WIDTH, height: HEIGHT }, { workspaces })
    await screen.pressKey('j')
    await screen.pressKey('j')
    await screen.pressKey('m')
    await screen.pressKey('k')

    const frame = await screen.frame()
    expect(frame).toMatch(/^ \* ○ charlie .*marked/m)
    expect(await selectedRowText(screen)).toMatch(listRow('○ beta'))

    const marked = cellsOf(await lineWith(screen, 'charlie'))
    expect(
      marked.slice(ROW_START, WIDTH - 1).every(cell => sameColor(cell.bg, colors.dangerSurface))
    ).toBe(true)

    await screen.pressKey('m')
    expect(await selectedRowText(screen)).toMatch(/^\* ○ beta .*marked/)

    // The marker stays readable on the highlight.
    const both = cellsOf(await lineWith(screen, 'beta'))
    const marker = both[ROW_START]

    if (!marker) throw new Error('The selected marked row was not rendered')
    expect(marker.char).toBe('*')
    expect(sameColor(marker.fg, colors.selectionText)).toBe(true)
    expect(sameColor(marker.bg, colors.selection)).toBe(true)
  })

  test('search matches stay visible on the highlight', async () => {
    const colors = colorsOf('catppuccin', 'dark')
    screen = await renderSessionScreen({ width: WIDTH, height: HEIGHT }, { workspaces })
    await screen.pressKey('i')
    await screen.typeText('bt')

    expect(await selectedRowText(screen)).toMatch(listRow('○ beta'))

    const cells = cellsOf(await lineWith(screen, 'beta'))

    const start = cells.findIndex(
      (cell, index) => cell.char === 'b' && cells[index + 1]?.char === 'e'
    )

    const title = cells.slice(start, start + 4)

    expect(title.map(cell => cell.char).join('')).toBe('beta')
    expect(title.every(cell => sameColor(cell.bg, colors.selection))).toBe(true)
    expect(title.every(cell => sameColor(cell.fg, colors.selectionText))).toBe(true)

    const underlined = title.map(cell => (cell.attributes & TextAttributes.UNDERLINE) !== 0)
    expect(underlined).toEqual([true, false, true, false])
  })
})

describe('selected agent row', () => {
  test('uses the same highlight, and no bar, in the agents section', async () => {
    const host: LiveWorkspace = {
      backend: 'herdr',
      id: 'ws-1',
      title: 'ws-1',
      path: '/fixture/projects/ws-1',
      isActive: false,
      unitCount: 1,
    }

    const agent: LiveWorkspace = {
      backend: 'herdr',
      id: 'ws-1',
      title: 'agent-one',
      workspaceTitle: 'ws-1',
      path: '/fixture/projects/ws-1',
      isActive: false,
      unitCount: 1,
      agentStatus: 'working',
      target: { kind: 'agent', tabId: 'ws-1:t1', paneId: 'ws-1:p1' },
    }

    screen = await renderSessionScreen(
      { width: WIDTH, height: HEIGHT },
      { workspaces: [host, agent] }
    )
    await screen.pressKey('o')

    expect(await selectedRowText(screen)).toMatch(listRow('○ agent-one {2}ws-1 +working$'))
    expect(await screen.frame()).not.toContain('┃')
    expect(await screen.frame()).toMatch(/^ {3}○ ws-1/m)
  })
})

describe('selected dialog row', () => {
  test.each(THEMES)(
    'palette rows show a readable highlight and no bar ($theme $colorScheme)',
    async ({ theme, colorScheme }) => {
      const colors = colorsOf(theme, colorScheme)
      screen = await renderSessionScreen(
        { width: WIDTH, height: HEIGHT },
        { workspaces, theme, config: { colorScheme } }
      )
      await screen.pressKey('p', { ctrl: true })
      await screen.pressKey('ARROW_DOWN')

      const frame = await screen.frame()
      expect(frame).not.toContain('┃')

      const dialogRows = (await selectedRows(screen)).filter(row => row.includes('New session'))
      expect(dialogRows).toHaveLength(1)
      expect(dialogRows[0]).toMatch(/^ {2}New session +n$/)

      // Unselected rows line up with the selected one: the mark cell, a space, the label.
      const search = frame.split('\n').find(line => /\s{3}Search\s+i\s/.test(line)) ?? ''
      const selected = frame.split('\n').find(line => line.includes('New session')) ?? ''
      expect(search.indexOf('Search')).toBe(selected.indexOf('New session'))

      const cells = cellsOf(await lineWith(screen, 'New session'))

      const label = cells.findIndex(
        (cell, index) => cell.char === 'N' && cells[index + 1]?.char === 'e'
      )

      const rowStart = label - 2
      const before = cells[rowStart - 1]

      if (!before) throw new Error('The selected dialog row was not rendered')

      // The highlight starts at the row's first cell, right after the dialog's inset.
      expect(sameColor(before.bg, colors.surface)).toBe(true)
      expect(
        cells.slice(rowStart, label + 11).every(cell => sameColor(cell.bg, colors.selection))
      ).toBe(true)
      expect(sameColor(cells[label]?.fg ?? colors.text, colors.selectionText)).toBe(true)
    }
  )
})
