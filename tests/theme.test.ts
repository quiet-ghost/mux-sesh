import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { getOmarchyColorsPath, parseOmarchyColorsToml } from '../src/styles/omarchy'
import { getSystemColorScheme, resolveTheme } from '../src/styles/theme'

const originalColorFgbg = process.env.COLORFGBG
const originalSchemeOverride = process.env.MUX_SESH_COLOR_SCHEME
const fixtureDir = join(import.meta.dir, 'fixtures', 'omarchy')

afterEach(() => {
  process.env.COLORFGBG = originalColorFgbg
  process.env.MUX_SESH_COLOR_SCHEME = originalSchemeOverride
})

async function readFixture(name: string): Promise<string> {
  return await Bun.file(join(fixtureDir, name)).text()
}

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

  test('system theme uses an injected Omarchy palette', async () => {
    const palette = parseOmarchyColorsToml(await readFixture('rose-pine-dark.toml'))
    expect(palette).not.toBeNull()
    if (!palette) {
      return
    }

    const resolved = resolveTheme('system', {}, 'system', { omarchyPalette: palette })

    expect(resolved.id).toBe('system')
    expect(resolved.name).toBe('System')
    expect(resolved.mode).toBe('dark')
    expect(resolved.colors.background).toBe('#191724')
    expect(resolved.colors.primary).toBe('#9ccfd8')
  })

  test('locked color scheme changes reported mode but not Omarchy colors', async () => {
    const palette = parseOmarchyColorsToml(await readFixture('rose-pine-dark.toml'))
    expect(palette).not.toBeNull()
    if (!palette) {
      return
    }

    const resolved = resolveTheme('system', {}, 'light', { omarchyPalette: palette })

    expect(resolved.mode).toBe('light')
    expect(resolved.colors.background).toBe('#191724')
  })

  test('system theme uses an injected terminal palette when Omarchy is absent', () => {
    const resolved = resolveTheme('system', {}, 'system', {
      omarchyPalette: null,
      terminalPalette: {
        mode: 'dark',
        background: '#0b0b0b',
        foreground: '#f2f2f2',
        palette: ['#0b0b0b', '#cc3333', '#33cc33', '#cccc33', '#3333cc', '#cc33cc', '#33cccc', '#f2f2f2'],
      },
    })

    expect(resolved.id).toBe('system')
    expect(resolved.name).toBe('System')
    expect(resolved.mode).toBe('dark')
    expect(resolved.colors.background).toBe('#0b0b0b')
    expect(resolved.colors.primary).toBe('#33cccc')
  })

  test('Omarchy palette wins over an injected terminal palette', async () => {
    const palette = parseOmarchyColorsToml(await readFixture('rose-pine-dark.toml'))
    expect(palette).not.toBeNull()
    if (!palette) {
      return
    }

    const resolved = resolveTheme('system', {}, 'system', {
      omarchyPalette: palette,
      terminalPalette: {
        mode: 'dark',
        background: '#0b0b0b',
        foreground: '#f2f2f2',
        palette: [],
      },
    })

    expect(resolved.colors.background).toBe('#191724')
    expect(resolved.colors.primary).toBe('#9ccfd8')
  })

  test('system theme falls back to rose pine when Omarchy and terminal palettes are absent', () => {
    const resolved = resolveTheme('system', {}, 'system', {
      omarchyPalette: null,
      terminalPalette: null,
    })

    expect(resolved.id).toBe('rosepine')
    expect(resolved.colors.background).toBe('#191724')
  })

  test('named themes ignore an injected Omarchy palette', async () => {
    const palette = parseOmarchyColorsToml(await readFixture('catppuccin.toml'))
    expect(palette).not.toBeNull()
    if (!palette) {
      return
    }

    const resolved = resolveTheme('rosepine', {}, 'dark', { omarchyPalette: palette })

    expect(resolved.id).toBe('rosepine')
    expect(resolved.colors.primary).toBe('#9ccfd8')
  })

  test('system theme reads colors.toml from an injected home dir', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'mux-sesh-theme-omarchy-'))
    const colorsPath = getOmarchyColorsPath(homeDir)

    try {
      await mkdir(dirname(colorsPath), { recursive: true })
      await writeFile(colorsPath, await readFixture('rose-pine-dark.toml'))

      const resolved = resolveTheme('system', {}, 'system', { homeDir })

      expect(resolved.id).toBe('system')
      expect(resolved.colors.background).toBe('#191724')
    } finally {
      await rm(homeDir, { recursive: true, force: true })
    }
  })

  test('system theme falls back when the injected home dir has no Omarchy files', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'mux-sesh-theme-empty-'))

    try {
      const resolved = resolveTheme('system', {}, 'system', { homeDir, terminalPalette: null })

      expect(resolved.id).toBe('rosepine')
    } finally {
      await rm(homeDir, { recursive: true, force: true })
    }
  })
})
