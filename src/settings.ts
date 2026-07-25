import { normalizeConfig, serializeConfig } from './config'
import { BUILTIN_THEMES } from './styles/theme'
import type { Config, KeybindMode, SortOrder, ThemeColorScheme, ZoxideMode } from './types'

export type SettingsFieldId =
  | 'backend'
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
  | 'pinnedSessions'
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
const SORT_ORDER_OPTIONS: SortOrder[] = [
  'live-first',
  'configured-first',
  'zoxide-first',
  'alphabetical',
]
const ZOXIDE_OPTIONS: ZoxideMode[] = ['off', 'rank', 'merge']
const BACKEND_OPTIONS = ['auto', 'tmux', 'herdr'] as const

type SettingsFieldKind = SettingsEntry['kind']

interface SettingsFieldDefinition {
  id: SettingsFieldId
  label: string
  hint: string
  kind: SettingsFieldKind
  title?: string
  getValue: (config: Config) => string
  getEditorValue?: (config: Config) => string
  getOptions?: (config: Config) => SettingsOption[]
  applyOption?: (config: Config, value: string) => Config
  applyEditor?: (raw: Record<string, unknown>, value: string) => void
}

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

function choiceOptions(
  values: readonly string[],
  descriptions?: Partial<Record<string, string>>
): SettingsOption[] {
  return values.map(value => ({
    value,
    label: value,
    description: descriptions?.[value],
  }))
}

const SETTINGS_FIELDS: readonly SettingsFieldDefinition[] = [
  {
    id: 'backend',
    label: 'Backend',
    hint: 'Multiplexer selection; applies next launch',
    kind: 'options',
    getValue: config => config.backend ?? 'auto',
    getOptions: () =>
      choiceOptions(BACKEND_OPTIONS, {
        auto: 'Detect current or running multiplexer',
        tmux: 'Require tmux',
        herdr: 'Require a running Herdr server',
      }),
    applyOption: (config, value) => ({
      ...config,
      backend: value === 'tmux' || value === 'herdr' ? value : undefined,
    }),
  },
  {
    id: 'theme',
    label: 'Theme',
    hint: 'Built-in theme catalog',
    kind: 'options',
    getValue: config => config.theme ?? 'rosepine',
    getOptions: () => themeOptions(),
    applyOption: (config, value) => ({
      ...config,
      theme: value,
    }),
  },
  {
    id: 'colorScheme',
    label: 'Color Scheme',
    hint: 'System, dark, or light',
    kind: 'options',
    getValue: config => config.colorScheme ?? 'system',
    getOptions: () =>
      choiceOptions(COLOR_SCHEME_OPTIONS, {
        system: 'Follow the detected terminal theme',
        dark: 'Force dark mode',
        light: 'Force light mode',
      }),
    applyOption: (config, value) => ({
      ...config,
      colorScheme: value as ThemeColorScheme,
    }),
  },
  {
    id: 'keybindMode',
    label: 'Keybind Mode',
    hint: 'Navigation style',
    kind: 'options',
    getValue: config => config.keybindMode ?? 'vim',
    getOptions: () =>
      choiceOptions(KEYBIND_OPTIONS, {
        vim: 'Single-key navigation and actions',
        standard: 'Arrow keys with prefixed commands',
      }),
    applyOption: (config, value) => ({
      ...config,
      keybindMode: value as KeybindMode,
    }),
  },
  {
    id: 'prefixKey',
    label: 'Prefix Key',
    hint: 'Prefixed command trigger',
    kind: 'options',
    title: 'Prefix Key',
    getValue: config => config.prefixKey ?? 'ctrl+x',
    getEditorValue: config => config.prefixKey ?? 'ctrl+x',
    getOptions: () =>
      choiceOptions(PREFIX_OPTIONS, {
        'ctrl+x': 'Default OpenCode-style prefix',
        'ctrl+space': 'Control-space prefix',
        space: 'Spacebar prefix',
        ',': 'Comma prefix',
        ';': 'Semicolon prefix',
      }),
    applyOption: (config, value) => ({
      ...config,
      prefixKey: value,
    }),
  },
  {
    id: 'sortOrder',
    label: 'Sort Order',
    hint: 'List ordering',
    kind: 'options',
    getValue: config => config.sortOrder ?? 'live-first',
    getOptions: () => choiceOptions(SORT_ORDER_OPTIONS),
    applyOption: (config, value) => ({
      ...config,
      sortOrder: value as SortOrder,
    }),
  },
  {
    id: 'zoxideMode',
    label: 'Zoxide Mode',
    hint: 'Project discovery weighting',
    kind: 'options',
    getValue: config => config.zoxideMode ?? 'off',
    getOptions: () => choiceOptions(ZOXIDE_OPTIONS),
    applyOption: (config, value) => ({
      ...config,
      zoxideMode: value as ZoxideMode,
    }),
  },
  {
    id: 'autoUpdate',
    label: 'Auto Update',
    hint: 'Background update checks',
    kind: 'options',
    getValue: config => (config.autoUpdate ? 'on' : 'off'),
    getOptions: () => [
      { value: 'true', label: 'on', description: 'Check for updates automatically' },
      { value: 'false', label: 'off', description: 'Disable automatic update checks' },
    ],
    applyOption: (config, value) => ({
      ...config,
      autoUpdate: value === 'true',
    }),
  },
  {
    id: 'dirLength',
    label: 'Dir Length',
    hint: 'Session naming depth',
    kind: 'number',
    getValue: config => String(config.dirLength ?? 1),
  },
  {
    id: 'reposPath',
    label: 'Repos Path',
    hint: 'Git clone destination',
    kind: 'text',
    title: 'Repos Path',
    getValue: config => config.reposPath,
    getEditorValue: config => config.reposPath,
    applyEditor: (raw, value) => {
      raw.repos_path = value.trim()
    },
  },
  {
    id: 'editor',
    label: 'Editor',
    hint: 'Short editor name',
    kind: 'text',
    title: 'Editor',
    getValue: config => config.editor,
    getEditorValue: config => config.editor,
    applyEditor: (raw, value) => {
      raw.editor = value.trim()
    },
  },
  {
    id: 'editorCmd',
    label: 'Editor Command',
    hint: 'Launch command',
    kind: 'text',
    title: 'Editor Command',
    getValue: config => config.editorCmd,
    getEditorValue: config => config.editorCmd,
    applyEditor: (raw, value) => {
      raw.editor_cmd = value
    },
  },
  {
    id: 'defaultStartupCommand',
    label: 'Default Startup',
    hint: 'Fallback project startup command',
    kind: 'text',
    title: 'Default Startup Command',
    getValue: config => config.defaultSession?.startupCommand ?? '',
    getEditorValue: config => config.defaultSession?.startupCommand ?? '',
    applyEditor: (raw, value) => {
      raw.default_session = {
        ...(typeof raw.default_session === 'object' && raw.default_session
          ? raw.default_session
          : {}),
        startup_command: value,
      }
    },
  },
  {
    id: 'defaultPreviewCommand',
    label: 'Default Preview',
    hint: 'Fallback preview command',
    kind: 'text',
    title: 'Default Preview Command',
    getValue: config => config.defaultSession?.previewCommand ?? '',
    getEditorValue: config => config.defaultSession?.previewCommand ?? '',
    applyEditor: (raw, value) => {
      const trimmed = value.trim()
      raw.default_session = {
        ...(typeof raw.default_session === 'object' && raw.default_session
          ? raw.default_session
          : {}),
        preview_command: trimmed.length > 0 ? value : undefined,
      }
    },
  },
  {
    id: 'projectPaths',
    label: 'Project Paths',
    hint: 'JSON array of roots',
    kind: 'json',
    title: 'Project Paths',
    getValue: config => `${config.projectPaths.length} entries`,
    getEditorValue: config => formatJSON(config.projectPaths),
    applyEditor: (raw, value) => {
      raw.project_paths = JSON.parse(value) as unknown
    },
  },
  {
    id: 'hiddenSessions',
    label: 'Hidden Sessions',
    hint: 'JSON array of filters',
    kind: 'json',
    title: 'Hidden Sessions',
    getValue: config => `${config.hiddenSessions?.length ?? 0} patterns`,
    getEditorValue: config => formatJSON(config.hiddenSessions ?? []),
    applyEditor: (raw, value) => {
      raw.hidden_sessions = JSON.parse(value) as unknown
    },
  },
  {
    id: 'pinnedSessions',
    label: 'Pinned Sessions',
    hint: 'JSON array of session names',
    kind: 'json',
    title: 'Pinned Sessions',
    getValue: config => `${config.pinnedSessions?.length ?? 0} pinned`,
    getEditorValue: config => formatJSON(config.pinnedSessions ?? []),
    applyEditor: (raw, value) => {
      raw.pinned_sessions = JSON.parse(value) as unknown
    },
  },
  {
    id: 'icons',
    label: 'Icons',
    hint: 'JSON object',
    kind: 'json',
    title: 'Icons',
    getValue: () => 'customize glyphs',
    getEditorValue: config => formatJSON(config.icons ?? {}),
    applyEditor: (raw, value) => {
      raw.icons = JSON.parse(value) as unknown
    },
  },
  {
    id: 'projects',
    label: 'Projects',
    hint: 'JSON array of exact rules',
    kind: 'json',
    title: 'Projects',
    getValue: config => `${config.projects?.length ?? 0} rules`,
    getEditorValue: config => formatJSON(config.projects ?? []),
    applyEditor: (raw, value) => {
      raw.projects = JSON.parse(value) as unknown
    },
  },
  {
    id: 'wildcards',
    label: 'Wildcards',
    hint: 'JSON array of wildcard rules',
    kind: 'json',
    title: 'Wildcards',
    getValue: config => `${config.wildcards?.length ?? 0} rules`,
    getEditorValue: config => formatJSON(config.wildcards ?? []),
    applyEditor: (raw, value) => {
      raw.wildcards = JSON.parse(value) as unknown
    },
  },
]

const SETTINGS_FIELD_MAP = Object.fromEntries(
  SETTINGS_FIELDS.map(field => [field.id, field])
) as Record<SettingsFieldId, SettingsFieldDefinition>

function getSettingsField(field: SettingsFieldId): SettingsFieldDefinition {
  return SETTINGS_FIELD_MAP[field]
}

export function getSettingsEntries(config: Config): SettingsEntry[] {
  return SETTINGS_FIELDS.map(field => ({
    id: field.id,
    label: field.label,
    value: field.getValue(config),
    hint: field.hint,
    kind: field.kind,
  }))
}

export function getSettingEditorValue(config: Config, field: SettingsFieldId): string {
  return getSettingsField(field).getEditorValue?.(config) ?? ''
}

export function getSettingOptions(config: Config, field: SettingsFieldId): SettingsOption[] {
  return getSettingsField(field).getOptions?.(config) ?? []
}

export function isOptionSetting(field: SettingsFieldId): boolean {
  return getSettingsField(field).kind === 'options'
}

export function applyOptionSetting(config: Config, field: SettingsFieldId, value: string): Config {
  return getSettingsField(field).applyOption?.(config, value) ?? config
}

export function applyEditorSetting(
  config: Config,
  field: SettingsFieldId,
  value: string,
  homeDir: string
): Config {
  const raw = serializeConfig(config)
  const applyEditor = getSettingsField(field).applyEditor
  if (!applyEditor) {
    return config
  }

  applyEditor(raw, value)

  return normalizeConfig(raw, homeDir)
}

export function getSettingEditorTitle(field: SettingsFieldId): string {
  const setting = getSettingsField(field)
  return setting.title ?? setting.label
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
