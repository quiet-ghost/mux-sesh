import { afterEach, describe, expect, test } from 'bun:test'
import { TextareaRenderable } from '@opentui/core'
import type { KeybindMode } from '../src/types'
import { renderSessionScreen } from './fixtures/session-screen'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.renderer.isDestroyed).toBe(true)
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

const MODES: KeybindMode[] = ['vim', 'standard']
const SETTINGS_HINT = 'navigate ↑/↓  open enter  close esc'

function focusedTextarea(fixture: Screen): TextareaRenderable {
  const focused = fixture.renderer.currentFocusedRenderable

  if (!(focused instanceof TextareaRenderable)) {
    throw new Error('Expected a focused textarea, but no text field owns focus')
  }

  expect(focused.isDestroyed).toBe(false)

  return focused
}

async function enterSearch(fixture: Screen, keybindMode: KeybindMode): Promise<TextareaRenderable> {
  if (keybindMode === 'vim') await fixture.pressKey('i')

  return focusedTextarea(fixture)
}

async function runPaletteCommand(fixture: Screen, title: string): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery(title)
  await fixture.pressKey('RETURN')
}

async function openSettings(fixture: Screen): Promise<void> {
  await runPaletteCommand(fixture, 'Open settings')
  expect(await fixture.frame()).toContain('Search settings')
}

describe('text fields own printable keys', () => {
  test.each(MODES)('%s Commands filter takes q/j/k/e as text', async keybindMode => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })
    await screen.pressKey('p', { ctrl: true })
    const filter = focusedTextarea(screen)

    await screen.typeText('qjke')

    const palette = await screen.frame()
    expect(palette).toContain('Commands')
    expect(filter.plainText).toBe('qjke')
    expect(focusedTextarea(screen)).toBe(filter)
  })

  test.each(MODES)('%s Settings filter takes q/j/k/e as text', async keybindMode => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })
    await openSettings(screen)
    const filter = focusedTextarea(screen)

    await screen.typeText('jkeq')

    const settings = await screen.frame()
    expect(settings).toContain(SETTINGS_HINT)
    expect(settings).toContain('No matches for "jkeq"')
    expect(filter.plainText).toBe('jkeq')
  })

  test.each(MODES)('%s search field takes q/j/k/e as text', async keybindMode => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })
    const search = await enterSearch(screen, keybindMode)

    await screen.typeText('qjke')
    await screen.settle()

    const frame = await screen.frame()
    expect(search.plainText).toBe('qjke')
    expect(frame).toContain('qjke')
    expect(frame).not.toContain('Commands')
    expect(screen.calls.filter(call => call.operation === 'open')).toEqual([])
  })

  test.each(MODES)('%s Enter in the Commands filter does not edit the query', async keybindMode => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })
    await screen.pressKey('p', { ctrl: true })
    await screen.replaceQuery('Last session')

    await screen.pressKey('RETURN')

    expect(await screen.frame()).toContain('Last session unavailable')
    expect(focusedTextarea(screen).plainText).toBe('Last session')
  })
})

describe('query resets reach the editor', () => {
  test('standard Escape clears both the query and the search text', async () => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode: 'standard' })
    const search = await enterSearch(screen, 'standard')
    await screen.replaceQuery('alp')
    await screen.settle()
    expect(await screen.frame()).not.toContain('beta')

    await screen.pressKey('ESCAPE')
    await screen.settle()

    expect(search.plainText).toBe('')
    expect(await screen.frame()).toContain('beta')
    expect(focusedTextarea(screen)).toBe(search)
  })

  test.each(MODES)('%s backing out of a setting keeps the Settings filter', async keybindMode => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })
    await openSettings(screen)
    await screen.replaceQuery('Theme')
    await screen.pressKey('RETURN')
    expect(await screen.frame()).toContain('Filter options')

    await screen.pressKey('ESCAPE')

    const settings = await screen.frame()
    expect(settings).toContain(SETTINGS_HINT)
    expect(settings).toMatch(/Theme\s+catppuccin/)
    expect(focusedTextarea(screen).plainText).toBe('Theme')
  })
})

describe('modal focus lifecycle', () => {
  test.each(MODES)('%s closing Commands returns focus to the search field', async keybindMode => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })
    const search = await enterSearch(screen, keybindMode)

    await screen.pressKey('p', { ctrl: true })
    expect(focusedTextarea(screen)).not.toBe(search)
    await screen.pressKey('ESCAPE')

    expect(await screen.frame()).not.toContain('Commands')
    expect(focusedTextarea(screen)).toBe(search)

    await screen.typeText('bet')
    await screen.settle()
    expect(search.plainText).toBe('bet')
    expect(await screen.frame()).not.toContain('alpha')
  })

  test.each(MODES)(
    '%s cancelling Settings returns focus to the search field',
    async keybindMode => {
      screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })
      const search = await enterSearch(screen, keybindMode)

      await openSettings(screen)
      await screen.replaceQuery('Theme')
      await screen.pressKey('RETURN')
      await screen.pressKey('ESCAPE')
      await screen.pressKey('ESCAPE')

      expect(await screen.frame()).not.toContain('Search settings')
      expect(focusedTextarea(screen)).toBe(search)
    }
  )

  test('standard rename takes letters as text and cancel returns to search', async () => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode: 'standard' })
    const search = await enterSearch(screen, 'standard')

    await screen.pressKey('x', { ctrl: true })
    await screen.pressKey('r')
    const rename = focusedTextarea(screen)
    expect(rename).not.toBe(search)

    await screen.typeText('qjke')
    expect(await screen.frame()).toContain('Rename Session')
    expect(rename.plainText).toBe('alphaqjke')

    await screen.pressKey('ESCAPE')
    expect(await screen.frame()).not.toContain('Rename Session')
    expect(rename.isDestroyed).toBe(true)
    expect(focusedTextarea(screen)).toBe(search)
    expect(search.plainText).toBe('')
  })

  test.each(MODES)(
    '%s cancelling a setting editor restores the Settings filter',
    async keybindMode => {
      screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })
      await openSettings(screen)
      await screen.replaceQuery('Editor Command')
      await screen.pressKey('RETURN')
      const editor = focusedTextarea(screen)
      expect(await screen.frame()).toContain('Edit value and press Enter')

      await screen.typeText('qjke')
      expect(editor.plainText).toContain('qjke')
      expect(await screen.frame()).toContain('Edit value and press Enter')
      await screen.pressKey('ESCAPE')

      expect(await screen.frame()).toContain(SETTINGS_HINT)
      expect(editor.isDestroyed).toBe(true)
      expect(focusedTextarea(screen).plainText).toBe('Editor Command')
    }
  )

  test('vim Normal mode leaves no text field focused after a modal closes', async () => {
    screen = await renderSessionScreen({ width: 120, height: 36 })

    await screen.pressKey('p', { ctrl: true })
    await screen.pressKey('ESCAPE')

    expect(screen.renderer.currentFocusedRenderable).toBeNull()
  })

  test.each(MODES)(
    '%s a palette command focuses its new field, not a destroyed one',
    async keybindMode => {
      screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })
      const search = await enterSearch(screen, keybindMode)

      await runPaletteCommand(screen, 'New session')

      expect(await screen.frame()).toContain('New Workspace')
      expect(search.isDestroyed).toBe(true)
      const input = focusedTextarea(screen)
      await screen.typeText('qj')
      expect(input.plainText).toBe('qj')
    }
  )
})
