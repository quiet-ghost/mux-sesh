import { afterEach, describe, expect, test } from 'bun:test'
import { TextAttributes, type CapturedLine } from '@opentui/core'
import type { LiveWorkspace } from '../src/multiplexer'
import { resolveTheme } from '../src/styles/theme'
import type { ThemeColors } from '../src/types'
import { renderSessionScreen } from './fixtures/session-screen'
import {
  cellsOf,
  contrastRatio,
  sameColor,
  SELECTION_BAR,
  selectedLines,
  selectedRow,
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

function barColumn(cells: Cell[]): number {
  return cells.findIndex(cell => cell.char === SELECTION_BAR)
}

describe('selected session row', () => {
  test.each(THEMES)(
    'shows an accent bar and a full-width readable highlight ($theme $colorScheme)',
    async ({ theme, colorScheme }) => {
      const colors = colorsOf(theme, colorScheme)
      screen = await renderSessionScreen(
        { width: WIDTH, height: HEIGHT },
        { workspaces, theme, config: { colorScheme } }
      )
      await screen.pressKey('j')

      const frame = await screen.frame()
      expect(frame).not.toContain('›')
      expect(selectedLines(frame)).toHaveLength(1)
      expect(frame).toMatch(selectedRow('○ beta'))

      const cells = cellsOf(await lineWith(screen, 'beta'))
      const bar = barColumn(cells)
      const barCell = cells[bar]

      if (!barCell) throw new Error('The selected row has no accent bar')

      // The bar sits in the gutter on the panel, outside the highlight.
      expect(sameColor(barCell.fg, colors.primary)).toBe(true)
      expect(sameColor(barCell.bg, colors.surface)).toBe(true)

      // The highlight runs from the gutter to the list's right edge.
      const highlighted = cells.slice(bar + 1, WIDTH - 1)
      expect(highlighted.every(cell => sameColor(cell.bg, colors.selection))).toBe(true)

      const title = cells.find((cell, index) => index > bar && cell.char === 'b')

      if (!title) throw new Error('The selected row title was not rendered')
      expect(sameColor(title.fg, colors.selectionText)).toBe(true)

      // Text on the highlight meets WCAG AA; the bar meets the 3:1 non-text minimum on the panel.
      expect(contrastRatio(colors.selectionText, colors.selection)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(colors.primary, colors.surface)).toBeGreaterThanOrEqual(3)

      // Rows that are not selected keep the panel background and no bar.
      const other = cellsOf(await lineWith(screen, 'charlie'))
      expect(barColumn(other)).toBe(-1)
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
    expect(selectedLines(frame)).toHaveLength(1)
    expect(frame).toMatch(/^ {2}\* ○ charlie .*marked/m)
    expect(frame).toMatch(selectedRow('○ beta'))

    const marked = cellsOf(await lineWith(screen, 'charlie'))
    expect(barColumn(marked)).toBe(-1)
    expect(marked.slice(2, WIDTH - 1).every(cell => sameColor(cell.bg, colors.dangerSurface))).toBe(
      true
    )

    await screen.pressKey('m')
    const both = await screen.frame()
    expect(selectedLines(both)).toHaveLength(1)
    expect(both).toMatch(/┃\* ○ beta .*marked/)
  })

  test('search matches stay visible on the highlight', async () => {
    const colors = colorsOf('catppuccin', 'dark')
    screen = await renderSessionScreen({ width: WIDTH, height: HEIGHT }, { workspaces })
    await screen.pressKey('i')
    await screen.typeText('bt')

    expect(await screen.frame()).toMatch(selectedRow('○ beta'))

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
  test('uses the same accent bar in the agents section', async () => {
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

    const frame = await screen.frame()
    expect(selectedLines(frame)).toHaveLength(1)
    expect(frame).toMatch(selectedRow('○ agent-one'))
  })
})

describe('selected dialog row', () => {
  test.each(THEMES)(
    'palette rows show the bar beside a readable highlight ($theme $colorScheme)',
    async ({ theme, colorScheme }) => {
      const colors = colorsOf(theme, colorScheme)
      screen = await renderSessionScreen(
        { width: WIDTH, height: HEIGHT },
        { workspaces, theme, config: { colorScheme } }
      )
      await screen.pressKey('p', { ctrl: true })
      await screen.pressKey('ARROW_DOWN')

      const frame = await screen.frame()
      const dialogBars = selectedLines(frame).filter(line => line.includes('New session'))
      expect(dialogBars).toHaveLength(1)
      expect(frame).toMatch(/┃ {2}New session/)

      const cells = cellsOf(await lineWith(screen, 'New session'))
      const bar = cells.findIndex((cell, index) => cell.char === SELECTION_BAR && index > 4)
      const barCell = cells[bar]
      const labelCell = cells[bar + 1]

      if (!barCell || !labelCell) throw new Error('The selected dialog row has no accent bar')

      expect(sameColor(barCell.fg, colors.primary)).toBe(true)
      expect(sameColor(barCell.bg, colors.surfaceModal)).toBe(true)
      expect(sameColor(labelCell.bg, colors.selection)).toBe(true)
      expect(contrastRatio(colors.primary, colors.surfaceModal)).toBeGreaterThanOrEqual(3)
    }
  )
})
