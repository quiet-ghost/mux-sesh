import { join } from 'path'
import { JsonSchema, Schema } from 'effect'
import { format, resolveConfig } from 'prettier'
import { ConfigDocument } from '../../src/config/config-document'

export const SCHEMA_PATH = join(import.meta.dir, '..', '..', 'mux-sesh.schema.json')

// Published identity of the schema; users and editors may already point at these.
const HEADER = {
  $schema: JsonSchema.META_SCHEMA_URI_DRAFT_07,
  $id: 'https://github.com/quiet-ghost/mux-sesh/raw/master/mux-sesh.schema.json',
  title: 'mux-sesh configuration',
} as const

// The schema is derived from the config contract that validates config.json at startup, so the
// editor schema and the runtime accept the same fields.
export async function renderConfigSchema(): Promise<string> {
  const document = JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(ConfigDocument))

  const schema: JsonSchema.JsonSchema = { ...HEADER, ...document.schema }

  if (Object.keys(document.definitions).length > 0) schema.definitions = document.definitions

  const options = await resolveConfig(SCHEMA_PATH)

  return format(JSON.stringify(schema), { ...options, filepath: SCHEMA_PATH })
}

if (import.meta.main) {
  await Bun.write(SCHEMA_PATH, await renderConfigSchema())
  console.log(`Wrote ${SCHEMA_PATH}`)
}
