import { afterEach, describe, expect, test } from 'bun:test'
import { TextareaRenderable } from '@opentui/core'
import { leaveJsonEditor } from '../src/app/modals'
import { OptionPicker } from '../src/app/option-picker'
import { SettingPane } from '../src/app/setting-panes'
import type { Config } from '../src/config/config-model'
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

const RULES: Partial<Config> = {
  projects: [{ path: '/fixture/work/api', sessionName: 'api', listed: true }],
}

async function render(saved: Config[], config: Partial<Config> = RULES): Promise<Screen> {
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

function focusedField(fixture: Screen): TextareaRenderable {
  const input = fixture.renderer.currentFocusedRenderable

  if (!(input instanceof TextareaRenderable)) throw new Error('No text field has focus')

  return input
}

async function openRules(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('Open settings')
  await fixture.pressKey('RETURN')
  await fixture.replaceQuery('Project rules')
  await fixture.pressKey('RETURN')
  await fixture.settle()
  await fixture.pressKey('ARROW_DOWN')
  await fixture.pressKey('ARROW_DOWN')
  await fixture.pressKey('RETURN')
  await fixture.settle()
}

const BROKEN = `[
  {
    "path": "~/work/api",
    "session_name": "api",
    "listed": tru
  }
]`

describe('Raw JSON editor', () => {
  test('is a code view: line numbers, no prompt, and a description that says esc discards', async () => {
    screen = await render([])
    await openRules(screen)

    const frame = await screen.frame()
    expect(frame).toContain('┌─ Project rules · JSON')
    expect(frame).toContain('Nothing is saved until ctrl+s; esc discards the draft')
    expect(frame).toMatch(/│ {2}1 {2}\[ +│/)
    expect(frame).toMatch(/│ {2}2 {4}\{ +│/)
    expect(frame).not.toContain('› [')
    expect(frame).toContain('save ctrl+s')
    expect(frame).toContain('new line enter')
    expect(frame).toContain('back esc')
  })

  test('line numbers are muted', async () => {
    screen = await render([])
    await openRules(screen)
    await screen.frame()

    const colors = screen.colors()

    const number = screen
      .captureSpans()
      .lines.flatMap(line => line.spans)
      .find(span => span.text.trim() === '2')

    if (!number) throw new Error('Line number 2 was not rendered')
    expect(sameColor(number.fg, colors.textMuted)).toBe(true)
  })

  test('Enter inserts a new line and saves nothing', async () => {
    const saved: Config[] = []
    screen = await render(saved)
    await openRules(screen)

    const field = focusedField(screen)
    const lines = field.plainText.split('\n').length

    await screen.pressKey('RETURN')
    await screen.settle()

    expect(focusedField(screen).plainText.split('\n')).toHaveLength(lines + 1)
    expect(saved).toEqual([])
    expect(await screen.frame()).toContain('┌─ Project rules · JSON')
  })

  test('long lines are not wrapped', async () => {
    screen = await render([])
    await openRules(screen)
    await screen.replaceQuery(`["${'x'.repeat(120)}",\n"y"]`)

    const frame = await screen.frame()
    expect(frame).toMatch(/│ {2}1 {2}\["x+ │/)
    expect(frame).toMatch(/│ {2}2 {2}"y"\] +│/)
  })

  test('ctrl+s on broken JSON names the line below the field and keeps the config', async () => {
    const saved: Config[] = []
    screen = await render(saved)
    await openRules(screen)
    await screen.replaceQuery(BROKEN)
    await screen.pressKey('s', { ctrl: true })
    await screen.settle()

    const frame = withoutSideBorders(await screen.frame())
    const error = 'Line 5: not valid JSON (expected true, false or null)'
    expect(frame).toContain(error)
    expect(frame.indexOf(error)).toBeGreaterThan(frame.indexOf('7  ]'))
    expect(saved).toEqual([])
    expect(focusedField(screen).plainText).toBe(BROKEN)
  })

  test('ctrl+s on a value the config rejects names the field path', async () => {
    const saved: Config[] = []
    screen = await render(saved)
    await openRules(screen)
    await screen.replaceQuery(BROKEN.replace('tru', '"yes"'))
    await screen.pressKey('s', { ctrl: true })
    await screen.settle()

    expect(await screen.frame()).toContain('[0].listed must be true or false')
    expect(saved).toEqual([])
  })

  test('ctrl+s saves valid JSON and returns to the rule list', async () => {
    const saved: Config[] = []
    screen = await render(saved)
    await openRules(screen)
    await screen.replaceQuery(BROKEN.replace('tru', 'false'))
    await screen.pressKey('s', { ctrl: true })
    await screen.settle()

    expect(saved.map(config => config.projects?.[0]?.listed)).toEqual([false])

    expect(await screen.frame()).toContain('┌─ Project rules ─')
  })

  test('esc discards the draft and returns to the rule list that opened it', async () => {
    const saved: Config[] = []
    screen = await render(saved)
    await openRules(screen)
    await screen.replaceQuery('[]')
    await screen.pressKey('ESCAPE')
    await screen.settle()

    expect(saved).toEqual([])
    expect(await screen.frame()).toContain('┌─ Project rules ─')
    expect(await selectedRows(screen).then(rows => rows.at(-1)?.trim())).toBe('Edit as JSON…')

    await screen.pressKey('RETURN')
    await screen.settle()
    expect(focusedField(screen).plainText).toContain('"session_name": "api"')
  })
})

describe('Raw JSON editor for a list', () => {
  test('opens from the list pane, checks entries, and returns to the list', async () => {
    const saved: Config[] = []
    screen = await render(saved, { hiddenSessions: ['scratch-*'] })
    await screen.pressKey('p', { ctrl: true })
    await screen.replaceQuery('Open settings')
    await screen.pressKey('RETURN')
    await screen.replaceQuery('Hidden sessions')
    await screen.pressKey('RETURN')
    await screen.settle()
    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(await screen.frame()).toContain('┌─ Hidden sessions · JSON')

    await screen.replaceQuery('["scratch-*", ""]')
    await screen.pressKey('s', { ctrl: true })
    await screen.settle()
    expect(await screen.frame()).toContain('[1] must be a non-empty string')

    await screen.replaceQuery('["scratch-*", "tmp-*"]')
    await screen.pressKey('s', { ctrl: true })
    await screen.settle()

    expect(saved.map(config => config.hiddenSessions)).toEqual([['scratch-*', 'tmp-*']])
    expect(await screen.frame()).toContain('┌─ Hidden sessions ─')
  })
})

describe('leaving the raw JSON editor', () => {
  test('goes back to the pane that opened it, or to Settings', () => {
    const pane = SettingPane.openList('hiddenSessions')

    expect(leaveJsonEditor({ type: 'setting-json', field: 'hiddenSessions', from: pane })).toBe(
      pane
    )
    expect(leaveJsonEditor({ type: 'setting-json', field: 'projects', from: undefined })).toEqual({
      type: 'settings',
      picker: OptionPicker.browsing,
    })
  })
})
