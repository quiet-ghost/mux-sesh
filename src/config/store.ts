import { mkdir, rename } from 'fs/promises'
import { dirname } from 'path'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import type { Config } from '../types'
import { CONFIG_DOCUMENT_KEYS, checkConfigDocument, ConfigInvalid } from './config-document'
import { getConfigPath, getHomeDir } from './paths'
import { getDefaultConfig, normalizeConfig, serializeConfig } from './config-normalize'

type ReadDocument =
  | { readonly kind: 'missing' }
  | { readonly kind: 'parsed'; readonly document: Schema.Json }
  | { readonly kind: 'unparseable'; readonly cause: Schema.SchemaError }

const decodeJsonText = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Json))
const asJsonObject = Schema.decodeUnknownOption(Schema.JsonObject)

async function readDocument(configPath: string): Promise<ReadDocument> {
  const file = Bun.file(configPath)

  if (!(await file.exists())) return { kind: 'missing' }

  const decoded = decodeJsonText(await file.text())

  return Result.isSuccess(decoded)
    ? { kind: 'parsed', document: decoded.success }
    : { kind: 'unparseable', cause: decoded.failure }
}

export async function loadConfig(): Promise<Config> {
  const homeDir = getHomeDir()
  const configPath = getConfigPath(homeDir)
  const read = await readDocument(configPath)

  if (read.kind === 'missing') {
    const defaultConfig = getDefaultConfig(homeDir)
    await saveConfig(defaultConfig, homeDir)

    return defaultConfig
  }

  if (read.kind === 'unparseable') {
    // The parser's own message can quote file content, so it stays in the cause, not the text.
    throw new Error(
      `Failed to parse mux-sesh config at ${configPath}: it is not valid JSON. Fix the JSON or move the file aside; existing config was not overwritten.`,
      { cause: read.cause }
    )
  }

  const issues = checkConfigDocument(read.document)

  if (issues.length > 0) throw new ConfigInvalid({ configPath, issues })

  return normalizeConfig(read.document, homeDir)
}

// Keys the writer doesn't own (future options, notes) survive a save; owned keys are rewritten in
// their canonical spelling, so a stale alias can't shadow the new value.
function userOwnedFields(document: Schema.Json): Schema.JsonObject {
  const object = asJsonObject(document)

  if (Option.isNone(object)) return {}

  return Object.fromEntries(
    Object.entries(object.value).filter(([key]) => !CONFIG_DOCUMENT_KEYS.has(key))
  )
}

export async function saveConfig(config: Config, homeDir = getHomeDir()): Promise<void> {
  const configPath = getConfigPath(homeDir)
  const existing = await readDocument(configPath)

  if (existing.kind === 'unparseable') {
    throw new Error(
      `The mux-sesh config at ${configPath} is no longer valid JSON, so the change was not saved. Fix the file, then try again.`,
      { cause: existing.cause }
    )
  }

  const preserved: Readonly<Record<string, Schema.Json>> =
    existing.kind === 'parsed' ? userOwnedFields(existing.document) : {}

  const document = { ...preserved, ...serializeConfig(config) }

  const temporaryPath = `${configPath}.${process.pid}.tmp`

  await mkdir(dirname(configPath), { recursive: true })
  await Bun.write(temporaryPath, JSON.stringify(document, null, 2))
  // Rename is atomic on one filesystem: a crash leaves either the old file or the new one.
  await rename(temporaryPath, configPath)
}
