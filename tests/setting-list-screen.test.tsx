import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { TextareaRenderable } from '@opentui/core'
import type { LiveWorkspace } from '../src/multiplexer'
import type { Config } from '../src/types'
import { selectedRows } from './fixtures/selection'
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

interface SaveProbe {
  saved: Config[]
  save: (config: Config) => Promise<void>
  hold: () => () => void
}

function saveProbe(): SaveProbe {
  const saved: Config[] = []
  let held: Promise<void> | null = null

  return {
    saved,
    save: async config => {
      if (held) await held
      saved.push(config)
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

function workspace(id: string, title: string): LiveWorkspace {
  return { backend: 'tmux', id, title, path: `/fixture/${title}`, isActive: false, unitCount: 1 }
}

const WORKSPACES = [
  workspace('1', 'scratch-1'),
  workspace('2', 'scratch-notes'),
  workspace('3', 'api'),
]

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

async function hiddenSessions(probe?: SaveProbe, keybindMode?: 'vim' | 'standard') {
  const fixture = await renderSessionScreen(
    { width: 100, height: 28 },
    {
      workspaces: WORKSPACES,
      keybindMode,
      saveConfig: probe?.save,
      config: { hiddenSessions: ['scratch-*', '_popup'] },
    }
  )

  await openSetting(fixture, 'Hidden sessions')

  return fixture
}

describe('Hidden sessions list', () => {
  test('opens as rows with live counts, an add row and a JSON row', async () => {
    screen = await hiddenSessions()
    const frame = await screen.frame()

    expect(frame).toContain('┌─ Hidden sessions')
    expect(frame).toContain('Live sessions whose names match these globs are not listed')
    expect(frame).toMatch(/│ {3}scratch-\* +hides 2 +│/)
    expect(frame).toMatch(/│ {3}_popup +hides 0 +│/)
    expect(frame).toContain('Add pattern…')
    expect(frame).toContain('Edit as JSON…')
    expect(frame).toContain('Hides scratch-1 and scratch-notes')
    expect(frame).toContain('edit enter  add a  remove d  move shift+↑↓  back esc')
    expect(await selected(screen)).toMatch(/^scratch-\* +hides 2$/)
  })

  test('a adds a pattern and saves it at once', async () => {
    const probe = saveProbe()
    screen = await hiddenSessions(probe)

    await screen.pressKey('a')
    expect(await screen.frame()).toContain('add enter  cancel esc')
    expect(focusedText(screen)).toBe('')

    await screen.typeText('api')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(probe.saved.map(config => config.hiddenSessions)).toEqual([
      ['scratch-*', '_popup', 'api'],
    ])

    const frame = await screen.frame()
    expect(frame).toMatch(/│ {3}api +hides 1 +│/)
    expect(await selected(screen)).toMatch(/^api +hides 1$/)
  })

  test('an empty pattern is required and a duplicate is refused, both without saving', async () => {
    const probe = saveProbe()
    screen = await hiddenSessions(probe)

    await screen.pressKey('a')
    await screen.pressKey('RETURN')
    await screen.settle()
    expect(await screen.frame()).toContain('A pattern is required')

    await screen.typeText('_popup')
    await screen.settle()
    expect(await screen.frame()).toContain('_popup is already in the list')

    await screen.pressKey('RETURN')
    await screen.settle()
    expect(probe.saved).toEqual([])
    expect(await screen.frame()).toContain('_popup is already in the list')

    await screen.pressKey('ESCAPE')
    const frame = await screen.frame()
    expect(frame).toContain('edit enter  add a')
    expect(frame).not.toContain('already in the list')
  })

  test('enter edits a pattern in place', async () => {
    const probe = saveProbe()
    screen = await hiddenSessions(probe)

    await screen.pressKey('RETURN')
    expect(focusedText(screen)).toBe('scratch-*')
    expect(await screen.frame()).toContain('apply enter  cancel esc')

    await screen.replaceQuery('scratch-1')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(probe.saved.map(config => config.hiddenSessions)).toEqual([['scratch-1', '_popup']])
    expect(await selected(screen)).toMatch(/^scratch-1 +hides 1$/)
  })

  test('d asks first: esc keeps the pattern, enter removes it', async () => {
    const probe = saveProbe()
    screen = await hiddenSessions(probe)

    await screen.pressKey('d')
    let frame = await screen.frame()
    expect(frame).toContain('Stop hiding scratch-*? Matching sessions are listed again.')
    expect(frame).toContain('remove enter  keep esc')

    await screen.pressKey('ESCAPE')
    expect(probe.saved).toEqual([])
    expect(await screen.frame()).toContain('edit enter  add a')

    await screen.pressKey('d')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(probe.saved.map(config => config.hiddenSessions)).toEqual([['_popup']])
    frame = await screen.frame()
    expect(frame).not.toContain('scratch-*')
    expect(await selected(screen)).toMatch(/^_popup +hides 0$/)
  })

  test('shift+↓ moves a pattern down and keeps it selected', async () => {
    const probe = saveProbe()
    screen = await hiddenSessions(probe)

    await screen.pressKey('ARROW_DOWN', { shift: true })
    await screen.settle()

    expect(probe.saved.map(config => config.hiddenSessions)).toEqual([['_popup', 'scratch-*']])
    expect(await selected(screen)).toMatch(/^scratch-\* +hides 2$/)

    await screen.pressKey('ARROW_UP', { shift: true })
    await screen.settle()
    expect(probe.saved.map(config => config.hiddenSessions)).toEqual([
      ['_popup', 'scratch-*'],
      ['scratch-*', '_popup'],
    ])
  })

  test('changes wait for the save in flight', async () => {
    const probe = saveProbe()
    const release = probe.hold()
    screen = await hiddenSessions(probe)

    await screen.pressKey('ARROW_DOWN', { shift: true })
    await screen.settle()
    expect(await screen.frame()).toContain('Saving')

    await screen.pressKey('ARROW_DOWN', { shift: true })
    await screen.pressKey('d')
    await screen.pressKey('RETURN')
    release()
    await screen.settle()

    expect(probe.saved.map(config => config.hiddenSessions)).toEqual([['_popup', 'scratch-*']])
  })

  test('a failed save stays inline and changes nothing', async () => {
    screen = await renderSessionScreen(
      { width: 100, height: 28 },
      {
        workspaces: WORKSPACES,
        config: { hiddenSessions: ['scratch-*'] },
        saveConfig: async () => {
          throw new Error('disk full')
        },
      }
    )

    await openSetting(screen, 'Hidden sessions')
    await screen.pressKey('ARROW_DOWN', { shift: true })
    await screen.pressKey('d')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(await screen.frame()).toContain('Could not save settings: disk full')
    expect(await selected(screen)).toMatch(/^scratch-\* +hides 2$/)
  })

  test('j and k move in vim mode; ↑ and ↓ in both modes', async () => {
    screen = await hiddenSessions(undefined, 'vim')

    await screen.pressKey('j')
    expect(await selected(screen)).toMatch(/^_popup/)
    await screen.pressKey('k')
    expect(await selected(screen)).toMatch(/^scratch-\*/)
    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('ARROW_DOWN')
    expect(await selected(screen)).toBe('Add pattern…')
    expect(await screen.frame()).toContain('open enter  add a  back esc')
  })

  test('j does not move in standard mode', async () => {
    screen = await hiddenSessions(undefined, 'standard')

    await screen.pressKey('j')
    expect(await selected(screen)).toMatch(/^scratch-\*/)
  })

  test('enter on Add pattern… adds; Edit as JSON… opens the JSON editor', async () => {
    screen = await hiddenSessions()

    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('RETURN')
    expect(await screen.frame()).toContain('add enter  cancel esc')
    await screen.pressKey('ESCAPE')

    await screen.pressKey('ARROW_DOWN')
    expect(await selected(screen)).toBe('Edit as JSON…')
    await screen.pressKey('RETURN')
    expect(focusedText(screen)).toContain('"scratch-*"')
  })

  test('esc goes back to the same Settings row', async () => {
    screen = await hiddenSessions()

    await screen.pressKey('ESCAPE')
    const frame = await screen.frame()
    expect(frame).toContain('┌─ Settings')
    expect(await selected(screen)).toMatch(/^Hidden sessions +2 ↵$/)
    expect(focusedText(screen)).toBe('Hidden sessions')
  })
})

describe('Pinned sessions and Project folders lists', () => {
  test('a pin that is not running says so', async () => {
    screen = await renderSessionScreen(
      { width: 100, height: 28 },
      { workspaces: WORKSPACES, config: { pinnedSessions: ['api', 'gone'] } }
    )

    await openSetting(screen, 'Pinned sessions')
    const frame = await screen.frame()

    expect(frame).toContain('┌─ Pinned sessions')
    expect(frame).toMatch(/│ {3}api +│/)
    expect(frame).toMatch(/│ {3}gone +not running +│/)
    expect(frame).toContain('Add session…')
  })

  test('folders show a project count or missing, and ~ is expanded on add', async () => {
    const home = process.env.HOME ?? ''
    await mkdir(join(home, 'dev', 'alpha'), { recursive: true })
    const probe = saveProbe()

    screen = await renderSessionScreen(
      { width: 100, height: 28 },
      {
        saveConfig: probe.save,
        config: { projectPaths: [join(home, 'dev'), join(home, 'gone')] },
        projects: [
          {
            title: 'alpha',
            desc: '',
            path: join(home, 'dev', 'alpha'),
            isSession: false,
            itemKind: 'project',
          },
        ],
      }
    )

    await openSetting(screen, 'Project folders')
    let frame = await screen.frame()
    expect(frame).toMatch(/│ {3}~\/dev +1 project +│/)
    expect(frame).toMatch(/│ {3}~\/gone +missing +│/)
    expect(frame).toContain('Add folder…')

    await screen.pressKey('a')
    await screen.typeText('~/later')
    await screen.settle()
    frame = await screen.frame()
    expect(frame).toContain('~/later does not exist yet; it is scanned once it does')

    await screen.pressKey('RETURN')
    await screen.settle()
    expect(probe.saved.map(config => config.projectPaths)).toEqual([
      [join(home, 'dev'), join(home, 'gone'), join(home, 'later')],
    ])
  })
})
