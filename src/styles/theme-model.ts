export type ThemeColorScheme = 'light' | 'dark' | 'system'

export interface ThemePalette {
  neutral: string
  ink: string
  primary: string
  success: string
  warning: string
  error: string
  info: string
  accent?: string
  interactive?: string
  diffAdd?: string
  diffDelete?: string
}

export interface ThemeVariant {
  palette: ThemePalette
  overrides?: Record<string, string>
}

export interface DesktopTheme {
  name: string
  id: string
  light: ThemeVariant
  dark: ThemeVariant
}

export interface ThemeColors {
  background: string
  surface: string
  surfaceAlt: string
  surfaceModal: string
  overlay: string
  border: string
  borderMuted: string
  text: string
  textMuted: string
  textSubtle: string
  primary: string
  secondary: string
  accent: string
  active: string
  inactive: string
  key: string
  action: string
  separator: string
  program: string
  fileTree: string
  danger: string
  dangerSurface: string
  selection: string
  selectionText: string
}

export interface ThemeDefinition {
  name?: string
  light: ThemeVariant
  dark: ThemeVariant
}
