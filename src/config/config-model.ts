import type { BackendPreference } from '../multiplexer/types'
import type { ThemeColorScheme, ThemeDefinition } from '../styles/theme-model'

export type KeybindMode = 'vim' | 'standard'

export type ZoxideMode = 'off' | 'rank' | 'merge'

export type SortOrder = 'live-first' | 'configured-first' | 'zoxide-first' | 'alphabetical'

export interface IconConfig {
  tmux: string
  herdr: string
  configured: string
  project: string
  opencode: string
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

export interface Config {
  backend?: BackendPreference
  projectPaths: string[]
  reposPath: string
  editor: string
  editorCmd: string
  keybindMode?: KeybindMode
  prefixKey?: string
  autoUpdate?: boolean
  searchHistory?: boolean
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
