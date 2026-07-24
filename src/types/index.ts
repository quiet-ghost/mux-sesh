import type { OpencodeStats } from '../opencode/types'

export enum AppMode {
  Normal,
  Search,
  NewSession,
  AgentsManage,
}

export enum ViewMode {
  Sessions,
  Projects,
}

export type KeybindMode = 'vim' | 'standard'
export type ZoxideMode = 'off' | 'rank' | 'merge'
export type ItemKind = 'tmux' | 'configured' | 'project' | 'file'
export type SortOrder = 'live-first' | 'configured-first' | 'zoxide-first' | 'alphabetical'

export interface IconConfig {
  tmux: string
  configured: string
  project: string
  opencode: string
}

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

export interface SessionDefaults {
  startupCommand?: string
  previewCommand?: string
}

export interface ProjectProfile {
  path: string
  sessionName?: string
  startupCommand?: string
  previewCommand?: string
  listed?: boolean
  icon?: string
}

export interface ProjectWildcard {
  pattern: string
  sessionName?: string
  startupCommand?: string
  previewCommand?: string
}

export type OpencodeSessionStats = OpencodeStats

export type OpencodeStatsState =
  | { status: 'loading' }
  | { status: 'ready'; stats: OpencodeSessionStats }
  | { status: 'missing'; message: string }
  | { status: 'error'; message: string }

export interface SearchMatchMetadata {
  titleIndices?: number[]
  descIndices?: number[]
}

export interface Item {
  title: string
  desc: string
  path: string
  isSession: boolean
  itemKind?: ItemKind
  icon?: string
  isPinned?: boolean
  isAttached?: boolean
  linkedSessionName?: string
  linkedSessionAttached?: boolean
  windowCount?: string
  createdAt?: number
  lastActivity?: number
  opencodeState?: OpencodeStatsState
  searchMatch?: SearchMatchMetadata
}

export interface Config {
  projectPaths: string[]
  reposPath: string
  editor: string
  editorCmd: string
  keybindMode?: KeybindMode
  prefixKey?: string
  autoUpdate?: boolean
  dirLength?: number
  hiddenSessions?: string[]
  pinnedSessions?: string[]
  zoxideMode?: ZoxideMode
  sortOrder?: SortOrder
  theme?: string
  colorScheme?: ThemeColorScheme
  themes?: Record<string, ThemeDefinition>
  icons?: IconConfig
  defaultSession?: SessionDefaults
  projects?: ProjectProfile[]
  wildcards?: ProjectWildcard[]
}

export interface WindowInfo {
  index: string
  name: string
  currentPath: string
  currentCommand: string
}

export interface SessionDetails {
  name: string
  isAttached: boolean
  windowCount: string
  windows: WindowInfo[]
  panePreviewLines?: string[]
}

export interface SearchResult {
  item: Item
  score: number
}

export interface FuzzyMatch {
  score: number
  indices: number[]
}

export type InstallMethod = 'npm' | 'bun' | 'brew' | 'source' | 'unknown'

export type UpdateEvent =
  | {
      kind: 'updated'
      currentVersion: string
      version: string
      installMethod: InstallMethod
    }
  | {
      kind: 'available'
      currentVersion: string
      version: string
      installMethod: InstallMethod
    }
  | {
      kind: 'failed'
      currentVersion: string
      version: string
      installMethod: InstallMethod
    }

export type UpdateEventListener = (event: UpdateEvent) => void
