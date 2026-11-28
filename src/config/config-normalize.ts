import { join } from 'path'
import * as Schema from 'effect/Schema'
import type {
  Config,
  IconConfig,
  ProjectProfile,
  ProjectWildcard,
  SessionDefaults,
  ThemeColorScheme,
  ThemeDefinition,
  ThemePalette,
  ThemeVariant,
} from '../types'
import {
  BackendChoice,
  ColorSchemeChoice,
  Flag,
  KeybindChoice,
  NonEmptyText,
  PositiveInteger,
  SortChoice,
  ZoxideChoice,
} from './config-document'

const DEFAULT_EDITOR = 'nvim'
const DEFAULT_THEME = 'rosepine'
const DEFAULT_COLOR_SCHEME: ThemeColorScheme = 'system'
const DEFAULT_PREFIX_KEY = 'ctrl+x'

// A loaded config always carries a prefix (an empty `prefix_key` means the default); this covers
// the moment before the config has loaded, so key handling never has a "no prefix" state.
export function resolvePrefixKey(config: Pick<Config, 'prefixKey'> | null): string {
  return config?.prefixKey ?? DEFAULT_PREFIX_KEY
}

const DEFAULT_EDITOR_COMMAND =
  "nvim -c \"lua vim.defer_fn(function() if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end end, 100)\""

// Rows and section headers show no icon unless the config sets one.
const DEFAULT_ICONS: IconConfig = {
  tmux: '',
  herdr: '',
  configured: '',
  project: '',
  opencode: '',
}

const OPTIONAL_THEME_PALETTE_KEYS = ['accent', 'interactive', 'diffAdd', 'diffDelete'] as const

// A field read from a JSON document; absent keys read as undefined.
type DocumentValue = Schema.Json | undefined

const isRecord = Schema.is(Schema.JsonObject)
const isJsonArray = Schema.is(Schema.Array(Schema.Json))
const isNonEmptyText = Schema.is(NonEmptyText)

// Reads a value the config schema accepts. The document may not have been checked (tests and
// direct callers pass raw JSON), so a value the schema rejects reads as unset, not as an error.
function reader<T extends DocumentValue>(accepts: (value: DocumentValue) => value is T) {
  return (value: DocumentValue): T | undefined => (accepts(value) ? value : undefined)
}

// Empty text reads as unset, so an empty field falls through to its alias or default.
const asString = reader(isNonEmptyText)
const asBoolean = reader(Schema.is(Flag))
const asPositiveInteger = reader(Schema.is(PositiveInteger))
const asBackendPreference = reader(Schema.is(BackendChoice))
const asKeybindMode = reader(Schema.is(KeybindChoice))
const asZoxideMode = reader(Schema.is(ZoxideChoice))
const asSortOrder = reader(Schema.is(SortChoice))
const asThemeColorScheme = reader(Schema.is(ColorSchemeChoice))

// Keeps the non-empty strings; a list with none reads as unset.
function asStringArray(value: DocumentValue): string[] | undefined {
  if (!isJsonArray(value)) {
    return undefined
  }

  const strings = value.filter(isNonEmptyText)

  return strings.length > 0 ? strings : undefined
}

// The snake_case key wins; the camelCase alias is read only when snake_case is absent or unusable.
function aliased<T>(
  fields: Schema.JsonObject,
  snake: string,
  camel: string,
  read: (value: DocumentValue) => T | undefined
): T | undefined {
  return read(fields[snake]) ?? read(fields[camel])
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

export function expandHomePath(value: string, homeDir: string): string {
  if (!value.startsWith('~')) {
    return value
  }

  return join(homeDir, value.slice(1))
}

function normalizeSessionDefaults(value: DocumentValue): SessionDefaults | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const startupCommand = aliased(value, 'startup_command', 'startupCommand', asString)
  const previewCommand = aliased(value, 'preview_command', 'previewCommand', asString)

  if (!startupCommand && !previewCommand) {
    return undefined
  }

  return {
    startupCommand,
    previewCommand,
  }
}

function normalizeIcons(value: DocumentValue): IconConfig | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  return {
    tmux: asString(value.tmux) ?? DEFAULT_ICONS.tmux,
    herdr: asString(value.herdr) ?? DEFAULT_ICONS.herdr,
    configured: aliased(value, 'configured', 'config', asString) ?? DEFAULT_ICONS.configured,
    project: asString(value.project) ?? DEFAULT_ICONS.project,
    opencode: asString(value.opencode) ?? DEFAULT_ICONS.opencode,
  }
}

function normalizeThemePalette(value: DocumentValue): ThemePalette | undefined {
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

function normalizeThemeVariant(value: DocumentValue): ThemeVariant | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const palette = normalizeThemePalette(value.palette)

  if (!palette) {
    return undefined
  }

  const overrides = isRecord(value.overrides)
    ? Object.fromEntries(
        Object.entries(value.overrides).flatMap(([key, override]) => {
          const color = asString(override)

          return color === undefined ? [] : [[key, color] as const]
        })
      )
    : undefined

  return {
    palette,
    overrides: overrides && Object.keys(overrides).length > 0 ? overrides : undefined,
  }
}

function normalizeThemeDefinition(value: DocumentValue, id: string): ThemeDefinition | undefined {
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

function normalizeThemes(value: DocumentValue): Record<string, ThemeDefinition> | undefined {
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

function normalizeProjectProfiles(
  value: DocumentValue,
  homeDir: string
): ProjectProfile[] | undefined {
  if (!isJsonArray(value)) {
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
        sessionName: aliased(entry, 'session_name', 'sessionName', asString),
        startupCommand: aliased(entry, 'startup_command', 'startupCommand', asString),
        previewCommand: aliased(entry, 'preview_command', 'previewCommand', asString),
        listed: asBoolean(entry.listed),
        icon: asString(entry.icon),
      },
    ]
  })

  return profiles.length > 0 ? profiles : undefined
}

function normalizeWildcards(value: DocumentValue, homeDir: string): ProjectWildcard[] | undefined {
  if (!isJsonArray(value)) {
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
        sessionName: aliased(entry, 'session_name', 'sessionName', asString),
        startupCommand: aliased(entry, 'startup_command', 'startupCommand', asString),
        previewCommand: aliased(entry, 'preview_command', 'previewCommand', asString),
      },
    ]
  })

  return wildcards.length > 0 ? wildcards : undefined
}

export function normalizeConfig(rawConfig: Schema.Json, homeDir = process.env.HOME || '~'): Config {
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
    aliased(raw, 'project_paths', 'projectPaths', asStringArray) ?? defaultConfig.projectPaths
  ).map(projectPath => expandHomePath(projectPath, homeDir))

  const reposPath = expandHomePath(
    aliased(raw, 'repos_path', 'reposPath', asString) ?? defaultConfig.reposPath,
    homeDir
  )

  const editor = asString(raw.editor) ?? defaultConfig.editor
  const backend = asBackendPreference(raw.backend)
  const editorCmd = aliased(raw, 'editor_cmd', 'editorCmd', asString) ?? defaultConfig.editorCmd

  const keybindMode =
    aliased(raw, 'keybind_mode', 'keybindMode', asKeybindMode) ?? defaultConfig.keybindMode

  const prefixKey = aliased(raw, 'prefix_key', 'prefixKey', asString) ?? defaultConfig.prefixKey

  const zoxideMode =
    aliased(raw, 'zoxide_mode', 'zoxideMode', asZoxideMode) ?? defaultConfig.zoxideMode

  const sortOrder = aliased(raw, 'sort_order', 'sortOrder', asSortOrder) ?? defaultConfig.sortOrder

  const theme = normalizedTheme ?? defaultConfig.theme

  const colorScheme =
    aliased(raw, 'color_scheme', 'colorScheme', asThemeColorScheme) ??
    implicitColorScheme ??
    defaultConfig.colorScheme

  const themes = normalizeThemes(raw.themes) ?? defaultConfig.themes

  const autoUpdate =
    aliased(raw, 'auto_update', 'autoUpdate', asBoolean) ?? defaultConfig.autoUpdate

  const searchHistory =
    aliased(raw, 'search_history', 'searchHistory', asBoolean) ?? defaultConfig.searchHistory

  const dirLength =
    aliased(raw, 'dir_length', 'dirLength', asPositiveInteger) ?? defaultConfig.dirLength

  const hiddenSessions =
    aliased(raw, 'hidden_sessions', 'hiddenSessions', asStringArray) ?? defaultConfig.hiddenSessions

  const pinnedSessions =
    uniqueStrings(aliased(raw, 'pinned_sessions', 'pinnedSessions', asStringArray)) ??
    defaultConfig.pinnedSessions

  const icons = normalizeIcons(raw.icons) ?? defaultConfig.icons

  const configuredDefaultSession = aliased(
    raw,
    'default_session',
    'defaultSession',
    normalizeSessionDefaults
  )

  const defaultSession = {
    startupCommand: configuredDefaultSession?.startupCommand ?? editorCmd,
    previewCommand: configuredDefaultSession?.previewCommand,
  }

  return {
    backend,
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
    searchHistory,
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
    searchHistory: true,
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

export function serializeConfig(config: Config) {
  return {
    backend: config.backend,
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
    search_history: config.searchHistory,
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
