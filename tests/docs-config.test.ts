import { join } from 'path'
import { describe, expect, test } from 'bun:test'
import { Schema } from 'effect'
import { CONFIG_DOCUMENT_KEYS, checkConfigDocument } from '../src/config/config-document'
import { renderConfigSchema, SCHEMA_PATH } from '../tools/schema/generate'

const ROOT = join(import.meta.dir, '..')

const USER_DOCS = [
  'README.md',
  'docs/configuration.md',
  'docs/keybindings.md',
  'docs/themes.md',
  'docs/workflows.md',
]

const decodeJson = Schema.decodeUnknownSync(Schema.Json)

const decodeSchemaFile = Schema.decodeUnknownSync(
  Schema.Struct({ properties: Schema.Record(Schema.String, Schema.Unknown) })
)

async function read(path: string): Promise<string> {
  return Bun.file(join(ROOT, path)).text()
}

function parseJson(text: string): Schema.Json {
  const parsed: unknown = JSON.parse(text)

  return decodeJson(parsed)
}

function jsonBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```json\n([\s\S]*?)^```$/gm)].flatMap(match =>
    match[1] ? [match[1]] : []
  )
}

// The options table that follows the marker: one row per snake_case option.
function documentedOptions(markdown: string): string[] {
  const [, after = ''] = markdown.split('<!-- config-options -->')
  const lines = after.trimStart().split('\n')
  const end = lines.findIndex(line => !line.startsWith('|'))
  const rows = end === -1 ? lines : lines.slice(0, end)

  return rows.slice(2).flatMap(row => {
    const option = /^\|\s*`([^`]+)`/.exec(row)?.[1]

    return option ? [option] : []
  })
}

describe('config schema', () => {
  test('the committed schema is the generated one; run `bun run schema` to refresh it', async () => {
    expect(await Bun.file(SCHEMA_PATH).text()).toBe(await renderConfigSchema())
  })

  test('the schema lists exactly the fields the runtime contract accepts', async () => {
    const schema = decodeSchemaFile(parseJson(await Bun.file(SCHEMA_PATH).text()))

    expect(Object.keys(schema.properties).sort()).toEqual([...CONFIG_DOCUMENT_KEYS].sort())
  })
})

describe('documented config examples', () => {
  test('config.example.json is a valid config', async () => {
    expect(checkConfigDocument(parseJson(await read('config.example.json')))).toEqual([])
  })

  test.each(USER_DOCS)('every JSON example in %s is a valid config', async path => {
    for (const block of jsonBlocks(await read(path))) {
      expect(checkConfigDocument(parseJson(block))).toEqual([])
    }
  })

  test('the docs carry JSON examples to check', async () => {
    const blocks = await Promise.all(USER_DOCS.map(async path => jsonBlocks(await read(path))))

    expect(blocks.flat().length).toBeGreaterThan(5)
  })

  test('docs/configuration.md documents every option, in its snake_case spelling', async () => {
    const documented = documentedOptions(await read('docs/configuration.md'))
    const snakeCase = [...CONFIG_DOCUMENT_KEYS].filter(key => key === key.toLowerCase())

    expect(documented.sort()).toEqual(snakeCase.sort())
  })
})
