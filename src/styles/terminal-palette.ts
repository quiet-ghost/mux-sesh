import type { ThemeColors } from '../types'

export type TerminalMode = 'light' | 'dark'

export interface TerminalColorsInput {
  palette?: Array<string | null | undefined>
  defaultForeground?: string | null
  defaultBackground?: string | null
  highlightBackground?: string | null
  highlightForeground?: string | null
}

export interface TerminalPalette {
  mode: TerminalMode
  background: string
  foreground: string
  palette: Array<string | undefined>
  highlightBackground?: string
  highlightForeground?: string
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function normalizeHex(color: string): string | null {
  const trimmed = color.trim()
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed

  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(hex)) {
    return null
  }

  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map(char => `${char}${char}`)
      .join('')}`
  }

  return `#${hex.slice(0, 6)}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.slice(1)
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

function asHex(value?: string | null): string | undefined {
  return value ? (normalizeHex(value) ?? undefined) : undefined
}

export function colorSchemeFromColorFgbg(value?: string): TerminalMode | null {
  if (!value) {
    return null
  }

  const parts = value
    .split(';')
    .map(part => Number.parseInt(part, 10))
    .filter(part => Number.isInteger(part))

  const background = parts.at(-1)
  if (background === undefined) {
    return null
  }

  return background <= 6 || background === 8 ? 'dark' : 'light'
}

export function terminalColorsToPalette(colors: TerminalColorsInput): TerminalPalette | null {
  const ansi = (colors.palette ?? []).map(entry => asHex(entry))
  const background = asHex(colors.defaultBackground) ?? ansi[0]
  const foreground = asHex(colors.defaultForeground) ?? ansi[7]

  if (!background || !foreground) {
    return null
  }

  return {
    mode: luminance(background) > 150 ? 'light' : 'dark',
    background,
    foreground,
    palette: ansi,
    highlightBackground: asHex(colors.highlightBackground),
    highlightForeground: asHex(colors.highlightForeground),
  }
}

export function terminalPaletteToThemeColors(palette: TerminalPalette): ThemeColors {
  const background = palette.background
  const text = palette.foreground
  const ansi = palette.palette
  const muted = ansi[8] ?? mix(text, background, 0.5)
  const chrome = ansi[6] ?? ansi[4] ?? text
  const accent = chrome
  const danger = ansi[1] ?? text
  const selection = palette.highlightBackground ?? chrome

  return {
    background,
    surface: background,
    surfaceAlt: mix(background, text, 0.08),
    surfaceModal: mix(background, text, 0.04),
    overlay: '#000000',
    border: muted,
    borderMuted: muted,
    text,
    textMuted: muted,
    textSubtle: muted,
    primary: chrome,
    secondary: ansi[5] ?? accent,
    accent,
    active: ansi[2] ?? text,
    inactive: muted,
    key: ansi[3] ?? text,
    action: accent,
    separator: muted,
    program: ansi[2] ?? text,
    fileTree: chrome,
    danger,
    dangerSurface: mix(background, danger, 0.2),
    selection,
    selectionText: palette.highlightForeground ?? readableText(selection),
  }
}
