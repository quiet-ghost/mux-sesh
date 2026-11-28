import { afterEach, describe, expect, test } from 'bun:test'
import type { Config } from '../src/config/config-model'
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

async function render(saved: Config[], config: Partial<Config> = {}): Promise<Screen> {
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

async function openPrefixPicker(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('Open settings')
  await fixture.pressKey('RETURN')
  await fixture.replaceQuery('Prefix key')
  await fixture.pressKey('RETURN')
  await fixture.settle()
}

async function selected(fixture: Screen): Promise<string> {
  return (await selectedRows(fixture)).at(-1)?.trim() ?? ''
}

async function chooseCustom(fixture: Screen): Promise<void> {
  await fixture.replaceQuery('Custom')
  await fixture.settle()
  await fixture.pressKey('RETURN')
  await fixture.settle()
}

describe('Prefix key', () => {
  test('the picker offers the presets and Custom…', async () => {
    screen = await render([])
    await openPrefixPicker(screen)

    const frame = await screen.frame()
    expect(frame).toContain('┌─ Prefix key')

    for (const preset of ['ctrl+x', 'ctrl+space', 'space', 'Custom…'])
      expect(frame).toMatch(new RegExp(`│ [● ] ${preset.replace('+', '\\+')} `))
  })

  test('a configured key that is not a preset shows as current and stays selectable', async () => {
    const saved: Config[] = []
    screen = await render(saved, { prefixKey: 'ctrl+a' })
    await openPrefixPicker(screen)

    expect(await selected(screen)).toMatch(/^● ctrl\+a/)

    await screen.pressKey('ARROW_UP')
    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('RETURN')
    await screen.settle()
    expect(saved).toEqual([])

    await screen.pressKey('ARROW_UP')
    await screen.pressKey('RETURN')
    await screen.settle()
    expect(saved.map(config => config.prefixKey)).toEqual([';'])
  })

  test('Custom… takes any key the prefix reads and saves it', async () => {
    const saved: Config[] = []
    screen = await render(saved)
    await openPrefixPicker(screen)
    await chooseCustom(screen)

    const frame = await screen.frame()
    expect(frame).toContain('┌─ Prefix key')
    expect(frame).toContain('ctrl or shift and a key, such as ctrl+a')
    expect(frame).toContain('› ctrl+x')

    await screen.replaceQuery('Ctrl+B')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(saved.map(config => config.prefixKey)).toEqual(['ctrl+b'])
    expect(await screen.frame()).toContain('┌─ Settings')
    expect(await selected(screen)).toMatch(/^Prefix key +ctrl\+b ↵$/)
  })

  test('Custom… refuses a key the prefix cannot read and saves nothing', async () => {
    const saved: Config[] = []
    screen = await render(saved)
    await openPrefixPicker(screen)
    await chooseCustom(screen)
    await screen.replaceQuery('alt+x')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(await screen.frame()).toContain(
      '"alt" is not a modifier mux-sesh reads; use ctrl or shift'
    )

    await screen.replaceQuery('j')
    await screen.pressKey('RETURN')
    await screen.settle()

    expect(await screen.frame()).toContain(
      'j alone would type into search; add ctrl, such as ctrl+j'
    )
    expect(saved).toEqual([])
  })
})
