import { join } from 'path'
import { mkdir } from 'fs/promises'
import type { Config, IconConfig, KeybindMode, ProjectProfile, ProjectWildcard, SessionDefaults, SortOrder, ZoxideMode } from '../types'

const DEFAULT_EDITOR = 'nvim'
const DEFAULT_EDITOR_COMMAND =
  "nvim -c \"lua vim.defer_fn(function() if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end end, 100)\""
const DEFAULT_ICONS: IconConfig = {
  tmux: '',
  configured: '',
  project: '',
  opencode: '',
}

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

  const strings = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  return strings.length > 0 ? strings : undefined
}

function asKeybindMode(value: unknown): KeybindMode | undefined {
  return value === 'vim' || value === 'standard' ? value : undefined
}

function asZoxideMode(value: unknown): ZoxideMode | undefined {
  return value === 'off' || value === 'rank' || value === 'merge' ? value : undefined
}

function asSortOrder(value: unknown): SortOrder | undefined {
  return value === 'live-first' || value === 'configured-first' || value === 'zoxide-first' || value === 'alphabetical'
    ? value
    : undefined
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

  const projectPaths = (asStringArray(raw.project_paths) ?? asStringArray(raw.projectPaths) ?? defaultConfig.projectPaths).map(
    projectPath => expandHomePath(projectPath, homeDir)
  )
  const reposPath = expandHomePath(
    asString(raw.repos_path) ?? asString(raw.reposPath) ?? defaultConfig.reposPath,
    homeDir
  )
  const editor = asString(raw.editor) ?? defaultConfig.editor
  const editorCmd = asString(raw.editor_cmd) ?? asString(raw.editorCmd) ?? defaultConfig.editorCmd
  const keybindMode = asKeybindMode(raw.keybind_mode) ?? asKeybindMode(raw.keybindMode) ?? defaultConfig.keybindMode
  const zoxideMode = asZoxideMode(raw.zoxide_mode) ?? asZoxideMode(raw.zoxideMode) ?? defaultConfig.zoxideMode
  const sortOrder = asSortOrder(raw.sort_order) ?? asSortOrder(raw.sortOrder) ?? defaultConfig.sortOrder
  const autoUpdate = asBoolean(raw.auto_update) ?? asBoolean(raw.autoUpdate) ?? defaultConfig.autoUpdate
  const dirLength = asPositiveInteger(raw.dir_length) ?? asPositiveInteger(raw.dirLength) ?? defaultConfig.dirLength
  const hiddenSessions = asStringArray(raw.hidden_sessions) ?? asStringArray(raw.hiddenSessions) ?? defaultConfig.hiddenSessions
  const icons = normalizeIcons(raw.icons) ?? defaultConfig.icons
  const configuredDefaultSession = normalizeSessionDefaults(raw.default_session) ?? normalizeSessionDefaults(raw.defaultSession)
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
    zoxideMode,
    sortOrder,
    autoUpdate,
    dirLength,
    hiddenSessions,
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
    zoxideMode: 'off',
    sortOrder: 'live-first',
    autoUpdate: true,
    dirLength: 1,
    hiddenSessions: [],
    icons: DEFAULT_ICONS,
    defaultSession: {
      startupCommand: DEFAULT_EDITOR_COMMAND,
    },
    projects: [],
    wildcards: [],
  }
}

export async function loadConfig(): Promise<Config> {
  const configDir = join(process.env.HOME!, '.config', 'mux-sesh')
  const configPath = join(configDir, 'config.json')

  try {
    const file = Bun.file(configPath)
    return normalizeConfig(await file.json(), process.env.HOME || '~')
  } catch {
    // Config doesn't exist, create default
    const defaultConfig = getDefaultConfig()
    await saveConfig(defaultConfig)
    return defaultConfig
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const configDir = join(process.env.HOME!, '.config', 'mux-sesh')
  const configPath = join(configDir, 'config.json')

  await mkdir(configDir, { recursive: true })
  await Bun.write(configPath, JSON.stringify(config, null, 2))
}

export function getConfigPath(): string {
  return join(process.env.HOME!, '.config', 'mux-sesh', 'config.json')
}
