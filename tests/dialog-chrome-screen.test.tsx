import { afterEach, describe, expect, test } from 'bun:test'
import { TextAttributes } from '@opentui/core'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError } from '../src/multiplexer/types'
import { resolveTheme } from '../src/styles/theme'
import type { ThemeColors } from '../src/types'
import {
  cellAt,
  expectPane,
  expectPaneFooter,
  findPane,
  PANE_INSET,
  paneRowText,
  paneRowWith,
  rowAt,
  textOf,
  type PaneBox,
  type PaneHint,
} from './fixtures/pane'
import { renderSessionScreen } from './fixtures/session-screen'
import { cellsOf, contrastRatio, sameColor, selectedRowText, type Cell } from './fixtures/selection'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

const SIZES = [
  { width: 100, height: 28 },
  { width: 60, height: 18 },
]

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

async function capture(fixture: Screen): Promise<Cell[][]> {
  await fixture.frame()

  return fixture.captureSpans().lines.map(cellsOf)
}

async function paneOf(fixture: Screen, title: string): Promise<PaneBox> {
  return findPane(await capture(fixture), title)
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

// alpha is attached, beta has a working agent, and closing charlie fails.
function closingBackend(workspaces: LiveWorkspace[]): MultiplexerBackend {
  let live = workspaces

  return {
    kind: 'tmux',
    capabilities: { previousWorkspace: true },
    async list() {
      return live
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
    async close(target) {
      if (target.id === '$3') {
        throw new MultiplexerError('command-failed', "can't find session: charlie")
      }

      live = live.filter(entry => entry.id !== target.id)
    },
    openOrCreate: unsupported,
    create: unsupported,
    start: unsupported,
    rename: unsupported,
    directory: unsupported,
    openEditor: unsupported,
  }
}

const SESSIONS = [
  workspace('$1', 'alpha', { isActive: true }),
  workspace('$2', 'beta', { agentStatus: 'working', unitCount: 3 }),
  workspace('$3', 'charlie'),
]

// Creating works and opening fails, so a new workspace ends on the outcome dialog.
const openFailingBackend: MultiplexerBackend = {
  kind: 'herdr',
  capabilities: { previousWorkspace: false },
  async list() {
    return [{ ...workspace('w1', 'alpha', { isActive: true }), backend: 'herdr' }]
  },
  async details(target) {
    return { workspace: target, isActive: true, unitLabel: 'Tabs', units: [], agents: [] }
  },
  async create(input) {
    return { workspace: { backend: 'herdr', id: 'w9', title: input.title }, rootPaneId: 'w9:p1' }
  },
  async start() {},
  async open() {
    throw new MultiplexerError('command-failed', 'Herdr has no attached client')
  },
  openOrCreate: unsupported,
  rename: unsupported,
  close: unsupported,
  current: unsupported,
  directory: unsupported,
  openEditor: unsupported,
}

async function sessions(size: { width: number; height: number }): Promise<Screen> {
  const fixture = await renderSessionScreen(size, {
    workspaces: [],
    backend: closingBackend(SESSIONS),
  })

  await fixture.settle()

  return fixture
}

async function runCommand(fixture: Screen, query: string): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery(query)
  await fixture.pressKey('RETURN')
}

async function markBetaAndCharlie(fixture: Screen): Promise<void> {
  for (const key of ['j', 'm', 'j', 'm', 'd']) await fixture.pressKey(key)
}

type TitleTone = 'text' | 'danger'

interface DialogCase {
  name: string
  open: (size: { width: number; height: number }) => Promise<Screen>
  title: string
  tone: TitleTone
  description?: string
  hints: readonly PaneHint[]
}

const DIALOGS: readonly DialogCase[] = [
  {
    name: 'Commands',
    open: async size => {
      const fixture = await sessions(size)
      await fixture.pressKey('p', { ctrl: true })

      return fixture
    },
    title: 'Commands',
    tone: 'text',
    description: 'catppuccin',
    hints: [
      ['navigate', '↑/↓'],
      ['run', 'enter'],
      ['close', 'esc'],
    ],
  },
  {
    name: 'Settings',
    open: async size => {
      const fixture = await sessions(size)
      await runCommand(fixture, 'Open settings')

      return fixture
    },
    title: 'Settings',
    tone: 'text',
    description: 'Search for a setting',
    hints: [
      ['navigate', '↑/↓'],
      ['open', 'enter'],
      ['close', 'esc'],
    ],
  },
  {
    name: 'the setting editor',
    open: async size => {
      const fixture = await sessions(size)
      await runCommand(fixture, 'Open settings')
      await fixture.replaceQuery('Editor Command')
      await fixture.pressKey('RETURN')

      return fixture
    },
    title: 'Editor Command',
    tone: 'text',
    description: 'Edit value and press Enter',
    hints: [
      ['apply', 'enter'],
      ['back', 'esc'],
    ],
  },
  {
    name: 'the theme picker',
    open: async size => {
      const fixture = await sessions(size)
      await runCommand(fixture, 'Themes')

      return fixture
    },
    title: 'Theme',
    tone: 'text',
    description: 'Select an option',
    hints: [
      ['navigate', '↑/↓'],
      ['apply', 'enter'],
      ['back', 'esc'],
    ],
  },
  {
    name: 'Rename',
    open: async size => {
      const fixture = await sessions(size)
      await fixture.pressKey('x', { ctrl: true })
      await fixture.pressKey('r')

      return fixture
    },
    title: 'Rename Session',
    tone: 'text',
    description: 'Update alpha',
    hints: [
      ['apply', 'enter'],
      ['cancel', 'esc'],
    ],
  },
  {
    name: 'close review',
    open: async size => {
      const fixture = await sessions(size)
      await fixture.pressKey('j')
      await fixture.pressKey('d')

      return fixture
    },
    title: "Close tmux session 'beta'?",
    tone: 'danger',
    description: '/fixture/beta',
    hints: [
      ['close', 'enter'],
      ['keep', 'esc'],
    ],
  },
  {
    name: 'batch close review',
    open: async size => {
      const fixture = await sessions(size)
      await markBetaAndCharlie(fixture)

      return fixture
    },
    title: 'Close 2 marked tmux sessions?',
    tone: 'danger',
    hints: [
      ['close 2', 'enter'],
      ['keep', 'esc'],
    ],
  },
  {
    name: 'the batch close receipt',
    open: async size => {
      const fixture = await sessions(size)
      await markBetaAndCharlie(fixture)
      await fixture.pressKey('RETURN')
      await fixture.settle()

      return fixture
    },
    title: 'Closed 1 of 2 marked sessions',
    tone: 'text',
    hints: [
      ['retry 1', 'enter'],
      ['close', 'esc'],
    ],
  },
  {
    name: 'the operation outcome',
    open: async size => {
      const fixture = await renderSessionScreen(size, {
        backend: openFailingBackend,
        projects: [
          {
            title: 'scratch',
            desc: '',
            path: '/fixture/scratch',
            isSession: false,
            itemKind: 'project',
          },
        ],
        config: { defaultSession: {} },
      })

      await fixture.pressKey('n')
      await fixture.typeText('scratch')
      await fixture.settle()
      await fixture.pressKey('RETURN')
      await fixture.settle()

      return fixture
    },
    title: 'Workspace created, but not opened',
    tone: 'text',
    hints: [
      ["open 'scratch'", 'enter'],
      ['close', 'esc'],
    ],
  },
]

const CASES = DIALOGS.flatMap(dialog => SIZES.map(size => ({ ...dialog, ...size })))

describe('dialogs are titled panes', () => {
  test.each(CASES)(
    '$name at $width x $height',
    async ({ open, title, tone, description, hints, width, height }) => {
      screen = await open({ width, height })
      const pane = await paneOf(screen, title)
      const colors = screen.colors()

      // The pane sits on the theme background; the escape key is a footer hint, not a title.
      expectPane(pane, colors, {
        title,
        titleColor: colors[tone],
        background: colors.background,
        highlight: colors.selection,
        description,
      })
      expectPaneFooter(pane, colors, hints)

      // The dialog fits the terminal, centered, with the list behind it dimmed.
      expect(pane.top).toBeGreaterThan(0)
      expect(pane.bottom).toBeLessThan(height - 1)
      expect(Math.abs(pane.left - (width - 1 - pane.right))).toBeLessThanOrEqual(1)

      const titleRow = rowAt(pane.rows, pane.top)
      expect(sameColor(cellAt(titleRow, pane.left - 1).bg, colors.background)).toBe(false)
    }
  )

  test.each(SIZES)('a long title truncates inside the border at $width x $height', async size => {
    const long = workspace('$2', `a-very-long-session-name-${'x'.repeat(80)}`)
    screen = await renderSessionScreen(size, {
      workspaces: [],
      backend: closingBackend([workspace('$1', 'alpha', { isActive: true }), long]),
    })
    await screen.settle()
    await screen.pressKey('d')

    const pane = await paneOf(screen, "Close tmux session 'a-very-long")
    const top = textOf(rowAt(pane.rows, pane.top).slice(pane.left, pane.right + 1))

    expect(top).toMatch(/^┌─ Close tmux session 'a-very-long-session-name-x+… ─┐$/)
    expectPaneFooter(pane, screen.colors(), [
      ['close', 'enter'],
      ['keep', 'esc'],
    ])
  })
})

describe('dialog contents', () => {
  test.each(THEMES)(
    'Commands keeps muted bold sections and a prompt filter ($theme $colorScheme)',
    async ({ theme, colorScheme }) => {
      const colors = colorsOf(theme, colorScheme)
      screen = await renderSessionScreen(
        { width: 110, height: 30 },
        { theme, config: { colorScheme } }
      )
      await screen.pressKey('p', { ctrl: true })

      const pane = await paneOf(screen, 'Commands')

      // The filter is the main search field's prompt on the dialog background, at the body inset.
      const filterRow = paneRowWith(pane, 'Search')
      const filter = rowAt(pane.rows, filterRow)
      expect(filterRow).toBe(pane.top + 2)
      expect(paneRowText(pane, filterRow)).toMatch(/^ › Search +$/)
      expect(sameColor(cellAt(filter, pane.left + PANE_INSET).fg, colors.primary)).toBe(true)
      expect(paneRowText(pane, filterRow + 1).trim()).toBe('')

      const sectionRow = rowAt(pane.rows, paneRowWith(pane, 'Direct'))
      const section = cellAt(sectionRow, textOf(sectionRow).indexOf('Direct'))
      expect(sameColor(section.fg, colors.textMuted)).toBe(true)
      expect(section.attributes & TextAttributes.BOLD).toBe(TextAttributes.BOLD)

      // Body text and hint labels meet WCAG AA on the dialog background.
      expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5)
    }
  )

  test.each([18, 24, 30, 36])(
    'Commands never ends its window on a section header at height %i',
    async height => {
      screen = await renderSessionScreen({ width: 110, height })
      await screen.pressKey('p', { ctrl: true })

      const pane = await paneOf(screen, 'Commands')
      // The last body row sits right above the footer rule.
      const last = paneRowText(pane, pane.bottom - 3).trim()

      expect(last).not.toBe('')
      expect(['Direct', 'Prefix ctrl+x']).not.toContain(last)
    }
  )

  test('the theme picker marks the saved theme with a dot that stays while previewing', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 }, { workspaces: [] })
    await runCommand(screen, 'Themes')

    const frame = await screen.frame()
    expect(frame.match(/●/g)).toHaveLength(1)
    expect(await selectedRowText(screen)).toMatch(/^● Catppuccin\s{2,}catppuccin$/)

    await screen.pressKey('ARROW_DOWN')
    const previewing = await screen.frame()
    expect(previewing.match(/●/g)).toHaveLength(1)
    expect(previewing).toMatch(/ ● Catppuccin\s{2,}catppuccin /)
    expect(await selectedRowText(screen)).toMatch(/^ {2}Catppuccin Frappe\s{2,}catppuccin-frappe$/)

    // The pane follows the previewed theme; the dot is painted in its accent.
    const preview = colorsOf('catppuccin-frappe', 'dark')
    const pane = await paneOf(screen, 'Theme')
    expectPane(pane, preview, {
      title: 'Theme',
      titleColor: preview.text,
      background: preview.background,
      highlight: preview.selection,
    })

    const saved = rowAt(pane.rows, paneRowWith(pane, '● Catppuccin '))
    expect(sameColor(cellAt(saved, textOf(saved).indexOf('●')).fg, preview.primary)).toBe(true)
  })

  test('the rename and setting editor fields use the prompt glyph', async () => {
    screen = await sessions({ width: 100, height: 28 })
    await screen.pressKey('x', { ctrl: true })
    await screen.pressKey('r')

    const rename = await paneOf(screen, 'Rename Session')
    expect(paneRowText(rename, rename.top + 2)).toMatch(/^ › alpha +$/)

    await screen.pressKey('ESCAPE')
    await runCommand(screen, 'Open settings')
    await screen.replaceQuery('Editor Command')
    await screen.pressKey('RETURN')

    const editor = await paneOf(screen, 'Editor Command')
    expect(paneRowText(editor, editor.top + 2)).toMatch(/^ › nvim /)
  })
})
