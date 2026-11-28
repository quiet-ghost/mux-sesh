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
}

function saveProbe(): SaveProbe {
  const saved: Config[] = []

  return {
    saved,
    save: async config => {
      saved.push(config)
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
