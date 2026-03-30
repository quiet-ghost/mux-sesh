import { normalizeConfig, serializeConfig } from './config'
import { BUILTIN_THEMES } from './styles/theme'
import type { Config, KeybindMode, SortOrder, ThemeColorScheme, ZoxideMode } from './types'

export type SettingsFieldId =
  | 'theme'
  | 'colorScheme'
  | 'keybindMode'
  | 'prefixKey'
  | 'sortOrder'
  | 'zoxideMode'
  | 'autoUpdate'
  | 'dirLength'
  | 'reposPath'
  | 'editor'
  | 'editorCmd'
  | 'defaultStartupCommand'
  | 'defaultPreviewCommand'
  | 'projectPaths'
  | 'hiddenSessions'
  | 'icons'
  | 'projects'
  | 'wildcards'

export interface SettingsEntry {
  id: SettingsFieldId
  label: string
  value: string
  hint: string
  kind: 'options' | 'number' | 'text' | 'json'
}

export interface SettingsOption {
  value: string
  label: string
  description?: string
}

const COLOR_SCHEME_OPTIONS: ThemeColorScheme[] = ['system', 'dark', 'light']
const KEYBIND_OPTIONS: KeybindMode[] = ['vim', 'standard']
const PREFIX_OPTIONS = ['ctrl+x', 'ctrl+space', 'space', ',', ';'] as const
const SORT_ORDER_OPTIONS: SortOrder[] = ['live-first', 'configured-first', 'zoxide-first', 'alphabetical']
const ZOXIDE_OPTIONS: ZoxideMode[] = ['off', 'rank', 'merge']

function formatJSON(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function getThemeOptions(): string[] {
  return Object.keys(BUILTIN_THEMES).sort((left, right) => {
    if (left === 'rosepine') return -1
    if (right === 'rosepine') return 1
    return left.localeCompare(right)
  })
}

function themeOptions(): SettingsOption[] {
  return getThemeOptions().map(id => ({
    value: id,
    label: BUILTIN_THEMES[id]?.name ?? id,
    description: id,
  }))
}

function choiceOptions(values: readonly string[], descriptions?: Partial<Record<string, string>>): SettingsOption[] {
  return values.map(value => ({
    value,
    label: value,
    description: descriptions?.[value],
  }))
}

export function getSettingsEntries(config: Config): SettingsEntry[] {
  return [
    {
      id: 'theme',
      label: 'Theme',
      value: config.theme ?? 'rosepine',
      hint: 'Built-in theme catalog',
      kind: 'options',
    },
    {
      id: 'colorScheme',
      label: 'Color Scheme',
      value: config.colorScheme ?? 'system',
      hint: 'System, dark, or light',
      kind: 'options',
    },
    {
      id: 'keybindMode',
      label: 'Keybind Mode',
      value: config.keybindMode ?? 'vim',
      hint: 'Navigation style',
      kind: 'options',
    },
    {
      id: 'prefixKey',
      label: 'Prefix Key',
      value: config.prefixKey ?? 'ctrl+x',
      hint: 'Prefixed command trigger',
      kind: 'options',
    },
    {
      id: 'sortOrder',
      label: 'Sort Order',
      value: config.sortOrder ?? 'live-first',
      hint: 'List ordering',
      kind: 'options',
    },
    {
      id: 'zoxideMode',
      label: 'Zoxide Mode',
      value: config.zoxideMode ?? 'off',
      hint: 'Project discovery weighting',
      kind: 'options',
    },
    {
      id: 'autoUpdate',
      label: 'Auto Update',
      value: config.autoUpdate ? 'on' : 'off',
      hint: 'Background update checks',
      kind: 'options',
    },
    {
      id: 'dirLength',
      label: 'Dir Length',
      value: String(config.dirLength ?? 1),
      hint: 'Session naming depth',
      kind: 'number',
    },
    {
      id: 'reposPath',
      label: 'Repos Path',
      value: config.reposPath,
      hint: 'Git clone destination',
      kind: 'text',
    },
    {
      id: 'editor',
      label: 'Editor',
      value: config.editor,
      hint: 'Short editor name',
      kind: 'text',
    },
    {
      id: 'editorCmd',
      label: 'Editor Command',
      value: config.editorCmd,
      hint: 'Launch command',
      kind: 'text',
    },
    {
      id: 'defaultStartupCommand',
      label: 'Default Startup',
      value: config.defaultSession?.startupCommand ?? '',
      hint: 'Fallback project startup command',
      kind: 'text',
    },
    {
      id: 'defaultPreviewCommand',
      label: 'Default Preview',
      value: config.defaultSession?.previewCommand ?? '',
      hint: 'Fallback preview command',
      kind: 'text',
    },
    {
      id: 'projectPaths',
      label: 'Project Paths',
      value: `${config.projectPaths.length} entries`,
      hint: 'JSON array of roots',
      kind: 'json',
    },
    {
      id: 'hiddenSessions',
      label: 'Hidden Sessions',
      value: `${config.hiddenSessions?.length ?? 0} patterns`,
      hint: 'JSON array of filters',
      kind: 'json',
    },
    {
      id: 'icons',
      label: 'Icons',
      value: 'customize glyphs',
      hint: 'JSON object',
      kind: 'json',
    },
    {
      id: 'projects',
      label: 'Projects',
      value: `${config.projects?.length ?? 0} rules`,
      hint: 'JSON array of exact rules',
      kind: 'json',
    },
    {
      id: 'wildcards',
      label: 'Wildcards',
      value: `${config.wildcards?.length ?? 0} rules`,
      hint: 'JSON array of wildcard rules',
      kind: 'json',
    },
  ]
}

export function getSettingEditorValue(config: Config, field: SettingsFieldId): string {
  switch (field) {
    case 'prefixKey':
      return config.prefixKey ?? 'ctrl+x'
    case 'reposPath':
      return config.reposPath
    case 'editor':
      return config.editor
    case 'editorCmd':
      return config.editorCmd
    case 'defaultStartupCommand':
      return config.defaultSession?.startupCommand ?? ''
    case 'defaultPreviewCommand':
      return config.defaultSession?.previewCommand ?? ''
    case 'projectPaths':
      return formatJSON(config.projectPaths)
    case 'hiddenSessions':
      return formatJSON(config.hiddenSessions ?? [])
    case 'icons':
      return formatJSON(config.icons ?? {})
    case 'projects':
      return formatJSON(config.projects ?? [])
    case 'wildcards':
      return formatJSON(config.wildcards ?? [])
    default:
      return ''
  }
}

export function getSettingOptions(config: Config, field: SettingsFieldId): SettingsOption[] {
  switch (field) {
    case 'theme':
      return themeOptions()
    case 'colorScheme':
      return choiceOptions(COLOR_SCHEME_OPTIONS, {
        system: 'Follow the detected terminal theme',
        dark: 'Force dark mode',
        light: 'Force light mode',
      })
    case 'keybindMode':
      return choiceOptions(KEYBIND_OPTIONS, {
        vim: 'Single-key navigation and actions',
        standard: 'Arrow keys with prefixed commands',
      })
    case 'prefixKey':
      return choiceOptions(PREFIX_OPTIONS, {
        'ctrl+x': 'Default OpenCode-style prefix',
        'ctrl+space': 'Control-space prefix',
        space: 'Spacebar prefix',
        ',': 'Comma prefix',
        ';': 'Semicolon prefix',
      })
    case 'sortOrder':
      return choiceOptions(SORT_ORDER_OPTIONS)
    case 'zoxideMode':
      return choiceOptions(ZOXIDE_OPTIONS)
    case 'autoUpdate':
      return [
        { value: 'true', label: 'on', description: 'Check for updates automatically' },
        { value: 'false', label: 'off', description: 'Disable automatic update checks' },
      ]
    default:
      return []
  }
}

export function isOptionSetting(field: SettingsFieldId): boolean {
  return (
    field === 'theme' ||
    field === 'colorScheme' ||
    field === 'keybindMode' ||
    field === 'prefixKey' ||
    field === 'sortOrder' ||
    field === 'zoxideMode' ||
    field === 'autoUpdate'
  )
}

export function applyOptionSetting(config: Config, field: SettingsFieldId, value: string): Config {
  switch (field) {
    case 'theme':
      return {
        ...config,
        theme: value,
      }
    case 'colorScheme':
      return {
        ...config,
        colorScheme: value as ThemeColorScheme,
      }
    case 'keybindMode':
      return {
        ...config,
        keybindMode: value as KeybindMode,
      }
    case 'prefixKey':
      return {
        ...config,
        prefixKey: value,
      }
    case 'sortOrder':
      return {
        ...config,
        sortOrder: value as SortOrder,
      }
    case 'zoxideMode':
      return {
        ...config,
        zoxideMode: value as ZoxideMode,
      }
    case 'autoUpdate':
      return {
        ...config,
        autoUpdate: value === 'true',
      }
    default:
      return config
  }
}

export function applyEditorSetting(config: Config, field: SettingsFieldId, value: string, homeDir: string): Config {
  const raw = serializeConfig(config)
  const trimmed = value.trim()

  switch (field) {
    case 'reposPath':
      raw.repos_path = trimmed
      break
    case 'editor':
      raw.editor = trimmed
      break
    case 'editorCmd':
      raw.editor_cmd = value
      break
    case 'defaultStartupCommand':
      raw.default_session = {
        ...(typeof raw.default_session === 'object' && raw.default_session ? raw.default_session : {}),
        startup_command: value,
      }
      break
    case 'defaultPreviewCommand':
      raw.default_session = {
        ...(typeof raw.default_session === 'object' && raw.default_session ? raw.default_session : {}),
        preview_command: trimmed.length > 0 ? value : undefined,
      }
      break
    case 'projectPaths':
      raw.project_paths = JSON.parse(value) as unknown
      break
    case 'hiddenSessions':
      raw.hidden_sessions = JSON.parse(value) as unknown
      break
    case 'icons':
      raw.icons = JSON.parse(value) as unknown
      break
    case 'projects':
      raw.projects = JSON.parse(value) as unknown
      break
    case 'wildcards':
      raw.wildcards = JSON.parse(value) as unknown
      break
    default:
      return config
  }

  return normalizeConfig(raw, homeDir)
}

export function getSettingEditorTitle(field: SettingsFieldId): string {
  switch (field) {
    case 'prefixKey':
      return 'Prefix Key'
    case 'reposPath':
      return 'Repos Path'
    case 'editor':
      return 'Editor'
    case 'editorCmd':
      return 'Editor Command'
    case 'defaultStartupCommand':
      return 'Default Startup Command'
    case 'defaultPreviewCommand':
      return 'Default Preview Command'
    case 'projectPaths':
      return 'Project Paths'
    case 'hiddenSessions':
      return 'Hidden Sessions'
    case 'icons':
      return 'Icons'
    case 'projects':
      return 'Projects'
    case 'wildcards':
      return 'Wildcards'
    default:
      return 'Setting'
  }
}

export function filterSettingsEntries(entries: SettingsEntry[], query: string): SettingsEntry[] {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return entries
  }

  return entries.filter(entry => {
    const haystack = `${entry.label} ${entry.value} ${entry.hint}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })
}

export function filterSettingsOptions(options: SettingsOption[], query: string): SettingsOption[] {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return options
  }

  return options.filter(option => {
    const haystack = `${option.label} ${option.value} ${option.description ?? ''}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })
}
