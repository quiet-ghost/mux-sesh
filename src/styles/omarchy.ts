import { existsSync, readFileSync } from 'node:fs'
import { join } from 'path'
import type { ThemeColors } from '../types'

export const OMARCHY_STATE_DIR = ['.local', 'state', 'omarchy', 'current'] as const

export type OmarchyMode = 'light' | 'dark'

export interface OmarchyPalette {
  mode: OmarchyMode
  background: string
  foreground: string
  accent?: string
  selection?: string
  muted?: string
  dark_background?: string
  darker_background?: string
  lighter_background?: string
  dark_foreground?: string
  light_foreground?: string
  bright_foreground?: string
  red?: string
  yellow?: string
  orange?: string
  green?: string
  cyan?: string
  blue?: string
  magenta?: string
  brown?: string
  bright_red?: string
  bright_yellow?: string
  bright_green?: string
  bright_cyan?: string
  bright_blue?: string
  bright_magenta?: string
}

const COLOR_KEYS = [
  'background',
  'foreground',
  'accent',
  'selection',
  'muted',
  'dark_background',
  'darker_background',
  'lighter_background',
  'dark_foreground',
  'light_foreground',
  'bright_foreground',
  'red',
  'yellow',
  'orange',
  'green',
  'cyan',
  'blue',
  'magenta',
  'brown',
  'bright_red',
  'bright_yellow',
  'bright_green',
  'bright_cyan',
  'bright_blue',
  'bright_magenta',
] as const

type OmarchyColorKey = (typeof COLOR_KEYS)[number]

const COLOR_KEY_SET = new Set<string>(COLOR_KEYS)

function isOmarchyColorKey(key: string): key is OmarchyColorKey {
  return COLOR_KEY_SET.has(key)
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function normalizeHex(color: string): string {
  const normalized = color.startsWith('#') ? color.slice(1) : color

  if (normalized.length === 3 || normalized.length === 4) {
    return `#${normalized
      .split('')
      .map(char => `${char}${char}`)
      .join('')}`
  }

  return color.startsWith('#') ? color : `#${color}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex).slice(1)
  const channel = (offset: number) => parseInt(normalized.slice(offset, offset + 2), 16)

  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(channel => clamp(channel).toString(16).padStart(2, '0')).join('')}`
}

function luminance(color: string): number {
  const { r, g, b } = hexToRgb(color)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function readableText(background: string): string {
  return luminance(background) > 150 ? '#171717' : '#f5f5f5'
}

function mix(colorA: string, colorB: string, ratio: number): string {
  const from = hexToRgb(colorA)
  const to = hexToRgb(colorB)

  return rgbToHex(
    from.r + (to.r - from.r) * ratio,
    from.g + (to.g - from.g) * ratio,
    from.b + (to.b - from.b) * ratio
  )
}

function parseHexColor(value: string): string | null {
  const unquoted = stripQuotes(value)
  const hex = unquoted.startsWith('#') ? unquoted.slice(1) : unquoted

  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{4}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(hex)) {
    return null
  }

  return normalizeHex(`#${hex}`)
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1)
  }

  return value
}

function parseMode(value: string): OmarchyMode | null {
  const normalized = stripQuotes(value).toLowerCase()
  return normalized === 'light' || normalized === 'dark' ? normalized : null
}

export function getOmarchyThemeNamePath(homeDir: string): string {
  return join(homeDir, ...OMARCHY_STATE_DIR, 'theme.name')
}

export function getOmarchyColorsPath(homeDir: string): string {
  return join(homeDir, ...OMARCHY_STATE_DIR, 'theme', 'colors.toml')
}

export function isOmarchyPresent(homeDir: string): boolean {
  return existsSync(getOmarchyColorsPath(homeDir))
}

export function parseOmarchyColorsToml(text: string): OmarchyPalette | null {
  const colors: Partial<Record<OmarchyColorKey, string>> = {}
  let mode: OmarchyMode | null = null
  let themeType: OmarchyMode | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separator = line.indexOf('=')
    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (key === 'mode') {
      mode = parseMode(value) ?? mode
      continue
    }

    if (key === 'theme_type') {
      themeType = parseMode(value) ?? themeType
      continue
    }

    if (!isOmarchyColorKey(key)) {
      continue
    }

    const color = parseHexColor(value)
    if (!color) {
      if (key === 'background' || key === 'foreground') {
        return null
      }
      continue
    }

    colors[key] = color
  }

  const background = colors.background
  const foreground = colors.foreground
  if (!background || !foreground) {
    return null
  }

  const resolvedMode = mode ?? themeType ?? (luminance(background) > 150 ? 'light' : 'dark')

  return {
    mode: resolvedMode,
    background,
    foreground,
    accent: colors.accent,
    selection: colors.selection,
    muted: colors.muted,
    dark_background: colors.dark_background,
    darker_background: colors.darker_background,
    lighter_background: colors.lighter_background,
    dark_foreground: colors.dark_foreground,
    light_foreground: colors.light_foreground,
    bright_foreground: colors.bright_foreground,
    red: colors.red,
    yellow: colors.yellow,
    orange: colors.orange,
    green: colors.green,
    cyan: colors.cyan,
    blue: colors.blue,
    magenta: colors.magenta,
    brown: colors.brown,
    bright_red: colors.bright_red,
    bright_yellow: colors.bright_yellow,
    bright_green: colors.bright_green,
    bright_cyan: colors.bright_cyan,
    bright_blue: colors.bright_blue,
    bright_magenta: colors.bright_magenta,
  }
}

export function readOmarchyPalette(homeDir: string): OmarchyPalette | null {
  try {
    const colorsPath = getOmarchyColorsPath(homeDir)
    if (!existsSync(colorsPath)) {
      return null
    }

    return parseOmarchyColorsToml(readFileSync(colorsPath, 'utf8'))
  } catch {
    return null
  }
}

export function omarchyPaletteToThemeColors(palette: OmarchyPalette): ThemeColors {
  const background = palette.background
  const text = palette.foreground
  const muted = palette.muted ?? palette.dark_foreground ?? mix(text, background, 0.5)
  const chrome = palette.cyan ?? palette.blue ?? palette.accent ?? text
  const accent = palette.accent ?? palette.orange ?? chrome
  const danger = palette.red ?? palette.bright_red ?? text
  const selection = chrome

  return {
    background,
    surface: background,
    surfaceAlt: palette.lighter_background ?? mix(background, text, 0.08),
    surfaceModal: palette.dark_background ?? mix(background, text, 0.04),
    overlay: '#000000',
    border: muted,
    borderMuted: palette.dark_foreground ?? muted,
    text,
    textMuted: muted,
    textSubtle: muted,
    primary: chrome,
    secondary: palette.magenta ?? accent,
    accent,
    active: palette.green ?? palette.bright_green ?? text,
    inactive: muted,
    key: palette.yellow ?? palette.bright_yellow ?? palette.orange ?? text,
    action: accent,
    separator: muted,
    program: palette.green ?? palette.bright_green ?? text,
    fileTree: chrome,
    danger,
    dangerSurface: mix(background, danger, 0.2),
    selection,
    selectionText: readableText(selection),
  }
}
