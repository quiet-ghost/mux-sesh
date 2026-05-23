import { join } from 'path'
import type {
  Config,
  IconConfig,
  KeybindMode,
  ProjectProfile,
  ProjectWildcard,
  SessionDefaults,
  SortOrder,
  ThemeColorScheme,
  ThemeDefinition,
  ThemePalette,
  ThemeVariant,
  ZoxideMode,
} from '../types'

const DEFAULT_EDITOR = 'nvim'
const DEFAULT_THEME = 'rosepine'
const DEFAULT_COLOR_SCHEME: ThemeColorScheme = 'system'
const DEFAULT_PREFIX_KEY = 'ctrl+x'
const DEFAULT_EDITOR_COMMAND =
  "nvim -c \"lua vim.defer_fn(function() if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end end, 100)\""
const DEFAULT_ICONS: IconConfig = {
  tmux: '',
  configured: '',
  project: '',
  opencode: '',
}
const OPTIONAL_THEME_PALETTE_KEYS = ['accent', 'interactive', 'diffAdd', 'diffDelete'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const strings = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0
  )
  return strings.length > 0 ? strings : undefined
}

function uniqueStrings(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined
  }

  const seen = new Set<string>()
  const unique = values.filter(value => {
    if (seen.has(value)) {
      return false
    }

    seen.add(value)
    return true
  })

  return unique.length > 0 ? unique : undefined
}

function asKeybindMode(value: unknown): KeybindMode | undefined {
  return value === 'vim' || value === 'standard' ? value : undefined
}

function asZoxideMode(value: unknown): ZoxideMode | undefined {
  return value === 'off' || value === 'rank' || value === 'merge' ? value : undefined
}

function asSortOrder(value: unknown): SortOrder | undefined {
  return value === 'live-first' ||
    value === 'configured-first' ||
    value === 'zoxide-first' ||
    value === 'alphabetical'
    ? value
    : undefined
}

function asThemeColorScheme(value: unknown): ThemeColorScheme | undefined {
  return value === 'light' || value === 'dark' || value === 'system' ? value : undefined
}

function asPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function expandHomePath(value: string, homeDir: string): string {
  if (!value.startsWith('~')) {
    return value
  }

  return join(homeDir, value.slice(1))
}

function normalizeSessionDefaults(value: unknown): SessionDefaults | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const startupCommand = asString(value.startup_command) ?? asString(value.startupCommand)
  const previewCommand = asString(value.preview_command) ?? asString(value.previewCommand)

  if (!startupCommand && !previewCommand) {
    return undefined
  }

  return {
    startupCommand,
    previewCommand,
  }
}

function normalizeIcons(value: unknown): IconConfig | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  return {
    tmux: asString(value.tmux) ?? DEFAULT_ICONS.tmux,
    configured: asString(value.configured) ?? asString(value.config) ?? DEFAULT_ICONS.configured,
    project: asString(value.project) ?? DEFAULT_ICONS.project,
    opencode: asString(value.opencode) ?? DEFAULT_ICONS.opencode,
  }
}

function normalizeThemePalette(value: unknown): ThemePalette | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const neutral = asString(value.neutral)
  const ink = asString(value.ink)
  const primary = asString(value.primary)
  const success = asString(value.success)
  const warning = asString(value.warning)
  const error = asString(value.error)
  const info = asString(value.info)

  if (!neutral || !ink || !primary || !success || !warning || !error || !info) {
    return undefined
  }

  const normalized: ThemePalette = {
    neutral,
    ink,
    primary,
    success,
    warning,
    error,
    info,
  }

  for (const key of OPTIONAL_THEME_PALETTE_KEYS) {
    const color = asString(value[key])
    if (color) {
      normalized[key] = color
    }
  }

  return normalized
}

function normalizeThemeVariant(value: unknown): ThemeVariant | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const palette = normalizeThemePalette(value.palette)
  if (!palette) {
    return undefined
  }

  const overrides = isRecord(value.overrides)
    ? Object.fromEntries(
        Object.entries(value.overrides)
          .map(([key, override]) => [key, asString(override)])
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      )
    : undefined

  return {
    palette,
    overrides: overrides && Object.keys(overrides).length > 0 ? overrides : undefined,
  }
}

function normalizeThemeDefinition(value: unknown, id: string): ThemeDefinition | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const light = normalizeThemeVariant(value.light)
  const dark = normalizeThemeVariant(value.dark)

  if (!light || !dark) {
    return undefined
  }

  return {
    name: asString(value.name) ?? id,
    light,
    dark,
  }
}

function normalizeThemes(value: unknown): Record<string, ThemeDefinition> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const entries = Object.entries(value).flatMap(([name, definition]) => {
    const normalizedDefinition = normalizeThemeDefinition(definition, name)
    if (!normalizedDefinition) {
      return []
    }

    return [[name, normalizedDefinition] as const]
  })

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeProjectProfiles(value: unknown, homeDir: string): ProjectProfile[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const profiles = value.flatMap(entry => {
    if (!isRecord(entry)) {
      return []
    }

    const path = asString(entry.path)
    if (!path) {
      return []
    }

    return [
      {
        path: expandHomePath(path, homeDir),
        sessionName: asString(entry.session_name) ?? asString(entry.sessionName),
        startupCommand: asString(entry.startup_command) ?? asString(entry.startupCommand),
        previewCommand: asString(entry.preview_command) ?? asString(entry.previewCommand),
        listed: asBoolean(entry.listed),
        icon: asString(entry.icon),
      },
    ]
  })

  return profiles.length > 0 ? profiles : undefined
}

function normalizeWildcards(value: unknown, homeDir: string): ProjectWildcard[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const wildcards = value.flatMap(entry => {
    if (!isRecord(entry)) {
      return []
    }

    const pattern = asString(entry.pattern)
    if (!pattern) {
      return []
    }

    return [
      {
        pattern: expandHomePath(pattern, homeDir),
        sessionName: asString(entry.session_name) ?? asString(entry.sessionName),
        startupCommand: asString(entry.startup_command) ?? asString(entry.startupCommand),
        previewCommand: asString(entry.preview_command) ?? asString(entry.previewCommand),
      },
    ]
  })

  return wildcards.length > 0 ? wildcards : undefined
}

export function normalizeConfig(rawConfig: unknown, homeDir = process.env.HOME || '~'): Config {
  const raw = isRecord(rawConfig) ? rawConfig : {}
  const defaultConfig = getDefaultConfig(homeDir)
  const requestedTheme = asString(raw.theme)
  const normalizedTheme =
    requestedTheme === 'rose-pine'
      ? 'rosepine'
      : requestedTheme === 'opencode-dark' || requestedTheme === 'opencode-light'
        ? 'opencode'
        : requestedTheme
  const implicitColorScheme =
    requestedTheme === 'opencode-light'
      ? 'light'
      : requestedTheme === 'opencode-dark'
        ? 'dark'
        : undefined

  const projectPaths = (
    asStringArray(raw.project_paths) ??
    asStringArray(raw.projectPaths) ??
    defaultConfig.projectPaths
  ).map(projectPath => expandHomePath(projectPath, homeDir))
  const reposPath = expandHomePath(
    asString(raw.repos_path) ?? asString(raw.reposPath) ?? defaultConfig.reposPath,
    homeDir
  )
  const editor = asString(raw.editor) ?? defaultConfig.editor
  const editorCmd = asString(raw.editor_cmd) ?? asString(raw.editorCmd) ?? defaultConfig.editorCmd
  const keybindMode =
    asKeybindMode(raw.keybind_mode) ?? asKeybindMode(raw.keybindMode) ?? defaultConfig.keybindMode
  const prefixKey = asString(raw.prefix_key) ?? asString(raw.prefixKey) ?? defaultConfig.prefixKey
  const zoxideMode =
    asZoxideMode(raw.zoxide_mode) ?? asZoxideMode(raw.zoxideMode) ?? defaultConfig.zoxideMode
  const sortOrder =
    asSortOrder(raw.sort_order) ?? asSortOrder(raw.sortOrder) ?? defaultConfig.sortOrder
  const theme = normalizedTheme ?? defaultConfig.theme
  const colorScheme =
    asThemeColorScheme(raw.color_scheme) ??
    asThemeColorScheme(raw.colorScheme) ??
    implicitColorScheme ??
    defaultConfig.colorScheme
  const themes = normalizeThemes(raw.themes) ?? defaultConfig.themes
  const autoUpdate =
    asBoolean(raw.auto_update) ?? asBoolean(raw.autoUpdate) ?? defaultConfig.autoUpdate
  const dirLength =
    asPositiveInteger(raw.dir_length) ?? asPositiveInteger(raw.dirLength) ?? defaultConfig.dirLength
  const hiddenSessions =
    asStringArray(raw.hidden_sessions) ??
    asStringArray(raw.hiddenSessions) ??
    defaultConfig.hiddenSessions
  const pinnedSessions =
    uniqueStrings(asStringArray(raw.pinned_sessions) ?? asStringArray(raw.pinnedSessions)) ??
    defaultConfig.pinnedSessions
  const icons = normalizeIcons(raw.icons) ?? defaultConfig.icons
  const configuredDefaultSession =
    normalizeSessionDefaults(raw.default_session) ?? normalizeSessionDefaults(raw.defaultSession)
  const defaultSession = {
    startupCommand: configuredDefaultSession?.startupCommand ?? editorCmd,
    previewCommand: configuredDefaultSession?.previewCommand,
  }

  return {
    projectPaths,
    reposPath,
    editor,
    editorCmd,
    keybindMode,
    prefixKey,
    zoxideMode,
    sortOrder,
    theme,
    colorScheme,
    themes,
    autoUpdate,
    dirLength,
    hiddenSessions,
    pinnedSessions,
    icons,
    defaultSession,
    projects: normalizeProjectProfiles(raw.projects, homeDir) ?? defaultConfig.projects,
    wildcards: normalizeWildcards(raw.wildcards, homeDir) ?? defaultConfig.wildcards,
  }
}

export function getDefaultConfig(homeDir = process.env.HOME || '~'): Config {
  return {
    projectPaths: [join(homeDir, 'dev'), join(homeDir, 'personal')],
    reposPath: join(homeDir, 'dev', 'repos'),
    editor: DEFAULT_EDITOR,
    editorCmd: DEFAULT_EDITOR_COMMAND,
    keybindMode: 'vim',
    prefixKey: DEFAULT_PREFIX_KEY,
    zoxideMode: 'off',
    sortOrder: 'live-first',
    theme: DEFAULT_THEME,
    colorScheme: DEFAULT_COLOR_SCHEME,
    themes: {},
    autoUpdate: true,
    dirLength: 1,
    hiddenSessions: [],
    pinnedSessions: [],
    icons: DEFAULT_ICONS,
    defaultSession: {
      startupCommand: DEFAULT_EDITOR_COMMAND,
    },
    projects: [],
    wildcards: [],
  }
}

function serializeThemeVariant(variant: ThemeVariant) {
  return variant.overrides && Object.keys(variant.overrides).length > 0
    ? {
        palette: variant.palette,
        overrides: variant.overrides,
      }
    : {
        palette: variant.palette,
      }
}

export function serializeConfig(config: Config): Record<string, unknown> {
  return {
    project_paths: config.projectPaths,
    repos_path: config.reposPath,
    editor: config.editor,
    editor_cmd: config.editorCmd,
    keybind_mode: config.keybindMode,
    prefix_key: config.prefixKey,
    zoxide_mode: config.zoxideMode,
    sort_order: config.sortOrder,
    theme: config.theme,
    color_scheme: config.colorScheme,
    auto_update: config.autoUpdate,
    dir_length: config.dirLength,
    hidden_sessions: config.hiddenSessions,
    pinned_sessions: config.pinnedSessions,
    icons: config.icons,
    default_session: config.defaultSession
      ? {
          startup_command: config.defaultSession.startupCommand,
          preview_command: config.defaultSession.previewCommand,
        }
      : undefined,
    themes: config.themes
      ? Object.fromEntries(
          Object.entries(config.themes).map(([id, theme]) => [
            id,
            {
              name: theme.name,
              light: serializeThemeVariant(theme.light),
              dark: serializeThemeVariant(theme.dark),
            },
          ])
        )
      : undefined,
    projects: config.projects?.map(project => ({
      path: project.path,
      session_name: project.sessionName,
      startup_command: project.startupCommand,
      preview_command: project.previewCommand,
      listed: project.listed,
      icon: project.icon,
    })),
    wildcards: config.wildcards?.map(wildcard => ({
      pattern: wildcard.pattern,
      session_name: wildcard.sessionName,
      startup_command: wildcard.startupCommand,
      preview_command: wildcard.previewCommand,
    })),
  }
}

export { getConfigDir, getConfigPath, getHomeDir } from './paths'
export { loadConfig, saveConfig } from './store'
