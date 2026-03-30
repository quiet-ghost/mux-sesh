import { createContext, useContext, type ReactNode } from 'react'
import type {
  DesktopTheme,
  ThemeColorScheme,
  ThemeColors,
  ThemeDefinition,
  ThemeVariant,
} from '../types'
import { THEMES_A } from './opencode-themes-a'
import { THEMES_B } from './opencode-themes-b'

export const DEFAULT_THEME_ID = 'rosepine'
export const DEFAULT_COLOR_SCHEME: ThemeColorScheme = 'system'

export const BUILTIN_THEMES: Record<string, DesktopTheme> = {
  ...THEMES_A,
  ...THEMES_B,
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

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex).slice(1)
  const channel = (offset: number) => parseInt(normalized.slice(offset, offset + 2), 16)

  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(channel => clamp(channel).toString(16).padStart(2, '0')).join('')}`
}

function luminance(color: string) {
  const { r, g, b } = hexToRgb(color)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function readableText(background: string) {
  return luminance(background) > 150 ? '#171717' : '#f5f5f5'
}

const EXACT_TUI_THEME_COLORS: Partial<Record<string, Record<'light' | 'dark', ThemeColors>>> = {
  rosepine: {
    dark: {
      background: '#191724',
      surface: '#191724',
      surfaceAlt: '#26233a',
      surfaceModal: '#1f1d2e',
      overlay: '#000000',
      border: '#403d52',
      borderMuted: '#21202e',
      text: '#e0def4',
      textMuted: '#908caa',
      textSubtle: '#6e6a86',
      primary: '#9ccfd8',
      secondary: '#c4a7e7',
      accent: '#ebbcba',
      active: '#31748f',
      inactive: '#6e6a86',
      key: '#f6c177',
      action: '#ebbcba',
      separator: '#403d52',
      program: '#31748f',
      fileTree: '#9ccfd8',
      danger: '#eb6f92',
      dangerSurface: '#3a1f2d',
      selection: '#9ccfd8',
      selectionText: readableText('#9ccfd8'),
    },
    light: {
      background: '#faf4ed',
      surface: '#fffaf3',
      surfaceAlt: '#f2e9e1',
      surfaceModal: '#fffaf3',
      overlay: '#000000',
      border: '#dfdad9',
      borderMuted: '#f4ede8',
      text: '#575279',
      textMuted: '#797593',
      textSubtle: '#9893a5',
      primary: '#31748f',
      secondary: '#907aa9',
      accent: '#d7827e',
      active: '#286983',
      inactive: '#9893a5',
      key: '#ea9d34',
      action: '#d7827e',
      separator: '#dfdad9',
      program: '#286983',
      fileTree: '#31748f',
      danger: '#b4637a',
      dangerSurface: '#fce5e8',
      selection: '#31748f',
      selectionText: readableText('#31748f'),
    },
  },
  opencode: {
    dark: {
      background: '#0a0a0a',
      surface: '#141414',
      surfaceAlt: '#1e1e1e',
      surfaceModal: '#141414',
      overlay: '#000000',
      border: '#484848',
      borderMuted: '#3c3c3c',
      text: '#eeeeee',
      textMuted: '#a0a0a0',
      textSubtle: '#808080',
      primary: '#fab283',
      secondary: '#5c9cf5',
      accent: '#9d7cd8',
      active: '#7fd88f',
      inactive: '#808080',
      key: '#f5a742',
      action: '#56b6c2',
      separator: '#808080',
      program: '#7fd88f',
      fileTree: '#fab283',
      danger: '#e06c75',
      dangerSurface: '#37222c',
      selection: '#fab283',
      selectionText: readableText('#fab283'),
    },
    light: {
      background: '#ffffff',
      surface: '#fafafa',
      surfaceAlt: '#f5f5f5',
      surfaceModal: '#fafafa',
      overlay: '#000000',
      border: '#b8b8b8',
      borderMuted: '#d4d4d4',
      text: '#1a1a1a',
      textMuted: '#8a8a8a',
      textSubtle: '#a0a0a0',
      primary: '#3b7dd8',
      secondary: '#7b5bb6',
      accent: '#d68c27',
      active: '#3d9a57',
      inactive: '#8a8a8a',
      key: '#d68c27',
      action: '#318795',
      separator: '#8a8a8a',
      program: '#3d9a57',
      fileTree: '#3b7dd8',
      danger: '#d1383d',
      dangerSurface: '#f7d8db',
      selection: '#3b7dd8',
      selectionText: readableText('#3b7dd8'),
    },
  },
  'oc-2': {
    dark: {
      background: '#1f1f1f',
      surface: '#232323',
      surfaceAlt: '#282828',
      surfaceModal: '#232323',
      overlay: '#000000',
      border: '#282828',
      borderMuted: '#232323',
      text: '#ededed',
      textMuted: '#a0a0a0',
      textSubtle: '#707070',
      primary: '#fab283',
      secondary: '#034cff',
      accent: '#edb2f1',
      active: '#12c905',
      inactive: '#707070',
      key: '#fcd53a',
      action: '#edb2f1',
      separator: '#505050',
      program: '#00ceb9',
      fileTree: '#93e9f6',
      danger: '#fc533a',
      dangerSurface: '#1f0603',
      selection: '#fab283',
      selectionText: readableText('#fab283'),
    },
    light: {
      background: '#f8f8f8',
      surface: '#f3f3f3',
      surfaceAlt: '#ededed',
      surfaceModal: '#ffffff',
      overlay: '#000000',
      border: '#dbdbdb',
      borderMuted: '#e8e8e8',
      text: '#171717',
      textMuted: '#6f6f6f',
      textSubtle: '#8f8f8f',
      primary: '#dcde8d',
      secondary: '#034cff',
      accent: '#a753ae',
      active: '#12c905',
      inactive: '#8f8f8f',
      key: '#ffdc17',
      action: '#a753ae',
      separator: '#c7c7c7',
      program: '#00ceb9',
      fileTree: '#007b80',
      danger: '#fc533a',
      dangerSurface: '#fff2f0',
      selection: '#dcde8d',
      selectionText: readableText('#dcde8d'),
    },
  },
}

function mix(colorA: string, colorB: string, ratio: number) {
  const from = hexToRgb(colorA)
  const to = hexToRgb(colorB)

  return rgbToHex(
    from.r + (to.r - from.r) * ratio,
    from.g + (to.g - from.g) * ratio,
    from.b + (to.b - from.b) * ratio
  )
}

function aliasThemeID(themeId?: string) {
  if (themeId === 'rose-pine') {
    return 'rosepine'
  }

  if (themeId === 'opencode-dark' || themeId === 'opencode-light') {
    return 'opencode'
  }

  return themeId
}

function getColorSchemeFromColorFgbg(value?: string): 'light' | 'dark' | null {
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

export function getSystemColorScheme(): 'light' | 'dark' {
  const envOverride = process.env.MUX_SESH_COLOR_SCHEME
  if (envOverride === 'light' || envOverride === 'dark') {
    return envOverride
  }

  const detected = getColorSchemeFromColorFgbg(process.env.COLORFGBG)
  if (detected) {
    return detected
  }

  return 'dark'
}

function themeFromDefinition(id: string, definition: ThemeDefinition): DesktopTheme {
  return {
    id,
    name: definition.name ?? id,
    light: definition.light,
    dark: definition.dark,
  }
}

function pickVariant(
  theme: DesktopTheme,
  colorScheme: ThemeColorScheme
): { mode: 'light' | 'dark'; variant: ThemeVariant } {
  const mode = colorScheme === 'system' ? getSystemColorScheme() : colorScheme
  return {
    mode,
    variant: mode === 'light' ? theme.light : theme.dark,
  }
}

function resolveVariantTheme(theme: DesktopTheme, mode: 'light' | 'dark'): ThemeColors {
  const exactTheme = EXACT_TUI_THEME_COLORS[theme.id]?.[mode]
  if (exactTheme) {
    return exactTheme
  }

  const variant = mode === 'light' ? theme.light : theme.dark
  const palette = variant.palette
  const overrides = variant.overrides ?? {}
  const background = palette.neutral
  const ink = palette.ink
  const surface = overrides['surface-base'] ?? mix(background, ink, mode === 'dark' ? 0.08 : 0.035)
  const surfaceAlt =
    overrides['surface-raised-base'] ??
    overrides['surface-base-hover'] ??
    mix(background, ink, mode === 'dark' ? 0.13 : 0.06)
  const surfaceModal =
    overrides['surface-raised-stronger-non-alpha'] ??
    overrides['surface-raised-stronger'] ??
    overrides['surface-raised-base'] ??
    surface
  const borderMuted =
    overrides['border-weaker-base'] ?? mix(background, ink, mode === 'dark' ? 0.08 : 0.06)
  const border =
    overrides['border-weak-base'] ?? mix(background, ink, mode === 'dark' ? 0.16 : 0.12)
  const textMuted = overrides['text-base'] ?? mix(ink, background, mode === 'dark' ? 0.38 : 0.5)
  const textSubtle = overrides['text-weak'] ?? mix(ink, background, mode === 'dark' ? 0.55 : 0.66)
  const primary = palette.primary
  const secondary =
    overrides['markdown-heading'] ??
    overrides['syntax-constant'] ??
    palette.accent ??
    palette.primary
  const accent = overrides['markdown-link-text'] ?? palette.accent ?? palette.info
  const action = overrides['markdown-link-text'] ?? palette.info
  const fileTree = overrides['markdown-link'] ?? palette.info
  const program = overrides['markdown-code'] ?? palette.warning
  const separator = overrides['markdown-horizontal-rule'] ?? borderMuted
  const dangerSurface =
    overrides['surface-critical-base'] ??
    mix(background, palette.error, mode === 'dark' ? 0.2 : 0.12)
  const selection = palette.primary

  return {
    background,
    surface,
    surfaceAlt,
    surfaceModal,
    overlay: mix(background, ink, mode === 'dark' ? 0.2 : 0.04),
    border,
    borderMuted,
    text: overrides['text-strong'] ?? overrides['markdown-text'] ?? ink,
    textMuted,
    textSubtle,
    primary,
    secondary,
    accent,
    active: palette.success,
    inactive: textSubtle,
    key: palette.warning,
    action,
    separator,
    program,
    fileTree,
    danger: palette.error,
    dangerSurface,
    selection,
    selectionText: readableText(selection),
  }
}

export function resolveTheme(
  themeId?: string,
  customThemes: Record<string, ThemeDefinition> = {},
  colorScheme: ThemeColorScheme = DEFAULT_COLOR_SCHEME
) {
  const customCatalog = Object.fromEntries(
    Object.entries(customThemes).map(([id, definition]) => [
      id,
      themeFromDefinition(id, definition),
    ])
  )
  const catalog = {
    ...BUILTIN_THEMES,
    ...customCatalog,
  }
  const normalizedID = aliasThemeID(themeId)
  const id = normalizedID && catalog[normalizedID] ? normalizedID : DEFAULT_THEME_ID
  const theme = catalog[id] ?? BUILTIN_THEMES[DEFAULT_THEME_ID]
  const { mode } = pickVariant(theme, colorScheme)

  return {
    id,
    name: theme.name,
    mode,
    colors: resolveVariantTheme(theme, mode),
    catalog,
  }
}

export function getPanelStyle(theme: ThemeColors, width: 'split' | 'full' = 'split') {
  return {
    border: false,
    backgroundColor: theme.surface,
    paddingTop: 0.4,
    paddingBottom: 0.4,
    paddingLeft: 1,
    paddingRight: 1,
    width: width === 'full' ? ('100%' as const) : ('50%' as const),
    height: '100%' as const,
  }
}

export function getDetailPanelStyle(theme: ThemeColors) {
  return {
    ...getPanelStyle(theme, 'split'),
    backgroundColor: theme.surface,
  }
}

export function getModalStyle(theme: ThemeColors, columns: number, preferredWidth = 76) {
  return {
    width: Math.max(48, Math.min(columns - 8, preferredWidth)),
    backgroundColor: theme.surfaceModal,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 2,
    paddingRight: 2,
    flexDirection: 'column' as const,
  }
}

const ThemeContext = createContext<ThemeColors>(EXACT_TUI_THEME_COLORS.rosepine!.dark)

export function ThemeProvider(props: { theme: ThemeColors; children: ReactNode }) {
  return <ThemeContext.Provider value={props.theme}>{props.children}</ThemeContext.Provider>
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext)
}
