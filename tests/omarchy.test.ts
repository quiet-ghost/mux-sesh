import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  getOmarchyColorsPath,
  getOmarchyThemeNamePath,
  isOmarchyPresent,
  omarchyPaletteToThemeColors,
  parseOmarchyColorsToml,
  readOmarchyPalette,
} from '../src/styles/omarchy'

const fixtureDir = join(import.meta.dir, 'fixtures', 'omarchy')

async function readFixture(name: string): Promise<string> {
  return await Bun.file(join(fixtureDir, name)).text()
}

describe('omarchy paths', () => {
  test('builds theme.name and colors.toml under the injected home dir', () => {
    expect(getOmarchyColorsPath('/tmp/fake-home')).toBe(
      '/tmp/fake-home/.local/state/omarchy/current/theme/colors.toml'
    )
    expect(getOmarchyThemeNamePath('/tmp/fake-home')).toBe(
      '/tmp/fake-home/.local/state/omarchy/current/theme.name'
    )
  })
})

describe('parseOmarchyColorsToml', () => {
  test('parses rose-pine-dark fixture keys', async () => {
    const palette = parseOmarchyColorsToml(await readFixture('rose-pine-dark.toml'))

    expect(palette).not.toBeNull()
    expect(palette?.mode).toBe('dark')
    expect(palette?.background).toBe('#191724')
    expect(palette?.foreground).toBe('#e0def4')
    expect(palette?.accent).toBe('#ebbcba')
  })

  test('parses light-sample fixture mode and background', async () => {
    const palette = parseOmarchyColorsToml(await readFixture('light-sample.toml'))

    expect(palette?.mode).toBe('light')
    expect(palette?.background).toBe('#eff1f5')
  })

  test('accepts comments, blank lines, and short hex', () => {
    const palette = parseOmarchyColorsToml(`
# comment
background = "#abc"

foreground = "#def"
`)

    expect(palette?.background).toBe('#aabbcc')
    expect(palette?.foreground).toBe('#ddeeff')
  })

  test('accepts unquoted hex', () => {
    const palette = parseOmarchyColorsToml(`background = #191724
foreground = #e0def4
`)

    expect(palette?.background).toBe('#191724')
    expect(palette?.foreground).toBe('#e0def4')
  })

  test('returns null when background is missing', () => {
    expect(parseOmarchyColorsToml('foreground = "#e0def4"\n')).toBeNull()
  })

  test('returns null when background is not hex', () => {
    expect(parseOmarchyColorsToml('background = "nope"\nforeground = "#e0def4"\n')).toBeNull()
  })

  test('infers dark mode from background luminance when mode is absent', () => {
    const palette = parseOmarchyColorsToml(`background = "#191724"
foreground = "#e0def4"
`)

    expect(palette?.mode).toBe('dark')
  })
})

describe('readOmarchyPalette', () => {
  test('returns null when the omarchy colors file is absent', () => {
    expect(readOmarchyPalette('/tmp/does-not-exist-omarchy')).toBeNull()
  })

  test('reads a colors.toml written under a fake home dir', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'mux-sesh-omarchy-'))
    const colorsPath = getOmarchyColorsPath(homeDir)

    try {
      await mkdir(dirname(colorsPath), { recursive: true })
      await writeFile(colorsPath, await readFixture('rose-pine-dark.toml'))

      const palette = readOmarchyPalette(homeDir)
      expect(palette?.background).toBe('#191724')
      expect(palette?.accent).toBe('#ebbcba')
    } finally {
      await rm(homeDir, { recursive: true, force: true })
    }
  })
})

describe('isOmarchyPresent', () => {
  test('is false for an empty temp home and true after writing colors.toml', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'mux-sesh-omarchy-present-'))
    const colorsPath = getOmarchyColorsPath(homeDir)

    try {
      expect(isOmarchyPresent(homeDir)).toBe(false)

      await mkdir(dirname(colorsPath), { recursive: true })
      await writeFile(colorsPath, await readFixture('rose-pine-dark.toml'))

      expect(isOmarchyPresent(homeDir)).toBe(true)
    } finally {
      await rm(homeDir, { recursive: true, force: true })
    }
  })
})

describe('omarchyPaletteToThemeColors', () => {
  test('maps rose-pine-dark onto ThemeColors', async () => {
    const palette = parseOmarchyColorsToml(await readFixture('rose-pine-dark.toml'))
    expect(palette).not.toBeNull()
    if (!palette) {
      return
    }

    const colors = omarchyPaletteToThemeColors(palette)

    expect(colors.background).toBe('#191724')
    expect(colors.surface).toBe('#191724')
    expect(colors.surfaceAlt).toBe('#26233a')
    expect(colors.surfaceModal).toBe('#13111b')
    expect(colors.overlay).toBe('#000000')
    expect(colors.border).toBe('#6e6a86')
    expect(colors.borderMuted).toBe('#6e6a86')
    expect(colors.text).toBe('#e0def4')
    expect(colors.textMuted).toBe('#6e6a86')
    expect(colors.textSubtle).toBe('#6e6a86')
    expect(colors.primary).toBe('#9ccfd8')
    expect(colors.secondary).toBe('#c4a7e7')
    expect(colors.accent).toBe('#ebbcba')
    expect(colors.active).toBe('#31748f')
    expect(colors.inactive).toBe('#6e6a86')
    expect(colors.key).toBe('#f6c177')
    expect(colors.action).toBe('#ebbcba')
    expect(colors.separator).toBe('#6e6a86')
    expect(colors.program).toBe('#31748f')
    expect(colors.fileTree).toBe('#9ccfd8')
    expect(colors.danger).toBe('#eb6f92')
    expect(colors.dangerSurface).toBe('#43293a')
    expect(colors.selection).toBe('#9ccfd8')
    expect(colors.selectionText).toBe('#171717')
  })

  test('keeps vantablack surfaces black and uses cyan-like roles for chrome', async () => {
    const palette = parseOmarchyColorsToml(await readFixture('vantablack.toml'))
    expect(palette).not.toBeNull()
    if (!palette) {
      return
    }

    const colors = omarchyPaletteToThemeColors(palette)

    expect(colors.background).toBe('#000000')
    expect(colors.surface).toBe('#000000')
    expect(colors.surfaceAlt).toBe('#1a1a1a')
    expect(colors.surfaceModal).toBe('#090909')
    expect(colors.primary).toBe('#b0b0b0')
    expect(colors.accent).toBe('#8d8d8d')
    expect(colors.action).toBe('#8d8d8d')
    expect(colors.selection).toBe('#b0b0b0')
    expect(colors.selectionText).toBe('#171717')
    expect(colors.textMuted).toBe('#7a7a7a')
  })
})
