import * as Schema from 'effect/Schema'
import { getDefaultConfig, normalizeConfig, serializeConfig } from '../config'
import { checkConfigDocument, type ConfigIssue } from '../config/config-document'
import { PrefixKey } from '../config/prefix-key'
import { BUILTIN_THEMES, DEFAULT_THEME_ID, SYSTEM_THEME_ID, getBuiltinTheme } from '../styles/theme'
import type { Config, KeybindMode, SortOrder, ThemeColorScheme, ZoxideMode } from '../types'
import { toHomeRelativePath } from '../util/path-display'
import { JsonSyntaxIssue } from './json-syntax'

export type SettingsFieldId =
  | 'theme'
  | 'colorScheme'
  | 'icons'
  | 'keybindMode'
  | 'prefixKey'
  | 'sortOrder'
  | 'pinnedSessions'
  | 'hiddenSessions'
  | 'dirLength'
  | 'startupCommand'
  | 'previewCommand'
  | 'editor'
  | 'projectPaths'
  | 'projects'
  | 'wildcards'
  | 'zoxideMode'
  | 'reposPath'
  | 'backend'
  | 'autoUpdate'
  | 'searchHistory'

export type SettingsCategory =
  'Appearance' | 'Keys' | 'Sessions' | 'Launch' | 'Projects' | 'General'

// What ←/→ and Enter do on a Settings row.
export type SettingsControl =
  // Two choices: ←/→ and Enter switch between them.
  | 'toggle'
  // ←/→ cycle the choices in place; Enter opens the picker.
  | 'cycle'
  // ←/→ step a number; Enter does nothing.
  | 'step'
  // Enter opens a picker or editor; ←/→ do nothing.
  | 'open'

// Whether the value is the default, and if not, whether ctrl+r may put the default back.
export type SettingsReset = 'default' | 'available' | 'unavailable'

export interface SettingsEntry {
  id: SettingsFieldId
  title: string
  category: SettingsCategory
  description: string
  keywords: string
  value: string
  control: SettingsControl
  reset: SettingsReset
}

export interface SettingsOption {
  value: string
  label: string
  description?: string
  // "Custom…": Enter opens a text entry for any value instead of saving this option.
  custom?: true
}

interface SettingInfo {
  id: SettingsFieldId
  title: string
  category: SettingsCategory
  description: string
  keywords: readonly string[]
}

// A fixed set of choices. `read` and `apply` use option values; the row shows option labels.
interface ChoiceSetting extends SettingInfo {
  kind: 'choice'
  options: (config: Config) => SettingsOption[]
  read: (config: Config) => string
  apply: (config: Config, value: string) => Config
}

// Choices that only open their picker: each Theme step would save and reload the list, and a
// custom prefix key is not one of the presets.
interface PickerSetting extends SettingInfo {
  kind: 'picker'
  options: (config: Config) => SettingsOption[]
  read: (config: Config) => string
  apply: (config: Config, value: string) => Config
  // Typed through the picker's "Custom…" option.
  custom?: CustomEntry
}

type CustomParse =
  | { readonly kind: 'parsed'; readonly value: string }
  | { readonly kind: 'invalid'; readonly reason: string }

interface CustomEntry {
  // The text entry's description line.
  description: string
  parse: (text: string) => CustomParse
}

interface NumberSetting extends SettingInfo {
  kind: 'number'
  min: number
  max: number
  read: (config: Config) => number
  apply: (config: Config, value: number) => Config
  format: (value: number) => string
}

// Edited as text; the patch is merged into the saved document and normalized like a reload.
interface TextSetting extends SettingInfo {
  kind: 'text'
  read: (config: Config) => string
  display: (config: Config) => string
  patch: (config: Config, value: string) => SerializedConfigPatch
}

// Lists and rules, edited as JSON until they have their own editors. They are never reset with
// one key: that would drop every entry with no way back. `key` is the config file key: the raw
// JSON editor shows that value as the file would hold it.
interface JsonSetting extends SettingInfo {
  kind: 'json'
  key: JsonDocumentKey
  read: (config: Config) => JsonSettingValue
  summary: (config: Config) => string
  patch: (value: Schema.Json) => SerializedConfigPatch
}

// A group of related values with its own form; Enter opens it.
interface FormSetting extends SettingInfo {
  kind: 'form'
  read: (config: Config) => Partial<NonNullable<Config['icons']>>
  summary: (config: Config) => string
}

export type ListSettingId = 'projectPaths' | 'hiddenSessions' | 'pinnedSessions'

export type RulesSettingId = 'projects' | 'wildcards'

// A list of strings, edited row by row; its "Edit as JSON…" row opens the JSON editor.
interface ListSetting extends Omit<JsonSetting, 'kind' | 'id'> {
  kind: 'list'
  id: ListSettingId
}

// Project or wildcard rules, edited in a rule list and a form per rule.
interface RulesSetting extends Omit<JsonSetting, 'kind' | 'id'> {
  kind: 'rules'
  id: RulesSettingId
}

type SettingDefinition =
  | ChoiceSetting
  | PickerSetting
  | NumberSetting
  | TextSetting
  | JsonSetting
  | ListSetting
  | RulesSetting
  | FormSetting

// The editor a list or rules setting opens instead of the JSON editor.
export type SettingCollection =
  | { readonly kind: 'list'; readonly id: ListSettingId }
  | { readonly kind: 'rules'; readonly id: RulesSettingId }

interface SerializedSessionDefaults {
  startup_command: string | undefined
  preview_command: string | undefined
}

// JSON-edited values stay unparsed here; normalizeConfig validates every serialized field.
interface SerializedConfigPatch {
  repos_path?: string
  editor?: string
  default_session?: SerializedSessionDefaults
  project_paths?: unknown
  hidden_sessions?: unknown
  pinned_sessions?: unknown
  projects?: unknown
  wildcards?: unknown
}

type JsonDocumentKey =
  'project_paths' | 'hidden_sessions' | 'pinned_sessions' | 'projects' | 'wildcards'

type JsonSettingValue = NonNullable<
  Config['projectPaths' | 'hiddenSessions' | 'pinnedSessions' | 'projects' | 'wildcards']
>

const COLOR_SCHEME_OPTIONS: ThemeColorScheme[] = ['system', 'dark', 'light']
const KEYBIND_OPTIONS: KeybindMode[] = ['vim', 'standard']
const PREFIX_OPTIONS: readonly string[] = ['ctrl+x', 'ctrl+space', 'space', ',', ';']

const CUSTOM_PREFIX_OPTION: SettingsOption = {
  value: '',
  label: 'Custom…',
  description: 'Type any other key, such as ctrl+a',
  custom: true,
}

function parsePrefixKey(text: string): CustomParse {
  const parsed = PrefixKey.parse(text)

  return parsed.kind === 'parsed' ? { kind: 'parsed', value: parsed.key } : parsed
}

// The presets, then a configured key that is not one of them, so it shows as current.
function prefixOptions(config: Config): SettingsOption[] {
  const presets = choiceOptions(PREFIX_OPTIONS, {
    'ctrl+x': 'Default OpenCode-style prefix',
    'ctrl+space': 'Control-space prefix',
    space: 'Spacebar prefix',
    ',': 'Comma prefix',
    ';': 'Semicolon prefix',
  })

  const configured = config.prefixKey

  const custom =
    configured && !PREFIX_OPTIONS.includes(configured)
      ? [{ value: configured, label: configured, description: 'Your custom prefix' }]
      : []

  return [...presets, ...custom, CUSTOM_PREFIX_OPTION]
}

const ZOXIDE_OPTIONS: ZoxideMode[] = ['off', 'rank', 'merge']
const BACKEND_OPTIONS = ['auto', 'tmux', 'herdr'] as const

const SORT_ORDER_OPTIONS: SortOrder[] = [
  'live-first',
  'configured-first',
  'zoxide-first',
  'alphabetical',
]

// The built-in startup command opens nvim with Telescope; its full text does not fit a row.
const DEFAULT_STARTUP_LABEL = 'nvim (Telescope)'

// A sample project path whose last segments preview what a Name depth keeps.
const NAME_DEPTH_SAMPLE = ['home', 'you', 'src', 'work', 'dev', 'mux-sesh'] as const

const decodeJsonText = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))

// The value as the config file holds it, so the raw JSON editor shows the file's own keys.
function formatJSON(config: Config, key: JsonDocumentKey, fallback: JsonSettingValue): string {
  return JSON.stringify(serializeConfig(config)[key] ?? fallback, null, 2)
}

function formatNameDepth(depth: number): string {
  return `${depth} · ${NAME_DEPTH_SAMPLE.slice(-depth).join('/')}`
}

function countSummary(count: number): string {
  return count === 0 ? 'none' : String(count)
}

function findChoice<T extends string>(choices: readonly T[], value: string): T | undefined {
  return choices.find(choice => choice === value)
}

function getThemeOptions(config?: Config): string[] {
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
  descriptions: Partial<Record<string, string>>,
  labels: Partial<Record<string, string>> = {}
): SettingsOption[] {
  return values.map(value => ({
    value,
    label: labels[value] ?? value,
    description: descriptions[value],
  }))
}

const ON_OFF_LABELS = { true: 'on', false: 'off' }

function sessionDefaults(
  config: Config,
  change: Partial<SerializedSessionDefaults>
): SerializedConfigPatch {
  return {
    default_session: {
      startup_command: config.defaultSession?.startupCommand,
      preview_command: config.defaultSession?.previewCommand,
      ...change,
    },
  }
}

// In display order: categories in this order, each setting under its category.
const SETTINGS = {
  theme: {
    id: 'theme',
    kind: 'picker',
    title: 'Theme',
    category: 'Appearance',
    description: 'Colors for every screen; System follows Omarchy or the terminal',
    keywords: ['colors', 'palette', 'omarchy'],
    options: themeOptions,
    read: config => config.theme ?? DEFAULT_THEME_ID,
    apply: (config, theme) => ({ ...config, theme }),
  },
  colorScheme: {
    id: 'colorScheme',
    kind: 'choice',
    title: 'Color scheme',
    category: 'Appearance',
    description: 'Light or dark variant, or follow the terminal',
    keywords: ['dark', 'light', 'mode'],
    options: () =>
      choiceOptions(COLOR_SCHEME_OPTIONS, {
        system: 'Follow the detected terminal theme',
        dark: 'Force dark mode',
        light: 'Force light mode',
      }),
    read: config => config.colorScheme ?? 'system',
    apply: (config, value) => {
      const colorScheme = findChoice(COLOR_SCHEME_OPTIONS, value)

      return colorScheme ? { ...config, colorScheme } : config
    },
  },
  icons: {
    id: 'icons',
    kind: 'form',
    title: 'Icons',
    category: 'Appearance',
    description: 'Glyphs before row titles and section headers',
    keywords: ['glyphs', 'nerd', 'font'],
    read: config => config.icons ?? {},
    summary: config => (Object.values(config.icons ?? {}).some(Boolean) ? 'on' : 'off'),
  },
  keybindMode: {
    id: 'keybindMode',
    kind: 'choice',
    title: 'Keybind mode',
    category: 'Keys',
    description: 'vim: single-key actions; standard: type to search, prefix for actions',
    keywords: ['vim', 'standard', 'navigation'],
    options: () =>
      choiceOptions(KEYBIND_OPTIONS, {
        vim: 'Single-key navigation and actions',
        standard: 'Arrow keys with prefixed commands',
      }),
    read: config => config.keybindMode ?? 'vim',
    apply: (config, value) => {
      const keybindMode = findChoice(KEYBIND_OPTIONS, value)

      return keybindMode ? { ...config, keybindMode } : config
    },
  },
  prefixKey: {
    id: 'prefixKey',
    kind: 'picker',
    title: 'Prefix key',
    category: 'Keys',
    description: 'Starts secondary actions, such as ctrl+x r to rename',
    keywords: ['leader', 'shortcut'],
    options: prefixOptions,
    read: config => config.prefixKey ?? 'ctrl+x',
    apply: (config, prefixKey) => ({ ...config, prefixKey }),
    custom: {
      description:
        'Hold ctrl or shift and a key, such as ctrl+a; or a symbol, space, tab or f1–f12',
      parse: parsePrefixKey,
    },
  },
  sortOrder: {
    id: 'sortOrder',
    kind: 'choice',
    title: 'Sort order',
    category: 'Sessions',
    description: 'Order of sessions and projects; pinned sessions stay on top',
    keywords: ['order', 'sorting', 'alphabetical'],
    options: () =>
      choiceOptions(
        SORT_ORDER_OPTIONS,
        {
          'live-first': 'Live sessions, then configured projects, then the rest',
          'configured-first': 'Configured projects before live sessions',
          'zoxide-first': 'Most-used folders first, by zoxide rank',
          alphabetical: 'By name',
        },
        {
          'live-first': 'live first',
          'configured-first': 'configured first',
          'zoxide-first': 'zoxide first',
          alphabetical: 'A–Z',
        }
      ),
    read: config => config.sortOrder ?? 'live-first',
    apply: (config, value) => {
      const sortOrder = findChoice(SORT_ORDER_OPTIONS, value)

      return sortOrder ? { ...config, sortOrder } : config
    },
  },
  pinnedSessions: {
    id: 'pinnedSessions',
    kind: 'list',
    key: 'pinned_sessions',
    title: 'Pinned sessions',
    category: 'Sessions',
    description: 'Kept at the top in every order; ctrl+f pins the selected session',
    keywords: ['pin', 'favorites', 'top'],
    read: config => config.pinnedSessions ?? [],
    summary: config => countSummary(config.pinnedSessions?.length ?? 0),
    patch: pinned_sessions => ({ pinned_sessions }),
  },
  hiddenSessions: {
    id: 'hiddenSessions',
    kind: 'list',
    key: 'hidden_sessions',
    title: 'Hidden sessions',
    category: 'Sessions',
    description: 'Live sessions whose names match these globs are not listed',
    keywords: ['hide', 'filter', 'ignore', 'glob'],
    read: config => config.hiddenSessions ?? [],
    summary: config => countSummary(config.hiddenSessions?.length ?? 0),
    patch: hidden_sessions => ({ hidden_sessions }),
  },
  dirLength: {
    id: 'dirLength',
    kind: 'number',
    title: 'Name depth',
    category: 'Sessions',
    description: 'Path segments used in generated session names',
    keywords: ['dir', 'length', 'session', 'name'],
    min: 1,
    max: NAME_DEPTH_SAMPLE.length,
    read: config => config.dirLength ?? 1,
    apply: (config, dirLength) => ({ ...config, dirLength }),
    format: formatNameDepth,
  },
  // Writes default_session.startup_command, which wins over the legacy editor_cmd on reload.
  startupCommand: {
    id: 'startupCommand',
    kind: 'text',
    title: 'Startup command',
    category: 'Launch',
    description: 'Runs in new sessions without a project rule; {file} {dir} {} for files',
    keywords: ['editor', 'command', 'nvim', 'run'],
    read: config => config.defaultSession?.startupCommand ?? config.editorCmd,
    display: config => {
      const command = config.defaultSession?.startupCommand ?? config.editorCmd

      return command === getDefaultConfig().editorCmd ? DEFAULT_STARTUP_LABEL : command
    },
    patch: (config, value) => sessionDefaults(config, { startup_command: value }),
  },
  previewCommand: {
    id: 'previewCommand',
    kind: 'text',
    title: 'Preview command',
    category: 'Launch',
    description: 'Runs in details for projects without a rule; {} is the path',
    keywords: ['details', 'listing', 'eza', 'ls'],
    read: config => config.defaultSession?.previewCommand ?? '',
    display: config => config.defaultSession?.previewCommand || 'directory listing',
    patch: (config, value) =>
      sessionDefaults(config, { preview_command: value.trim().length > 0 ? value : undefined }),
  },
  editor: {
    id: 'editor',
    kind: 'text',
    title: 'File editor',
    category: 'Launch',
    description: 'Opens files picked in New and listed targets with Edit target',
    keywords: ['editor', 'nvim', 'files'],
    read: config => config.editor,
    display: config => config.editor,
    patch: (_config, value) => ({ editor: value.trim() }),
  },
  projectPaths: {
    id: 'projectPaths',
    kind: 'list',
    key: 'project_paths',
    title: 'Project folders',
    category: 'Projects',
    description: "Scanned for projects and searched by New's file step",
    keywords: ['roots', 'paths', 'scan', 'directories'],
    read: config => config.projectPaths,
    summary: config => config.projectPaths.map(toHomeRelativePath).join(', ') || 'none',
    patch: project_paths => ({ project_paths }),
  },
  projects: {
    id: 'projects',
    kind: 'rules',
    key: 'projects',
    title: 'Project rules',
    category: 'Projects',
    description: 'Exact folders with their own name, commands, icon or listing',
    keywords: ['projects', 'profiles', 'exact'],
    read: config => config.projects ?? [],
    summary: config => countSummary(config.projects?.length ?? 0),
    patch: projects => ({ projects }),
  },
  wildcards: {
    id: 'wildcards',
    kind: 'rules',
    key: 'wildcards',
    title: 'Wildcard rules',
    category: 'Projects',
    description: 'Defaults for folders matching a pattern; the first match wins',
    keywords: ['wildcards', 'patterns', 'glob'],
    read: config => config.wildcards ?? [],
    summary: config => countSummary(config.wildcards?.length ?? 0),
    patch: wildcards => ({ wildcards }),
  },
  zoxideMode: {
    id: 'zoxideMode',
    kind: 'choice',
    title: 'Zoxide',
    category: 'Projects',
    description: 'Use zoxide to rank projects, or to add folders inside your roots',
    keywords: ['frecency', 'discovery', 'rank'],
    options: () =>
      choiceOptions(
        ZOXIDE_OPTIONS,
        {
          off: 'Do not read zoxide',
          rank: 'Rank discovered projects by zoxide score',
          merge: 'Also add zoxide folders inside your project folders',
        },
        { merge: 'add folders' }
      ),
    read: config => config.zoxideMode ?? 'off',
    apply: (config, value) => {
      const zoxideMode = findChoice(ZOXIDE_OPTIONS, value)

      return zoxideMode ? { ...config, zoxideMode } : config
    },
  },
  reposPath: {
    id: 'reposPath',
    kind: 'text',
    title: 'Clone folder',
    category: 'Projects',
    description: 'Where New clones GitHub repositories',
    keywords: ['repos', 'git', 'clone', 'github'],
    read: config => config.reposPath,
    display: config => toHomeRelativePath(config.reposPath),
    patch: (_config, value) => ({ repos_path: value.trim() }),
  },
  backend: {
    id: 'backend',
    kind: 'choice',
    title: 'Backend',
    category: 'General',
    description: 'Applies next launch; inside tmux or Herdr that one is always used',
    keywords: ['tmux', 'herdr', 'multiplexer'],
    options: () =>
      choiceOptions(BACKEND_OPTIONS, {
        auto: 'Detect current or running multiplexer',
        tmux: 'Require tmux',
        herdr: 'Require a running Herdr server',
      }),
    read: config => config.backend ?? 'auto',
    apply: (config, value) => ({
      ...config,
      backend: value === 'tmux' || value === 'herdr' ? value : undefined,
    }),
  },
  autoUpdate: {
    id: 'autoUpdate',
    kind: 'choice',
    title: 'Auto update',
    category: 'General',
    description: 'Install npm and Bun updates in the background; mise and Homebrew get a command',
    keywords: ['upgrade', 'version'],
    options: () =>
      choiceOptions(
        ['true', 'false'],
        { true: 'Check for updates automatically', false: 'Disable automatic update checks' },
        ON_OFF_LABELS
      ),
    read: config => String(config.autoUpdate),
    apply: (config, value) => ({ ...config, autoUpdate: value === 'true' }),
  },
  searchHistory: {
    id: 'searchHistory',
    kind: 'choice',
    title: 'Search history',
    category: 'General',
    description: 'Rank matches by what you open; stored only on this machine',
    keywords: ['frecency', 'ranking', 'privacy'],
    options: () =>
      choiceOptions(
        ['true', 'false'],
        {
          true: 'Remember opens locally and rank matches you open often first',
          false: 'Record nothing and rank by match only',
        },
        ON_OFF_LABELS
      ),
    read: config => String(config.searchHistory !== false),
    apply: (config, value) => ({ ...config, searchHistory: value === 'true' }),
  },
} satisfies { readonly [Id in SettingsFieldId]: SettingDefinition & { id: Id } }

const SETTINGS_LIST = Object.values<SettingDefinition>(SETTINGS)

function getSetting(field: SettingsFieldId): SettingDefinition {
  return SETTINGS[field]
}

// Lists and rules are JSON underneath: the JSON editor reads and writes them as one document.
function isJsonEdited(
  setting: SettingDefinition
): setting is JsonSetting | ListSetting | RulesSetting {
  return setting.kind === 'json' || setting.kind === 'list' || setting.kind === 'rules'
}

export function getSettingCollection(field: SettingsFieldId): SettingCollection | undefined {
  const setting = getSetting(field)

  switch (setting.kind) {
    case 'list':
      return { kind: 'list', id: setting.id }
    case 'rules':
      return { kind: 'rules', id: setting.id }
    case 'choice':
    case 'picker':
    case 'number':
    case 'text':
    case 'json':
    case 'form':
      return undefined
  }
}

function optionLabel(options: readonly SettingsOption[], value: string): string {
  return options.find(option => option.value === value)?.label ?? value
}

function displayValue(setting: SettingDefinition, config: Config): string {
  switch (setting.kind) {
    case 'choice':
    case 'picker':
      return optionLabel(setting.options(config), setting.read(config))
    case 'number':
      return setting.format(setting.read(config))
    case 'text':
      return setting.display(config)
    case 'json':
    case 'list':
    case 'rules':
    case 'form':
      return setting.summary(config)
  }
}

// The value as stored, compared with the default to decide whether it was changed.
function storedValue(setting: SettingDefinition, config: Config): string {
  switch (setting.kind) {
    case 'choice':
    case 'picker':
    case 'text':
      return setting.read(config)
    case 'number':
      return String(setting.read(config))
    case 'json':
    case 'list':
    case 'rules':
    case 'form':
      return JSON.stringify(setting.read(config))
  }
}

function controlOf(setting: SettingDefinition, config: Config): SettingsControl {
  switch (setting.kind) {
    case 'choice':
      return setting.options(config).length === 2 ? 'toggle' : 'cycle'
    case 'number':
      return 'step'
    case 'picker':
    case 'text':
    case 'json':
    case 'list':
    case 'rules':
    case 'form':
      return 'open'
  }
}

function resetOf(setting: SettingDefinition, config: Config, defaults: Config): SettingsReset {
  if (storedValue(setting, config) === storedValue(setting, defaults)) return 'default'

  return isJsonEdited(setting) || setting.kind === 'form' ? 'unavailable' : 'available'
}

export function getSettingsEntries(config: Config, homeDir: string): SettingsEntry[] {
  const defaults = getDefaultConfig(homeDir)

  return SETTINGS_LIST.map(setting => ({
    id: setting.id,
    title: setting.title,
    category: setting.category,
    description: setting.description,
    keywords: setting.keywords.join(' '),
    value: displayValue(setting, config),
    control: controlOf(setting, config),
    reset: resetOf(setting, config, defaults),
  }))
}

export function getSettingEditorValue(config: Config, field: SettingsFieldId): string {
  const setting = getSetting(field)

  switch (setting.kind) {
    case 'text':
      return setting.read(config)
    case 'json':
    case 'list':
    case 'rules':
      return formatJSON(config, setting.key, setting.read(config))
    case 'picker':
      return setting.custom ? setting.read(config) : ''
    case 'choice':
    case 'number':
    case 'form':
      return ''
  }
}

const EDITOR_DESCRIPTION = 'Edit value and press Enter to apply immediately'

export function getSettingEditorDescription(field: SettingsFieldId): string {
  const setting = getSetting(field)

  return setting.kind === 'picker' && setting.custom
    ? setting.custom.description
    : EDITOR_DESCRIPTION
}

export function getSettingOptions(config: Config, field: SettingsFieldId): SettingsOption[] {
  const setting = getSetting(field)

  return setting.kind === 'choice' || setting.kind === 'picker' ? setting.options(config) : []
}

// The stored value: an option value for choices, so it matches the picker's options.
export function getSettingValue(config: Config, field: SettingsFieldId): string {
  const setting = getSetting(field)

  return isJsonEdited(setting) || setting.kind === 'form'
    ? setting.summary(config)
    : storedValue(setting, config)
}

// The value as the Settings row shows it.
export function getSettingDisplayValue(config: Config, field: SettingsFieldId): string {
  return displayValue(getSetting(field), config)
}

export function getSelectedOptionIndex(config: Config, field: SettingsFieldId): number {
  const current = getSettingValue(config, field)

  return Math.max(
    0,
    getSettingOptions(config, field).findIndex(option => option.value === current)
  )
}

export function isOptionSetting(field: SettingsFieldId): boolean {
  const { kind } = getSetting(field)

  return kind === 'choice' || kind === 'picker'
}

export function applyOptionSetting(config: Config, field: SettingsFieldId, value: string): Config {
  const setting = getSetting(field)

  return setting.kind === 'choice' || setting.kind === 'picker'
    ? setting.apply(config, value)
    : config
}

function editorPatch(
  setting: SettingDefinition,
  config: Config,
  value: string
): SerializedConfigPatch | undefined {
  switch (setting.kind) {
    case 'text':
      return setting.patch(config, value)
    case 'json':
    case 'list':
    case 'rules':
      return setting.patch(decodeJsonText(value))
    case 'choice':
    case 'picker':
    case 'number':
    case 'form':
      return undefined
  }
}

export function applyEditorSetting(
  config: Config,
  field: SettingsFieldId,
  value: string,
  homeDir: string
): Config {
  const patch = editorPatch(getSetting(field), config, value)

  if (!patch) return config

  // Round-trip through JSON text, as a save and reload would, so the merge is a plain JSON document.
  const document = decodeJsonText(JSON.stringify({ ...serializeConfig(config), ...patch }))

  return normalizeConfig(document, homeDir)
}

// An edit either makes the next config or says what to fix; nothing is saved from an invalid one.
export type SettingEdit =
  | { readonly kind: 'parsed'; readonly config: Config }
  | { readonly kind: 'invalid'; readonly message: string }

const SHOWN_ISSUES = 1

// A config issue named from inside the edited value: `projects[0].listed` reads `[0].listed`.
function describeIssue(issue: ConfigIssue, key: JsonDocumentKey): string {
  const inner = issue.path.startsWith(key) ? issue.path.slice(key.length) : issue.path
  const subject = inner.replace(/^\./, '') || 'The value'

  if (issue.expected === 'required') return `${subject} is required`

  if (issue.expected.startsWith('expected '))
    return `${subject} must be ${issue.expected.slice('expected '.length)}`

  return `${subject} is not valid`
}

function checkJsonSetting(
  setting: JsonSetting | ListSetting | RulesSetting,
  text: string
): string | undefined {
  const syntax = JsonSyntaxIssue.find(text)

  if (syntax) return JsonSyntaxIssue.describe(syntax)

  const document = decodeJsonText(JSON.stringify(setting.patch(decodeJsonText(text))))
  const issues = checkConfigDocument(document)
  const [first] = issues

  if (!first) return undefined

  const more = issues.length > SHOWN_ISSUES ? ` (and ${issues.length - SHOWN_ISSUES} more)` : ''

  return `${describeIssue(first, setting.key)}${more}`
}

// Checks the text the way the config file is checked on load, then applies it.
export function editSetting(
  config: Config,
  field: SettingsFieldId,
  value: string,
  homeDir: string
): SettingEdit {
  const setting = getSetting(field)

  if (setting.kind === 'picker' && setting.custom) {
    const parsed = setting.custom.parse(value)

    return parsed.kind === 'parsed'
      ? { kind: 'parsed', config: setting.apply(config, parsed.value) }
      : { kind: 'invalid', message: parsed.reason }
  }

  const invalid = isJsonEdited(setting) ? checkJsonSetting(setting, value) : undefined

  if (invalid) return { kind: 'invalid', message: invalid }

  return { kind: 'parsed', config: applyEditorSetting(config, field, value, homeDir) }
}

// Lists and rules open the raw JSON editor (from their panes); other editable settings open a
// one-line field.
export function isJsonSetting(field: SettingsFieldId): boolean {
  return isJsonEdited(getSetting(field))
}

// Icons open their own form.
export function isFormSetting(field: SettingsFieldId): boolean {
  return getSetting(field).kind === 'form'
}

// The value one step away: a number stops at its limits, choices wrap around. Undefined when the
// setting does not step or is already at its limit.
export function stepSetting(
  config: Config,
  field: SettingsFieldId,
  direction: 1 | -1
): Config | undefined {
  const setting = getSetting(field)

  switch (setting.kind) {
    case 'number': {
      const current = setting.read(config)

      if (direction > 0 ? current >= setting.max : current <= setting.min) return undefined

      return setting.apply(
        config,
        Math.min(setting.max, Math.max(setting.min, current + direction))
      )
    }

    case 'choice': {
      const options = setting.options(config)
      const current = options.findIndex(option => option.value === setting.read(config))
      const next = options[(current + direction + options.length) % options.length]

      return next ? setting.apply(config, next.value) : undefined
    }

    case 'picker':
    case 'text':
    case 'json':
    case 'list':
    case 'rules':
    case 'form':
      return undefined
  }
}

// The config with this setting back at its default; undefined when it already is, or when the
// setting is a list that is never reset with one key.
export function resetSetting(
  config: Config,
  field: SettingsFieldId,
  homeDir: string
): Config | undefined {
  const setting = getSetting(field)
  const defaults = getDefaultConfig(homeDir)

  if (resetOf(setting, config, defaults) !== 'available') return undefined

  switch (setting.kind) {
    case 'choice':
    case 'picker':
      return setting.apply(config, setting.read(defaults))
    case 'number':
      return setting.apply(config, setting.read(defaults))
    case 'text':
      return applyEditorSetting(config, field, setting.read(defaults), homeDir)
    case 'json':
    case 'list':
    case 'rules':
    case 'form':
      return undefined
  }
}

// Saves compare the written document, so a change that writes the same file is no change.
export function isSettingsChange(before: Config, after: Config): boolean {
  return JSON.stringify(serializeConfig(before)) !== JSON.stringify(serializeConfig(after))
}

export function getSettingEditorTitle(field: SettingsFieldId): string {
  return getSetting(field).title
}

export function getSettingDescription(field: SettingsFieldId): string {
  return getSetting(field).description
}
