import { expandHomePath } from './config'
import { DraftCheck, SettingChange } from './setting-change'
import { getSettingDisplayValue, type RulesSettingId } from './settings'
import type { Config, ProjectProfile, ProjectWildcard } from './types'
import { normalizePathForMatching } from './util/glob'

export type RuleField = RulesSettingId

// `key` is the rule's path (project rules) or pattern (wildcard rules).
export type RuleFormField =
  'key' | 'sessionName' | 'startupCommand' | 'previewCommand' | 'listed' | 'icon'

export type RuleTextField = Exclude<RuleFormField, 'listed'>

// Project and wildcard rules read alike; only project rules have `listed` and `icon`.
export interface RuleEntry {
  readonly key: string
  readonly sessionName?: string
  readonly startupCommand?: string
  readonly previewCommand?: string
  readonly listed?: boolean
  readonly icon?: string
}

export type RuleValue =
  | { readonly kind: 'set'; readonly text: string }
  | { readonly kind: 'inherited'; readonly text: string }

export interface RuleFormRow {
  readonly field: RuleFormField
  readonly label: string
  readonly value: RuleValue
  readonly control: 'edit' | 'toggle'
  // Whether ctrl+r has an override to clear; the path or pattern is never cleared.
  readonly reset: 'available' | 'none'
  readonly description: string
}

const PROJECT_FIELDS: readonly RuleFormField[] = [
  'key',
  'sessionName',
  'startupCommand',
  'previewCommand',
  'listed',
  'icon',
]

const WILDCARD_FIELDS: readonly RuleFormField[] = [
  'key',
  'sessionName',
  'startupCommand',
  'previewCommand',
]

const LABELS: Record<Exclude<RuleFormField, 'key'>, string> = {
  sessionName: 'Session name',
  startupCommand: 'Startup command',
  previewCommand: 'Preview command',
  listed: 'Listed',
  icon: 'Icon',
}

const DESCRIPTIONS: Record<Exclude<RuleFormField, 'key'>, string> = {
  sessionName: 'Unset, the name comes from the folder name and Name depth',
  startupCommand: '{file}, {dir} and {} are replaced for files opened from New',
  previewCommand: 'Runs in details for this folder; {} is the path',
  listed: 'Shown in Sessions before a session exists for it',
  icon: 'Glyph before the row title in Sessions',
}

function fromProject(profile: ProjectProfile): RuleEntry {
  return { ...profile, key: profile.path }
}

function fromWildcard(wildcard: ProjectWildcard): RuleEntry {
  return { ...wildcard, key: wildcard.pattern }
}

function entries(config: Config, field: RuleField): readonly RuleEntry[] {
  switch (field) {
    case 'projects':
      return (config.projects ?? []).map(fromProject)
    case 'wildcards':
      return (config.wildcards ?? []).map(fromWildcard)
  }
}

function withEntries(config: Config, field: RuleField, next: readonly RuleEntry[]): Config {
  switch (field) {
    case 'projects':
      return {
        ...config,
        projects: next.map(entry => ({
          path: entry.key,
          sessionName: entry.sessionName,
          startupCommand: entry.startupCommand,
          previewCommand: entry.previewCommand,
          listed: entry.listed,
          icon: entry.icon,
        })),
      }

    case 'wildcards':
      return {
        ...config,
        wildcards: next.map(entry => ({
          pattern: entry.key,
          sessionName: entry.sessionName,
          startupCommand: entry.startupCommand,
          previewCommand: entry.previewCommand,
        })),
      }
  }
}

function fields(field: RuleField): readonly RuleFormField[] {
  return field === 'projects' ? PROJECT_FIELDS : WILDCARD_FIELDS
}

function homeRelative(path: string, homeDir: string): string {
  if (path === homeDir) return '~'

  return path.startsWith(`${homeDir}/`) ? `~${path.slice(homeDir.length)}` : path
}

function noun(field: RuleField): string {
  return field === 'projects' ? 'folder' : 'pattern'
}

function required(field: RuleField): string {
  return `A ${noun(field)} is required`
}

// The rule another rule's path or pattern already uses, if any; `except` may keep its own.
function duplicateOf(
  config: Config,
  field: RuleField,
  key: string,
  except: number | undefined
): RuleEntry | undefined {
  const wanted = normalizePathForMatching(key)

  return entries(config, field).find(
    (entry, index) => index !== except && normalizePathForMatching(entry.key) === wanted
  )
}

function duplicateMessage(entry: RuleEntry, homeDir: string): string {
  return `There is already a rule for ${homeRelative(entry.key, homeDir)}`
}

function storedKey(draft: string, homeDir: string): string {
  return expandHomePath(draft.trim(), homeDir)
}

function checkKey(
  config: Config,
  field: RuleField,
  draft: string,
  homeDir: string,
  folderExists: (path: string) => boolean,
  except?: number
): DraftCheck {
  if (draft.trim().length === 0) return DraftCheck.empty

  const key = storedKey(draft, homeDir)
  const duplicate = duplicateOf(config, field, key, except)

  if (duplicate) return DraftCheck.invalid(duplicateMessage(duplicate, homeDir))

  // The config allows a rule for a folder that does not exist yet.
  if (field === 'projects' && !folderExists(key)) {
    return DraftCheck.warning(
      `${homeRelative(key, homeDir)} does not exist yet; the rule applies once it does`
    )
  }

  return DraftCheck.ok
}

function keyChange(
  config: Config,
  field: RuleField,
  draft: string,
  homeDir: string,
  except: number | undefined
): { kind: 'key'; key: string } | { kind: 'invalid'; message: string } {
  if (draft.trim().length === 0) return { kind: 'invalid', message: required(field) }

  const key = storedKey(draft, homeDir)
  const duplicate = duplicateOf(config, field, key, except)

  return duplicate
    ? { kind: 'invalid', message: duplicateMessage(duplicate, homeDir) }
    : { kind: 'key', key }
}

function add(config: Config, field: RuleField, draft: string, homeDir: string): SettingChange {
  const key = keyChange(config, field, draft, homeDir, undefined)

  if (key.kind === 'invalid') return SettingChange.invalid(key.message)

  return SettingChange.checked(
    config,
    withEntries(config, field, [...entries(config, field), { key: key.key }]),
    homeDir
  )
}

function updated(
  config: Config,
  field: RuleField,
  index: number,
  change: (entry: RuleEntry) => RuleEntry,
  homeDir: string
): SettingChange {
  const current = entries(config, field)

  if (current[index] === undefined) return SettingChange.unchanged

  const next = current.map((entry, position) => (position === index ? change(entry) : entry))

  return SettingChange.checked(config, withEntries(config, field, next), homeDir)
}

// An empty value clears the override, so the rule inherits it again.
function setText(
  config: Config,
  field: RuleField,
  index: number,
  formField: RuleTextField,
  draft: string,
  homeDir: string
): SettingChange {
  if (formField === 'key') {
    const key = keyChange(config, field, draft, homeDir, index)

    if (key.kind === 'invalid') return SettingChange.invalid(key.message)

    return updated(config, field, index, entry => ({ ...entry, key: key.key }), homeDir)
  }

  const value = draft.trim()

  return updated(
    config,
    field,
    index,
    entry => ({ ...entry, [formField]: value.length > 0 ? value : undefined }),
    homeDir
  )
}

function toggle(config: Config, field: RuleField, index: number, homeDir: string): SettingChange {
  return updated(
    config,
    field,
    index,
    entry => ({ ...entry, listed: !(entry.listed ?? false) }),
    homeDir
  )
}

function clear(
  config: Config,
  field: RuleField,
  index: number,
  formField: RuleFormField,
  homeDir: string
): SettingChange {
  if (formField === 'key') return SettingChange.unchanged

  return updated(config, field, index, entry => ({ ...entry, [formField]: undefined }), homeDir)
}

function remove(config: Config, field: RuleField, index: number, homeDir: string): SettingChange {
  const next = entries(config, field).filter((_entry, position) => position !== index)

  return SettingChange.checked(config, withEntries(config, field, next), homeDir)
}

function move(
  config: Config,
  field: RuleField,
  index: number,
  direction: 1 | -1,
  homeDir: string
): SettingChange {
  const next = SettingChange.moved(entries(config, field), index, direction)

  return next
    ? SettingChange.checked(config, withEntries(config, field, next), homeDir)
    : SettingChange.unchanged
}

// A rule row's value column: its overrides only.
function summary(entry: RuleEntry): string {
  const parts = [
    entry.sessionName,
    entry.startupCommand,
    entry.previewCommand === undefined ? undefined : 'custom preview',
    entry.listed === true ? 'listed' : undefined,
    entry.icon,
  ].filter(part => part !== undefined && part.length > 0)

  return parts.length > 0 ? parts.join(' · ') : 'defaults'
}

function sentence(parts: readonly string[]): string {
  const text = parts.join(', ')

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

// The selected rule's line under the list.
function detail(entry: RuleEntry): string {
  const parts = [
    entry.sessionName === undefined ? undefined : `session ${entry.sessionName}`,
    entry.startupCommand === undefined ? undefined : `starts ${entry.startupCommand}`,
    entry.previewCommand === undefined ? undefined : `previews with ${entry.previewCommand}`,
    entry.listed === true ? 'listed before it has a session' : undefined,
    entry.listed === false ? 'not listed until it has a session' : undefined,
    entry.icon === undefined ? undefined : `icon ${entry.icon}`,
  ].filter(part => part !== undefined)

  return parts.length > 0 ? sentence(parts) : 'Uses the default session settings'
}

function keyLabel(field: RuleField): string {
  return field === 'projects' ? 'Path' : 'Pattern'
}

function keyDescription(field: RuleField): string {
  return field === 'projects'
    ? 'The exact folder this rule applies to'
    : 'Folders matching this glob use the rule; ** spans folders and the first match wins'
}

function inherited(text: string): RuleValue {
  return { kind: 'inherited', text }
}

function set(text: string): RuleValue {
  return { kind: 'set', text }
}

function valueOf(config: Config, entry: RuleEntry, formField: RuleFormField, homeDir: string) {
  switch (formField) {
    case 'key':
      return set(homeRelative(entry.key, homeDir))
    case 'sessionName':
      return entry.sessionName === undefined
        ? inherited('default · from the folder name')
        : set(entry.sessionName)
    case 'startupCommand':
      return entry.startupCommand === undefined
        ? inherited(`default · ${getSettingDisplayValue(config, 'startupCommand')}`)
        : set(entry.startupCommand)
    case 'previewCommand':
      return entry.previewCommand === undefined
        ? inherited(`default · ${getSettingDisplayValue(config, 'previewCommand')}`)
        : set(entry.previewCommand)
    case 'listed':
      return entry.listed === undefined ? inherited('off') : set(entry.listed ? 'on' : 'off')
    case 'icon': {
      const glyph = config.icons?.configured

      if (entry.icon !== undefined) return set(entry.icon)

      return inherited(glyph ? `default · ${glyph}` : 'default')
    }
  }
}

function isSet(entry: RuleEntry, formField: RuleFormField): boolean {
  return formField !== 'key' && entry[formField] !== undefined
}

function form(config: Config, field: RuleField, index: number, homeDir: string): RuleFormRow[] {
  const entry = entries(config, field)[index]

  if (!entry) return []

  return fields(field).map(formField => ({
    field: formField,
    label: formField === 'key' ? keyLabel(field) : LABELS[formField],
    value: valueOf(config, entry, formField, homeDir),
    control: formField === 'listed' ? 'toggle' : 'edit',
    reset: isSet(entry, formField) ? 'available' : 'none',
    description: formField === 'key' ? keyDescription(field) : DESCRIPTIONS[formField],
  }))
}

// The text an inline field opens with: the override, or nothing while it is inherited.
function draftOf(entry: RuleEntry, formField: RuleTextField, homeDir: string): string {
  if (formField === 'key') return homeRelative(entry.key, homeDir)

  return entry[formField] ?? ''
}

function removePrompt(field: RuleField, entry: RuleEntry, homeDir: string): string {
  const key = homeRelative(entry.key, homeDir)

  return field === 'projects'
    ? `Remove the rule for ${key}? Its session keeps running.`
    : `Remove the rule for ${key}? Sessions it started keep running.`
}

function display(entry: RuleEntry, homeDir: string): string {
  return homeRelative(entry.key, homeDir)
}

export const Rules = {
  entries,
  checkKey,
  add,
  setText,
  toggle,
  clear,
  remove,
  move,
  summary,
  detail,
  form,
  draftOf,
  removePrompt,
  display,
} as const
