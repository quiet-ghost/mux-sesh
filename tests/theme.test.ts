import { afterEach, describe, expect, test } from 'bun:test'
import { getSystemColorScheme, resolveTheme } from '../src/styles/theme'

const originalColorFgbg = process.env.COLORFGBG
const originalSchemeOverride = process.env.MUX_SESH_COLOR_SCHEME

afterEach(() => {
  process.env.COLORFGBG = originalColorFgbg
  process.env.MUX_SESH_COLOR_SCHEME = originalSchemeOverride
})

describe('theme resolution', () => {
  test('uses opencode desktop built-ins and rose pine heading color for dark mode', () => {
    const resolved = resolveTheme('rosepine', {}, 'dark')

    expect(resolved.name).toBe('Rose Pine')
    expect(resolved.colors.primary).toBe('#9ccfd8')
    expect(resolved.colors.secondary).toBe('#c4a7e7')
    expect(resolved.colors.background).toBe('#191724')
  })

  test('resolves light mode separately from dark mode', () => {
    const resolved = resolveTheme('rosepine', {}, 'light')

    expect(resolved.mode).toBe('light')
    expect(resolved.colors.background).toBe('#faf4ed')
    expect(resolved.colors.primary).toBe('#31748f')
    expect(resolved.colors.secondary).toBe('#907aa9')
  })

  test('system mode follows COLORFGBG when available', () => {
    process.env.COLORFGBG = '15;0'
    expect(getSystemColorScheme()).toBe('dark')

    process.env.COLORFGBG = '0;15'
    expect(getSystemColorScheme()).toBe('light')
  })
})
