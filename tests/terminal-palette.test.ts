import { describe, expect, test } from 'bun:test'
import {
  colorSchemeFromColorFgbg,
  terminalColorsToPalette,
  terminalPaletteToThemeColors,
} from '../src/styles/terminal-palette'

describe('colorSchemeFromColorFgbg', () => {
  test('treats background 0-6 and 8 as dark', () => {
    expect(colorSchemeFromColorFgbg('15;0')).toBe('dark')
    expect(colorSchemeFromColorFgbg('7;8')).toBe('dark')
  })

  test('treats other backgrounds as light', () => {
    expect(colorSchemeFromColorFgbg('0;15')).toBe('light')
    expect(colorSchemeFromColorFgbg('0;7')).toBe('light')
  })

  test('returns null for missing or garbage values', () => {
    expect(colorSchemeFromColorFgbg(undefined)).toBeNull()
    expect(colorSchemeFromColorFgbg('')).toBeNull()
    expect(colorSchemeFromColorFgbg('nope')).toBeNull()
  })
})

describe('terminalColorsToPalette', () => {
  test('uses default background and foreground when present', () => {
    const palette = terminalColorsToPalette({
      defaultBackground: '#1a1a1a',
      defaultForeground: '#eeeeee',
      palette: ['#000000', '#cc0000', '#00cc00', '#cccc00', '#0000cc', '#cc00cc', '#00cccc', '#dddddd'],
    })

    expect(palette?.mode).toBe('dark')
    expect(palette?.background).toBe('#1a1a1a')
    expect(palette?.foreground).toBe('#eeeeee')
  })

  test('falls back to ANSI 0 and 7 when defaults are missing', () => {
    const palette = terminalColorsToPalette({
      palette: ['#111111', null, null, null, null, null, null, '#f0f0f0'],
    })

    expect(palette?.background).toBe('#111111')
    expect(palette?.foreground).toBe('#f0f0f0')
  })

  test('returns null without a background and foreground', () => {
    expect(terminalColorsToPalette({ palette: [] })).toBeNull()
    expect(terminalColorsToPalette({ defaultBackground: '#000000' })).toBeNull()
  })
})

describe('terminalPaletteToThemeColors', () => {
  test('maps ANSI roles onto ThemeColors', () => {
    const palette = terminalColorsToPalette({
      defaultBackground: '#000000',
      defaultForeground: '#e5e5e5',
      highlightBackground: '#5c5cff',
      highlightForeground: '#ffffff',
      palette: [
        '#000000',
        '#cd0000',
        '#00cd00',
        '#cdcd00',
        '#0000ee',
        '#cd00cd',
        '#00cdcd',
        '#e5e5e5',
        '#7f7f7f',
        '#ff0000',
        '#00ff00',
        '#ffff00',
        '#5c5cff',
        '#ff00ff',
        '#00ffff',
        '#ffffff',
      ],
    })

    expect(palette).not.toBeNull()
    if (!palette) {
      return
    }

    const colors = terminalPaletteToThemeColors(palette)

    expect(colors.background).toBe('#000000')
    expect(colors.surface).toBe('#000000')
    expect(colors.text).toBe('#e5e5e5')
    expect(colors.primary).toBe('#00cdcd')
    expect(colors.accent).toBe('#00cdcd')
    expect(colors.secondary).toBe('#cd00cd')
    expect(colors.active).toBe('#00cd00')
    expect(colors.danger).toBe('#cd0000')
    expect(colors.key).toBe('#cdcd00')
    expect(colors.textMuted).toBe('#7f7f7f')
    expect(colors.selection).toBe('#5c5cff')
    expect(colors.selectionText).toBe('#ffffff')
  })
})
