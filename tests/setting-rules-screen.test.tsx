import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { TextareaRenderable } from '@opentui/core'
import type { Config, ProjectProfile } from '../src/types'
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

const HOME = process.env.HOME ?? ''

function saveProbe() {
  const saved: Config[] = []

  return {
    saved,
    save: async (config: Config) => {
      saved.push(config)
    },
  }
}

const HYPR: ProjectProfile = {
  path: join(HOME, '.dotfiles/hypr'),
  sessionName: 'hyprland',
  startupCommand: 'nvim',
  listed: true,
}

const MUX: ProjectProfile = { path: join(HOME, 'dev/mux-sesh'), startupCommand: 'bun run dev' }
const API: ProjectProfile = { path: join(HOME, 'work/api'), sessionName: 'api', listed: true }

async function openSetting(fixture: Screen, title: string): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('Open settings')
  await fixture.pressKey('RETURN')
  await fixture.replaceQuery(title)
  await fixture.settle()
  await fixture.pressKey('RETURN')
  await fixture.settle()
}

async function selected(fixture: Screen): Promise<string> {
  const row = (await selectedRows(fixture)).at(-1)

  if (row === undefined) throw new Error('No row is highlighted')

  return row.trim()
}

function focusedText(fixture: Screen): string {
  const input = fixture.renderer.currentFocusedRenderable

  if (!(input instanceof TextareaRenderable)) throw new Error('No text field has focus')

  return input.plainText
}

async function projectRules(save?: (config: Config) => Promise<void>) {
  const fixture = await renderSessionScreen(
    { width: 100, height: 28 },
    { saveConfig: save, config: { projects: [HYPR, MUX, API] } }
  )

  await openSetting(fixture, 'Project rules')

  return fixture
}

async function down(fixture: Screen, times: number): Promise<void> {
  for (let press = 0; press < times; press++) await fixture.pressKey('ARROW_DOWN')
}

describe('Project rules list', () => {
  test('rows show each rule with a summary of its overrides', async () => {
    screen = await projectRules()
    const frame = await screen.frame()

    expect(frame).toContain('┌─ Project rules')
    expect(frame).toContain('Exact folders with their own name, commands, icon or listing')
    expect(frame).toMatch(/│ {3}~\/\.dotfiles\/hypr +hyprland · nvim · listed +│/)
    expect(frame).toMatch(/│ {3}~\/dev\/mux-sesh +bun run dev +│/)
    expect(frame).toMatch(/│ {3}~\/work\/api +api · listed +│/)
    expect(frame).toContain('Add rule…')
    expect(frame).toContain('Edit as JSON…')
    expect(frame).toContain('Session hyprland, starts nvim, listed before it has a session')
    expect(frame).toContain('edit enter  add a  remove d  move shift+↑↓  back esc')
  })

  test('d asks first, then removes the rule', async () => {
    const probe = saveProbe()
    screen = await projectRules(probe.save)
    await down(screen, 2)

    await screen.pressKey('d')
    let frame = await screen.frame()
    expect(frame).toContain('Remove the rule for ~/work/api? Its session keeps running.')
    expect(frame).toContain('remove enter  keep esc')

    await screen.pressKey('RETURN')
    await screen.settle()
    expect(probe.saved.map(config => config.projects?.map(rule => rule.path))).toEqual([
      [HYPR.path, MUX.path],
    ])

    frame = await screen.frame()
    expect(frame).not.toContain('~/work/api')
  })

  test('shift+↓ moves a rule down', async () => {
    const probe = saveProbe()
    screen = await projectRules(probe.save)

    await screen.pressKey('ARROW_DOWN', { shift: true })
    await screen.settle()

    expect(probe.saved.map(config => config.projects?.map(rule => rule.path))).toEqual([
      [MUX.path, HYPR.path, API.path],
    ])
    expect(await selected(screen)).toMatch(/^~\/\.dotfiles\/hypr/)
  })

  test('esc goes back to the Project rules row in Settings', async () => {
    screen = await projectRules()

    await screen.pressKey('ESCAPE')
    expect(await screen.frame()).toContain('┌─ Settings')
    expect(await selected(screen)).toMatch(/^Project rules +3 ↵$/)
  })
})

describe('Adding a rule', () => {
  test('asks for the path first; empty and duplicate paths are refused inline', async () => {
    const probe = saveProbe()
    screen = await projectRules(probe.save)

    await screen.pressKey('a')
    let frame = await screen.frame()
    expect(frame).toContain('┌─ Add project rule')
    expect(frame).toContain('The folder this rule applies to; the other fields come next')
    expect(frame).toContain('add enter  cancel esc')

    await screen.pressKey('RETURN')
    await screen.settle()
    expect(await screen.frame()).toContain('A folder is required')

    await screen.typeText('~/work/api')
    await screen.settle()
    expect(await screen.frame()).toContain('There is already a rule for ~/work/api')

    await screen.pressKey('RETURN')
    await screen.settle()
    expect(probe.saved).toEqual([])

    await screen.pressKey('ESCAPE')
    frame = await screen.frame()
    expect(frame).toContain('┌─ Project rules')
  })

  test('a missing folder is a muted warning, and the new rule opens its form', async () => {
    const probe = saveProbe()
    screen = await projectRules(probe.save)

    await screen.pressKey('a')
    await screen.typeText('~/work/new')
    await screen.settle()
    await screen.frame()

    const colors = screen.colors()
    const warning = '~/work/new does not exist yet; the rule applies once it does'

    const span = screen
      .captureSpans()
      .lines.flatMap(line => line.spans)
      .find(candidate => candidate.text.includes(warning))

    if (!span) throw new Error('The missing-folder warning was not rendered')
    expect(sameColor(span.fg, colors.textMuted)).toBe(true)

    await screen.pressKey('RETURN')
    await screen.settle()

    expect(probe.saved.map(config => config.projects?.at(-1))).toEqual([
      { path: join(HOME, 'work/new') },
    ])
    expect(await screen.frame()).toContain('┌─ Project rule · ~/work/new')
    expect(await selected(screen)).toMatch(/^Session name +default · from the folder name$/)
  })
})

describe('Rule form', () => {
  async function apiForm(save?: (config: Config) => Promise<void>) {
    const fixture = await projectRules(save)
    await down(fixture, 2)
    await fixture.pressKey('RETURN')

    return fixture
  }

  test('unset fields show the inherited value, muted', async () => {
    screen = await apiForm()
    const frame = await screen.frame()

    expect(frame).toContain('┌─ Project rule · ~/work/api')
    expect(frame).toContain('Changes save as you make them')
    expect(frame).toMatch(/│ {3}Path {14}~\/work\/api +│/)
    expect(frame).toMatch(/│ {3}Session name {6}api +│/)
    expect(frame).toMatch(/│ {3}Startup command {3}default · nvim \(Telescope\) +│/)
    expect(frame).toMatch(/│ {3}Preview command {3}default · directory listing +│/)
    expect(frame).toMatch(/│ {3}Listed +on +│/)
    expect(frame).toMatch(/│ {3}Icon {14}default +│/)
    expect(frame).toContain('edit enter  back esc')

    const colors = screen.colors()
    const spans = screen.captureSpans().lines.flatMap(line => line.spans)
    const inherited = spans.find(span => span.text.includes('default · nvim (Telescope)'))
    // A set value is drawn like its label, so the two read as one span.
    const own = spans.find(span => /Session name +api/.test(span.text))

    if (!inherited || !own) throw new Error('The form values were not rendered')
    expect(sameColor(inherited.fg, colors.textMuted)).toBe(true)
    expect(sameColor(own.fg, colors.text)).toBe(true)
  })

  test('enter edits a field inline and saves it', async () => {
    const probe = saveProbe()
    screen = await apiForm(probe.save)
    await down(screen, 2)

    await screen.pressKey('RETURN')
    expect(focusedText(screen)).toBe('')
    let frame = await screen.frame()
    expect(frame).toContain('apply enter  cancel esc')
    expect(frame).toContain('{file}, {dir} and {} are replaced for files opened from New')

    await screen.typeText('bun run dev')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(probe.saved.map(config => config.projects?.[2]?.startupCommand)).toEqual(['bun run dev'])
    frame = await screen.frame()
    expect(frame).toMatch(/│ {3}Startup command {3}bun run dev +│/)
    expect(await selected(screen)).toMatch(/^Startup command +bun run dev$/)
  })

  test('ctrl+r clears an override back to inherited', async () => {
    const probe = saveProbe()
    screen = await apiForm(probe.save)
    await down(screen, 1)
    expect(await screen.frame()).toContain('edit enter  reset ctrl+r  back esc')

    await screen.pressKey('r', { ctrl: true })
    await screen.settle()

    expect(probe.saved.map(config => config.projects?.[2]?.sessionName)).toEqual([undefined])
    expect(await selected(screen)).toMatch(/^Session name +default · from the folder name$/)
    expect(await screen.frame()).not.toContain('reset ctrl+r')
  })

  test('→ switches Listed', async () => {
    const probe = saveProbe()
    screen = await apiForm(probe.save)
    await down(screen, 4)
    expect(await selected(screen)).toMatch(/^Listed +‹ on ›$/)
    expect(await screen.frame()).toContain('change ←/→/enter  reset ctrl+r  back esc')

    await screen.pressKey('ARROW_RIGHT')
    await screen.settle()

    expect(probe.saved.map(config => config.projects?.[2]?.listed)).toEqual([false])
    expect(await selected(screen)).toMatch(/^Listed +‹ off ›$/)
  })

  test('the path cannot move onto another rule', async () => {
    const probe = saveProbe()
    screen = await apiForm(probe.save)

    await screen.pressKey('RETURN')
    expect(focusedText(screen)).toBe('~/work/api')
    await screen.replaceQuery('~/dev/mux-sesh')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(probe.saved).toEqual([])
    expect(await screen.frame()).toContain('There is already a rule for ~/dev/mux-sesh')
  })

  test('esc goes back to the rule list on the same rule', async () => {
    screen = await apiForm()

    await screen.pressKey('ESCAPE')
    expect(await screen.frame()).toContain('┌─ Project rules')
    expect(await selected(screen)).toMatch(/^~\/work\/api +api · listed$/)
  })
})

describe('Wildcard rules', () => {
  test('a wildcard rule has a pattern and no Listed or Icon field', async () => {
    await mkdir(join(HOME, 'work'), { recursive: true })

    screen = await renderSessionScreen(
      { width: 100, height: 28 },
      { config: { wildcards: [{ pattern: join(HOME, 'work/**'), startupCommand: 'bun run dev' }] } }
    )

    await openSetting(screen, 'Wildcard rules')
    expect(await screen.frame()).toMatch(/│ {3}~\/work\/\*\* +bun run dev +│/)

    await screen.pressKey('RETURN')
    const frame = await screen.frame()
    expect(frame).toContain('┌─ Wildcard rule · ~/work/**')
    expect(frame).toMatch(/│ {3}Pattern {11}~\/work\/\*\* +│/)
    expect(frame).not.toContain('Listed')
    expect(frame).not.toContain('Icon')
  })
})
