import { join } from 'path'
import { describe, expect, test } from 'bun:test'
import { getActionKeys, type ActionContext } from '../src/app/action-catalog'
import { PendingClose } from '../src/app/pending-close'
import { AppMode, ViewMode, type KeybindMode } from '../src/types'
import { ACTION_IDS, EVERY_ACTION_LISTED } from './fixtures/action-ids'

const ROOT = join(import.meta.dir, '..')

// The defaults the docs are written for; prefix_key always resolves to a key, ctrl+x by default.
const DOCUMENTED_PREFIX = 'ctrl+x'

// Standard mode never enters Normal: it starts in, and returns to, Search.
const REACHABLE: readonly (readonly [KeybindMode, AppMode])[] = [
  ['vim', AppMode.Normal],
  ['vim', AppMode.Search],
  ['vim', AppMode.NewSession],
  ['vim', AppMode.AgentsManage],
  ['standard', AppMode.Search],
  ['standard', AppMode.NewSession],
  ['standard', AppMode.AgentsManage],
]

interface KeyTable {
  readonly file: string
  readonly keybindMode: KeybindMode
  readonly mode: AppMode
  // A subset table may list fewer actions; a full table must list every catalog key.
  readonly subset: boolean
  readonly keys: readonly string[]
}

function parseKeybindMode(text: string): KeybindMode | undefined {
  return text === 'vim' || text === 'standard' ? text : undefined
}

function parseMode(text: string): AppMode | undefined {
  switch (text) {
    case 'normal':
      return AppMode.Normal
    case 'search':
      return AppMode.Search
    case 'new':
      return AppMode.NewSession
    case 'agents':
      return AppMode.AgentsManage
  }

  return undefined
}

const MARKER = /^<!-- keys: (\S+) (\S+)( subset)? -->$/

function tableKeys(lines: readonly string[], start: number): string[] {
  const rows: string[] = []

  for (const line of lines.slice(start)) {
    if (line.trim() === '' && rows.length === 0) continue

    if (!line.startsWith('|')) break

    rows.push(line)
  }

  // Header and separator rows name no keys.
  return rows.slice(2).flatMap(row => {
    const cell = row.split('|')[1] ?? ''

    return [...cell.matchAll(/`([^`]+)`/g)].flatMap(match => (match[1] ? [match[1]] : []))
  })
}

async function readKeyTables(file: string): Promise<KeyTable[]> {
  const lines = (await Bun.file(join(ROOT, file)).text()).split('\n')

  return lines.flatMap((line, index) => {
    const marker = MARKER.exec(line.trim())

    if (!marker) return []

    const keybindMode = parseKeybindMode(marker[1] ?? '')
    const mode = parseMode(marker[2] ?? '')

    if (!keybindMode || mode === undefined)
      throw new Error(`${file}:${index + 1}: bad marker ${line}`)

    return [
      { file, keybindMode, mode, subset: Boolean(marker[3]), keys: tableKeys(lines, index + 1) },
    ]
  })
}

function catalogKeys(keybindMode: KeybindMode, mode: AppMode): string[] {
  const context: ActionContext = {
    appMode: mode,
    viewMode: ViewMode.Sessions,
    keybindMode,
    prefixKey: DOCUMENTED_PREFIX,
    backend: null,
    agentCount: 0,
    target: { kind: 'none' },
    marked: new Map(),
    pendingClose: PendingClose.none,
  }

  return [...new Set(ACTION_IDS.flatMap(id => getActionKeys(context, id)))].sort()
}

const tables = [
  ...(await readKeyTables('docs/keybindings.md')),
  ...(await readKeyTables('README.md')),
]

describe('documented keys match the action catalog', () => {
  test('the docs check every action id', () => {
    expect(EVERY_ACTION_LISTED).toBe(true)
  })

  test('docs/keybindings.md has a full table for every reachable mode', () => {
    const covered = tables.flatMap(table =>
      table.file === 'docs/keybindings.md' && !table.subset
        ? [`${table.keybindMode} ${AppMode[table.mode]}`]
        : []
    )

    for (const [keybindMode, mode] of REACHABLE) {
      expect(covered).toContain(`${keybindMode} ${AppMode[mode]}`)
    }
  })

  test.each(
    tables.map(table => [`${table.file} ${table.keybindMode} ${AppMode[table.mode]}`, table])
  )('%s', (_name, table) => {
    const expected = catalogKeys(table.keybindMode, table.mode)
    const documented = [...new Set(table.keys)].sort()

    expect(documented.length).toBeGreaterThan(0)

    for (const key of documented) expect(expected).toContain(key)

    if (!table.subset) expect(documented).toEqual(expected)
  })
})
