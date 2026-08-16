import { createContext, useContext, type ReactNode } from 'react'
import type {
  DesktopTheme,
  ThemeColorScheme,
  ThemeColors,
  ThemeDefinition,
  ThemeVariant,
} from '../types'
import { getHomeDir } from '../config/paths'
import { TUI_THEME_COLORS } from './opencode-tui-colors'
import { THEMES_A } from './opencode-themes-a'
import { THEMES_B } from './opencode-themes-b'
import {
  omarchyPaletteToThemeColors,
  readOmarchyPalette,
  type OmarchyPalette,
} from './omarchy'
import {
  colorSchemeFromColorFgbg,
  terminalPaletteToThemeColors,
  type TerminalPalette,
} from './terminal-palette'

export const DEFAULT_THEME_ID = 'rosepine'
export const DEFAULT_COLOR_SCHEME: ThemeColorScheme = 'system'
export const SYSTEM_THEME_ID = 'system'

export interface ResolveThemeOptions {
  homeDir?: string
  omarchyPalette?: OmarchyPalette | null
  terminalPalette?: TerminalPalette | null
}

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

const EXACT_TUI_THEME_COLORS: Partial<Record<string, Record<'light' | 'dark', ThemeColors>>> =
  TUI_THEME_COLORS

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

export function getSystemColorScheme(): 'light' | 'dark' {
  const envOverride = process.env.MUX_SESH_COLOR_SCHEME
  if (envOverride === 'light' || envOverride === 'dark') {
    return envOverride
  }

  const detected = colorSchemeFromColorFgbg(process.env.COLORFGBG)
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
  colorScheme: ThemeColorScheme = DEFAULT_COLOR_SCHEME,
  options: ResolveThemeOptions = {}
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

  if (normalizedID === SYSTEM_THEME_ID) {
    const palette =
      options.omarchyPalette !== undefined
        ? options.omarchyPalette
        : readOmarchyPalette(options.homeDir ?? getHomeDir())

    if (palette) {
      const mode = colorScheme === 'system' ? palette.mode : colorScheme
      return {
        id: SYSTEM_THEME_ID,
        name: 'System',
        mode,
        colors: omarchyPaletteToThemeColors(palette),
        catalog,
      }
    }

    if (options.terminalPalette) {
      const mode = colorScheme === 'system' ? options.terminalPalette.mode : colorScheme
      return {
        id: SYSTEM_THEME_ID,
        name: 'System',
        mode,
        colors: terminalPaletteToThemeColors(options.terminalPalette),
        catalog,
      }
    }
  }

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

const ThemeContext = createContext<ThemeColors>(resolveTheme(DEFAULT_THEME_ID, {}, 'dark').colors)

export function ThemeProvider(props: { theme: ThemeColors; children: ReactNode }) {
  return <ThemeContext.Provider value={props.theme}>{props.children}</ThemeContext.Provider>
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext)
}
