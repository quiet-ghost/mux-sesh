import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Schema } from 'effect'
import { createCommandRunner } from '../src/multiplexer/command'
import { createHerdrSimulator } from './fixtures/herdr-simulator'

// Checks the protocol-22 simulator against the installed Herdr's bundled API schema, so the
// conformance fixtures cannot drift from the wire format. `herdr api schema --output` only writes
// a static file: it never starts, contacts, or changes a Herdr server. Opt-in because the answer
// depends on the installed Herdr version:
//   MUX_SESH_HERDR_SCHEMA_TESTS=1 bun test tests/backend-conformance-schema.test.ts
const enabled = process.env.MUX_SESH_HERDR_SCHEMA_TESTS === '1' && Bun.which('herdr') !== null

const Definition = Schema.Struct({ required: Schema.optionalKey(Schema.Array(Schema.String)) })

const ApiSchema = Schema.fromJsonString(
  Schema.Struct({
    protocol: Schema.Finite,
    schemas: Schema.Struct({
      success_response: Schema.Struct({ $defs: Schema.Record(Schema.String, Definition) }),
    }),
  })
)

const Fields = Schema.Record(Schema.String, Schema.Json)

const SnapshotReply = Schema.fromJsonString(
  Schema.Struct({
    result: Schema.Struct({
      snapshot: Schema.Struct({
        workspaces: Schema.Array(Fields),
        tabs: Schema.Array(Fields),
        panes: Schema.Array(Fields),
        layouts: Schema.Array(Fields),
      }),
    }),
  })
)

const CreatedReply = Schema.fromJsonString(
  Schema.Struct({ result: Schema.Struct({ workspace: Fields, tab: Fields, root_pane: Fields }) })
)

const InfoReply = Schema.fromJsonString(
  Schema.Struct({ result: Schema.Struct({ workspace: Fields }) })
)

const sandbox = { root: '', schema: '' }

beforeAll(async () => {
  if (!enabled) return

  sandbox.root = await mkdtemp(join(tmpdir(), 'mux-sesh-herdr-schema-'))

  const output = join(sandbox.root, 'schema.json')
  const result = await createCommandRunner().run(['herdr', 'api', 'schema', '--output', output])

  if (result.exitCode !== 0) throw new Error(`herdr api schema failed: ${result.stderr}`)

  sandbox.schema = await Bun.file(output).text()
})

afterAll(async () => {
  if (sandbox.root) await rm(sandbox.root, { recursive: true, force: true })
})

function requiredKeys(definition: string): readonly string[] {
  const schema = Schema.decodeUnknownSync(ApiSchema)(sandbox.schema)

  return schema.schemas.success_response.$defs[definition]?.required ?? []
}

function missingKeys(
  definition: string,
  entity: Readonly<Record<string, Schema.Json>> | undefined
): string[] {
  const present = new Set(Object.keys(entity ?? {}))

  return requiredKeys(definition).filter(key => !present.has(key))
}

describe.skipIf(!enabled)('Herdr protocol-22 fixture against the installed API schema', () => {
  test('the installed Herdr speaks the protocol the fixture records', () => {
    expect(Schema.decodeUnknownSync(ApiSchema)(sandbox.schema).protocol).toBe(22)

    for (const definition of ['WorkspaceInfo', 'TabInfo', 'PaneInfo', 'PaneLayoutSnapshot']) {
      expect(requiredKeys(definition).length).toBeGreaterThan(0)
    }
  })

  test('snapshot, create, and rename replies carry every required field', async () => {
    const sim = createHerdrSimulator('protocol-22')
    const seeded = sim.seed('api', '/fixture/api')

    const snapshot = Schema.decodeUnknownSync(SnapshotReply)(
      (await sim.runner.run(['herdr', 'api', 'snapshot'])).stdout
    ).result.snapshot

    const created = Schema.decodeUnknownSync(CreatedReply)(
      (
        await sim.runner.run([
          'herdr',
          'workspace',
          'create',
          '--cwd',
          '/fixture/web',
          '--label',
          'web',
        ])
      ).stdout
    ).result

    const renamed = Schema.decodeUnknownSync(InfoReply)(
      (await sim.runner.run(['herdr', 'workspace', 'rename', seeded.workspaceId, 'api-2'])).stdout
    ).result

    expect({
      WorkspaceInfo: missingKeys('WorkspaceInfo', snapshot.workspaces[0]),
      TabInfo: missingKeys('TabInfo', snapshot.tabs[0]),
      PaneInfo: missingKeys('PaneInfo', snapshot.panes[0]),
      PaneLayoutSnapshot: missingKeys('PaneLayoutSnapshot', snapshot.layouts[0]),
      createdWorkspace: missingKeys('WorkspaceInfo', created.workspace),
      createdTab: missingKeys('TabInfo', created.tab),
      createdRootPane: missingKeys('PaneInfo', created.root_pane),
      renamedWorkspace: missingKeys('WorkspaceInfo', renamed.workspace),
    }).toEqual({
      WorkspaceInfo: [],
      TabInfo: [],
      PaneInfo: [],
      PaneLayoutSnapshot: [],
      createdWorkspace: [],
      createdTab: [],
      createdRootPane: [],
      renamedWorkspace: [],
    })
  })
})
