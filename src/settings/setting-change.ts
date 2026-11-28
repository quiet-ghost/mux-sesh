import * as Schema from 'effect/Schema'
import { normalizeConfig, serializeConfig } from '../config'
import { checkConfigDocument } from '../config/config-document'
import type { Config } from '../types'
import { isSettingsChange } from './settings-edit'

// One edit to a list or rule setting: the config to save, nothing to save, or why it was refused.
export type SettingChange =
  | { readonly kind: 'changed'; readonly config: Config }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'invalid'; readonly message: string }

// A draft as it is typed: `empty` is only an error once it is applied; a warning still saves.
export type DraftCheck =
  | { readonly kind: 'ok' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'warning'; readonly message: string }

const decodeJsonText = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))

const unchanged: SettingChange = { kind: 'unchanged' }

function invalid(message: string): SettingChange {
  return { kind: 'invalid', message }
}

// The edited config goes through the written document, the config boundary's schema and a reload,
// so what is saved is exactly what loads next time.
function checked(before: Config, next: Config, homeDir: string): SettingChange {
  const document = decodeJsonText(JSON.stringify(serializeConfig(next)))
  const issues = checkConfigDocument(document)

  if (issues.length > 0) {
    return invalid(issues.map(issue => `${issue.path} ${issue.expected}`).join('; '))
  }

  const config = normalizeConfig(document, homeDir)

  return isSettingsChange(before, config) ? { kind: 'changed', config } : unchanged
}

// Moves one entry a step, or returns undefined at either end.
function moved<T>(items: readonly T[], index: number, direction: 1 | -1): T[] | undefined {
  const target = index + direction
  const item = items[index]
  const other = items[target]

  if (item === undefined || other === undefined) return undefined

  const next = [...items]
  next[target] = item
  next[index] = other

  return next
}

const ok: DraftCheck = { kind: 'ok' }
const empty: DraftCheck = { kind: 'empty' }

function draftInvalid(message: string): DraftCheck {
  return { kind: 'invalid', message }
}

function warning(message: string): DraftCheck {
  return { kind: 'warning', message }
}

export const SettingChange = { unchanged, invalid, checked, moved } as const

export const DraftCheck = { ok, empty, invalid: draftInvalid, warning } as const
