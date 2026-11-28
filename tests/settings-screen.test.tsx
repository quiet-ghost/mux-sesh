import { afterEach, describe, expect, test } from 'bun:test'
import type { Config } from '../src/types'
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

async function openSettings(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('Open settings')
  await fixture.pressKey('RETURN')
}

describe('Settings startup command', () => {
  test('one Startup command row edits the default session startup command', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await openSettings(screen)
    await screen.replaceQuery('editor command')

    const searched = await screen.frame()
    expect(searched).not.toContain('Editor Command')
    expect(searched).not.toContain('Default Startup')

    await screen.replaceQuery('Startup')
    await screen.pressKey('RETURN')
    expect(await screen.frame()).toContain('Startup Command')

    await screen.replaceQuery('helix')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(probe.saved.map(config => config.defaultSession?.startupCommand)).toEqual(['helix'])
  })
})

describe('Settings name depth', () => {
  test('→ and ← step Name depth and save each step', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await openSettings(screen)
    await screen.replaceQuery('Name depth')
    expect(await screen.frame()).toContain('1 · mux-sesh')

    await screen.pressKey('ARROW_RIGHT')
    await screen.settle()
    expect(await screen.frame()).toContain('2 · dev/mux-sesh')

    await screen.pressKey('ARROW_LEFT')
    await screen.settle()

    expect(probe.saved.map(config => config.dirLength)).toEqual([2, 1])
    expect(await screen.frame()).toContain('1 · mux-sesh')
  })

  test('stepping past the limit saves nothing and says nothing', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await openSettings(screen)
    await screen.replaceQuery('Name depth')

    await screen.pressKey('ARROW_LEFT')
    await screen.settle()

    expect(probe.saved).toEqual([])
    expect(await screen.frame()).not.toContain('updated')
  })

  test('a step waits for the save before it saves again', async () => {
    const probe = saveProbe()
    const release = probe.hold()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await openSettings(screen)
    await screen.replaceQuery('Name depth')

    await screen.pressKey('ARROW_RIGHT')
    await screen.settle()
    await screen.pressKey('ARROW_RIGHT')
    release()
    await screen.settle()

    expect(probe.saved.map(config => config.dirLength)).toEqual([2])
  })

  test('Enter on Name depth opens no editor', async () => {
    screen = await renderSessionScreen({ width: 100, height: 28 })
    await openSettings(screen)
    await screen.replaceQuery('Name depth')
    await screen.pressKey('RETURN')

    const frame = await screen.frame()
    expect(frame).toContain('┌─ Settings')
    expect(frame).not.toContain('Edit value')
  })

  test('applying an unchanged value saves nothing and says nothing', async () => {
    const probe = saveProbe()
    screen = await renderSessionScreen({ width: 100, height: 28 }, { saveConfig: probe.save })
    await openSettings(screen)
    await screen.replaceQuery('Startup')
    await screen.pressKey('RETURN')
    await screen.pressKey('RETURN')
    await screen.settle()

    const frame = await screen.frame()
    expect(probe.saved).toEqual([])
    expect(frame).not.toContain('updated')
    expect(frame).toContain('┌─ Settings')
  })
})
