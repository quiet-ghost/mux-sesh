import { getDefaultConfig, normalizeConfig, serializeConfig } from '../config'
import { checkConfigDocument, type ConfigIssue } from '../config/config-document'
import type { Config } from '../types'
import { JsonSyntaxIssue } from './json-syntax'
import {
  decodeJsonText,
  getSetting,
  isJsonEdited,
  resetOf,
  type JsonDocumentKey,
  type JsonSetting,
  type ListSetting,
  type RulesSetting,
  type SerializedConfigPatch,
  type SettingDefinition,
  type SettingsFieldId,
} from './settings-catalog'

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
