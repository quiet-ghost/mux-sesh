import { Schema } from 'effect'
import { normalizeConfig, serializeConfig } from './config'
import { BUILTIN_THEMES, DEFAULT_THEME_ID, SYSTEM_THEME_ID, getBuiltinTheme } from './styles/theme'
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
  applyEditor?: (config: Config, value: string) => SerializedConfigPatch
}

interface SerializedSessionDefaults {
  startup_command: string | undefined
  preview_command: string | undefined
}

// JSON-edited values stay unparsed here; normalizeConfig validates every serialized field.
interface SerializedConfigPatch {
  repos_path?: string
  editor?: string
  editor_cmd?: string
  default_session?: SerializedSessionDefaults
  project_paths?: unknown
  hidden_sessions?: unknown
  pinned_sessions?: unknown
  icons?: unknown
  projects?: unknown
  wildcards?: unknown
}

type JsonSettingValue =
  | NonNullable<
      Config['projectPaths' | 'hiddenSessions' | 'pinnedSessions' | 'projects' | 'wildcards']
    >
  | Partial<NonNullable<Config['icons']>>

const decodeJsonText = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))

function formatJSON(value: JsonSettingValue): string {
  return JSON.stringify(value, null, 2)
}

function findChoice<T extends string>(choices: readonly T[], value: string): T | undefined {
  return choices.find(choice => choice === value)
}

export function getThemeOptions(config?: Config): string[] {
  const builtin = Object.keys(BUILTIN_THEMES).sort((left, right) => {
    if (left === DEFAULT_THEME_ID) return -1

    if (right === DEFAULT_THEME_ID) return 1

    return left.localeCompare(right)
  })

  const custom = Object.keys(config?.themes ?? {}).sort((left, right) => left.localeCompare(right))

  return [SYSTEM_THEME_ID, ...builtin, ...custom]
}

function themeOptions(config: Config): SettingsOption[] {
  return getThemeOptions(config).map(id => {
    if (id === SYSTEM_THEME_ID) {
      return {
        value: id,
        label: 'System',
        description: 'Follow the desktop or terminal theme',
      }
    }

    return {
      value: id,
      label: config.themes?.[id]?.name ?? getBuiltinTheme(id)?.name ?? id,
      description: id,
    }
  })
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

const SETTINGS_FIELD_MAP = {
  backend: {
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
  theme: {
    id: 'theme',
    label: 'Theme',
    hint: 'Built-in, custom, or system',
    kind: 'options',
    getValue: config => config.theme ?? DEFAULT_THEME_ID,
    getOptions: config => themeOptions(config),
    applyOption: (config, value) => ({
      ...config,
      theme: value,
    }),
  },
  colorScheme: {
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
    applyOption: (config, value) => {
      const colorScheme = findChoice(COLOR_SCHEME_OPTIONS, value)

      return colorScheme ? { ...config, colorScheme } : config
    },
  },
  keybindMode: {
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
    applyOption: (config, value) => {
      const keybindMode = findChoice(KEYBIND_OPTIONS, value)

      return keybindMode ? { ...config, keybindMode } : config
    },
  },
  prefixKey: {
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
  sortOrder: {
    id: 'sortOrder',
    label: 'Sort Order',
    hint: 'List ordering',
    kind: 'options',
    getValue: config => config.sortOrder ?? 'live-first',
    getOptions: () => choiceOptions(SORT_ORDER_OPTIONS),
    applyOption: (config, value) => {
      const sortOrder = findChoice(SORT_ORDER_OPTIONS, value)

      return sortOrder ? { ...config, sortOrder } : config
    },
  },
  zoxideMode: {
    id: 'zoxideMode',
    label: 'Zoxide Mode',
    hint: 'Project discovery weighting',
    kind: 'options',
    getValue: config => config.zoxideMode ?? 'off',
    getOptions: () => choiceOptions(ZOXIDE_OPTIONS),
    applyOption: (config, value) => {
      const zoxideMode = findChoice(ZOXIDE_OPTIONS, value)

      return zoxideMode ? { ...config, zoxideMode } : config
    },
  },
  autoUpdate: {
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
  dirLength: {
    id: 'dirLength',
    label: 'Dir Length',
    hint: 'Session naming depth',
    kind: 'number',
    getValue: config => String(config.dirLength ?? 1),
  },
  reposPath: {
    id: 'reposPath',
    label: 'Repos Path',
    hint: 'Git clone destination',
    kind: 'text',
    title: 'Repos Path',
    getValue: config => config.reposPath,
    getEditorValue: config => config.reposPath,
    applyEditor: (_config, value) => ({ repos_path: value.trim() }),
  },
  editor: {
    id: 'editor',
    label: 'Editor',
    hint: 'Short editor name',
    kind: 'text',
    title: 'Editor',
    getValue: config => config.editor,
    getEditorValue: config => config.editor,
    applyEditor: (_config, value) => ({ editor: value.trim() }),
  },
  editorCmd: {
    id: 'editorCmd',
    label: 'Editor Command',
    hint: 'Launch command',
    kind: 'text',
    title: 'Editor Command',
    getValue: config => config.editorCmd,
    getEditorValue: config => config.editorCmd,
    applyEditor: (_config, value) => ({ editor_cmd: value }),
  },
  defaultStartupCommand: {
    id: 'defaultStartupCommand',
    label: 'Default Startup',
    hint: 'Fallback project startup command',
    kind: 'text',
    title: 'Default Startup Command',
    getValue: config => config.defaultSession?.startupCommand ?? '',
    getEditorValue: config => config.defaultSession?.startupCommand ?? '',
    applyEditor: (config, value) => ({
      default_session: {
        startup_command: value,
        preview_command: config.defaultSession?.previewCommand,
      },
    }),
  },
  defaultPreviewCommand: {
    id: 'defaultPreviewCommand',
    label: 'Default Preview',
    hint: 'Fallback preview command',
    kind: 'text',
    title: 'Default Preview Command',
    getValue: config => config.defaultSession?.previewCommand ?? '',
    getEditorValue: config => config.defaultSession?.previewCommand ?? '',
    applyEditor: (config, value) => ({
      default_session: {
        startup_command: config.defaultSession?.startupCommand,
        preview_command: value.trim().length > 0 ? value : undefined,
      },
    }),
  },
  projectPaths: {
    id: 'projectPaths',
    label: 'Project Paths',
    hint: 'JSON array of roots',
    kind: 'json',
    title: 'Project Paths',
    getValue: config => `${config.projectPaths.length} entries`,
    getEditorValue: config => formatJSON(config.projectPaths),
    applyEditor: (_config, value) => ({ project_paths: JSON.parse(value) }),
  },
  hiddenSessions: {
    id: 'hiddenSessions',
    label: 'Hidden Sessions',
    hint: 'JSON array of filters',
    kind: 'json',
    title: 'Hidden Sessions',
    getValue: config => `${config.hiddenSessions?.length ?? 0} patterns`,
    getEditorValue: config => formatJSON(config.hiddenSessions ?? []),
    applyEditor: (_config, value) => ({ hidden_sessions: JSON.parse(value) }),
  },
  pinnedSessions: {
    id: 'pinnedSessions',
    label: 'Pinned Sessions',
    hint: 'JSON array of session names',
    kind: 'json',
    title: 'Pinned Sessions',
    getValue: config => `${config.pinnedSessions?.length ?? 0} pinned`,
    getEditorValue: config => formatJSON(config.pinnedSessions ?? []),
    applyEditor: (_config, value) => ({ pinned_sessions: JSON.parse(value) }),
  },
  icons: {
    id: 'icons',
    label: 'Icons',
    hint: 'JSON object',
    kind: 'json',
    title: 'Icons',
    getValue: () => 'customize glyphs',
    getEditorValue: config => formatJSON(config.icons ?? {}),
    applyEditor: (_config, value) => ({ icons: JSON.parse(value) }),
  },
  projects: {
    id: 'projects',
    label: 'Projects',
    hint: 'JSON array of exact rules',
    kind: 'json',
    title: 'Projects',
    getValue: config => `${config.projects?.length ?? 0} rules`,
    getEditorValue: config => formatJSON(config.projects ?? []),
    applyEditor: (_config, value) => ({ projects: JSON.parse(value) }),
  },
  wildcards: {
    id: 'wildcards',
    label: 'Wildcards',
    hint: 'JSON array of wildcard rules',
    kind: 'json',
    title: 'Wildcards',
    getValue: config => `${config.wildcards?.length ?? 0} rules`,
    getEditorValue: config => formatJSON(config.wildcards ?? []),
    applyEditor: (_config, value) => ({ wildcards: JSON.parse(value) }),
  },
} satisfies { readonly [Id in SettingsFieldId]: SettingsFieldDefinition & { id: Id } }

const SETTINGS_FIELDS = Object.values<SettingsFieldDefinition>(SETTINGS_FIELD_MAP)

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

export function getSelectedOptionIndex(config: Config, field: SettingsFieldId): number {
  const current = getSettingsField(field).getValue(config)

  return Math.max(
    0,
    getSettingOptions(config, field).findIndex(option => option.value === current)
  )
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
  const applyEditor = getSettingsField(field).applyEditor

  if (!applyEditor) {
    return config
  }

  // Round-trip through JSON text, as a save and reload would, so the merge is a plain JSON document.
  const document = decodeJsonText(
    JSON.stringify({ ...serializeConfig(config), ...applyEditor(config, value) })
  )

  return normalizeConfig(document, homeDir)
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
