import { afterEach, describe, expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { getOpenHistoryPath } from '../src/config/paths'
import {
  calculateFrecency,
  FRECENCY_BOOST_CAP,
  FRECENCY_ENTRY_LIMIT,
  frecencyBoost,
  FrecencyHistory,
  OpenKey,
} from '../src/search/frecency'
import { createOpenHistory, type OpenHistory } from '../src/search/frecency-store'
import type { Item } from '../src/items/item'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 26)

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mux-sesh-frecency-'))
  roots.push(root)

  return root
}

interface Clock {
  now: number
}

interface Harness {
  history: OpenHistory
  file: string
  clock: Clock
  reports: string[]
}

async function harness(file?: string, timeoutMs = 1000): Promise<Harness> {
  const path = file ?? join(await tempRoot(), 'state', 'mux-sesh', 'frecency.jsonl')
  const clock: Clock = { now: NOW }
  const reports: string[] = []

  const history = createOpenHistory({
    path: () => path,
    now: () => clock.now,
    timeoutMs,
    report: message => reports.push(message),
  })

  history.configure(true)

  return { history, file: path, clock, reports }
}

function line(key: string, frequency: number, lastOpen: number): string {
  return JSON.stringify({ key, frequency, lastOpen })
}

function session(title: string, overrides: Partial<Item> = {}): Item {
  return {
    title,
    desc: '',
    path: `/fixture/${title}`,
    isSession: true,
    itemKind: 'tmux',
    backend: 'tmux',
    sessionId: `$${title}`,
    ...overrides,
  }
}

function project(path: string, overrides: Partial<Item> = {}): Item {
  return { title: path, desc: '', path, isSession: false, itemKind: 'project', ...overrides }
}

describe('frecency math', () => {
  test('is frequency over one plus days since the last open', () => {
    expect(calculateFrecency({ key: 'k', frequency: 4, lastOpen: NOW }, NOW)).toBe(4)
    expect(calculateFrecency({ key: 'k', frequency: 4, lastOpen: NOW - DAY }, NOW)).toBe(2)
    expect(calculateFrecency({ key: 'k', frequency: 4, lastOpen: NOW - 3 * DAY }, NOW)).toBe(1)
  })

  test('treats an open from the future as now instead of inflating it', () => {
    expect(calculateFrecency({ key: 'k', frequency: 2, lastOpen: NOW + DAY }, NOW)).toBe(2)
  })

  test('the boost grows with frecency but stays below its cap', () => {
    expect(frecencyBoost(0)).toBe(0)
    expect(frecencyBoost(1)).toBeCloseTo(FRECENCY_BOOST_CAP / 2)
    expect(frecencyBoost(2)).toBeGreaterThan(frecencyBoost(1))
    expect(frecencyBoost(1_000_000)).toBeLessThan(FRECENCY_BOOST_CAP)
  })
})

describe('open keys', () => {
  test('name sessions by backend and title, never by their native id', () => {
    expect(OpenKey.ofItem(session('api', { sessionId: '$3' }))).toEqual(['session:tmux:api'])
    expect(OpenKey.ofItem(session('api', { sessionId: '$9' }))).toEqual(['session:tmux:api'])
  })

  test('count a Herdr agent pane as its workspace', () => {
    const agent = session('opencode', {
      itemKind: 'herdr',
      backend: 'herdr',
      sessionId: 'w1',
      workspaceTitle: 'api',
      target: { kind: 'agent', tabId: 't1', paneId: 'p1' },
    })

    expect(OpenKey.ofItem(agent)).toEqual([OpenKey.session('herdr', 'api')])
  })

  test('name projects by their resolved path, plus the live session they link to', () => {
    expect(OpenKey.ofItem(project('/dev/api/'))).toEqual(['path:/dev/api'])
    expect(
      OpenKey.ofItem(
        project('/dev/api', { linkedSessionName: 'api', linkedSessionBackend: 'herdr' })
      )
    ).toEqual(['path:/dev/api', 'session:herdr:api'])
  })
})

describe('history file', () => {
  test('the default file lives under XDG_STATE_HOME', () => {
    expect(getOpenHistoryPath('/home/tester')).toBe(
      join(process.env.XDG_STATE_HOME ?? '', 'mux-sesh', 'frecency.jsonl')
    )
  })

  test('skips corrupt and invalid lines, and the last line for a key wins', () => {
    const history = FrecencyHistory.parse(
      [
        line('a', 1, NOW - DAY),
        '{not json',
        JSON.stringify({ key: 'b', frequency: 0, lastOpen: NOW }),
        JSON.stringify({ key: '', frequency: 1, lastOpen: NOW }),
        JSON.stringify({ key: 'c', frequency: 1.5, lastOpen: NOW }),
        JSON.stringify({ key: 'd', frequency: 1, lastOpen: 'yesterday' }),
        '[]',
        line('a', 5, NOW - 2 * DAY),
        '',
      ].join('\n')
    )

    expect([...history.entries.values()]).toEqual([
      { key: 'a', frequency: 5, lastOpen: NOW - 2 * DAY },
    ])
    expect(history.lines).toBe(8)
  })

  test('compaction keeps the newest entries up to the limit, newest first', () => {
    const lines = Array.from({ length: FRECENCY_ENTRY_LIMIT + 5 }, (_, index) =>
      line(`k${index}`, 1, NOW - (FRECENCY_ENTRY_LIMIT + 5 - index) * 1000)
    )

    const history = FrecencyHistory.parse(lines.join('\n'))
    expect(FrecencyHistory.needsCompaction(history)).toBe(true)

    const compacted = FrecencyHistory.compact(history)
    const keys = [...compacted.history.entries.keys()]

    expect(keys).toHaveLength(FRECENCY_ENTRY_LIMIT)
    expect(keys[0]).toBe(`k${FRECENCY_ENTRY_LIMIT + 4}`)
    expect(keys).not.toContain('k4')
    expect(keys).toContain('k5')
    expect(compacted.text.split('\n').filter(Boolean)).toHaveLength(FRECENCY_ENTRY_LIMIT)
  })
})

describe('open history store', () => {
  test('creates the file 0600 in a 0700 directory and appends one line per open', async () => {
    const { history, file, clock } = await harness()

    expect(await history.record(['session:tmux:api'])).toEqual({ kind: 'recorded' })
    clock.now += DAY
    expect(await history.record(['session:tmux:api', 'path:/dev/api'])).toEqual({
      kind: 'recorded',
    })

    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect((await stat(dirname(file))).mode & 0o777).toBe(0o700)
    expect((await Bun.file(file).text()).split('\n')).toEqual([
      line('session:tmux:api', 1, NOW),
      line('session:tmux:api', 2, NOW + DAY),
      line('path:/dev/api', 1, NOW + DAY),
      '',
    ])
  })

  test('continues counting from the file a previous run wrote', async () => {
    const first = await harness()
    await first.history.record(['session:tmux:api'])

    const second = await harness(first.file)
    await second.history.record(['session:tmux:api'])

    expect((await Bun.file(first.file).text()).trim().split('\n').at(-1)).toBe(
      line('session:tmux:api', 2, NOW)
    )
  })

  test('ranks nothing before it loads, then boosts by the latest entry', async () => {
    const root = await tempRoot()
    const file = join(root, 'frecency.jsonl')
    await writeFile(
      file,
      `${line('session:tmux:api', 1, NOW)}\n${line('session:tmux:api', 3, NOW)}\n`
    )
    const { history } = await harness(file)

    expect(history.boost(session('api'))).toBe(0)
    await history.load()
    expect(history.boost(session('api'))).toBeCloseTo(frecencyBoost(3))
    expect(history.boost(session('web'))).toBe(0)
  })

  test('a corrupt file loads as the valid lines it has and never throws', async () => {
    const root = await tempRoot()
    const file = join(root, 'frecency.jsonl')
    await writeFile(file, `\u0000garbage\n${line('session:tmux:api', 2, NOW)}\n{"key":`)
    const { history, reports } = await harness(file)

    await history.load()

    expect(history.boost(session('api'))).toBeCloseTo(frecencyBoost(2))
    expect(reports).toEqual([])
  })

  test('compacts an oversized file on load with an atomic rewrite', async () => {
    const root = await tempRoot()
    const file = join(root, 'frecency.jsonl')

    const lines = Array.from({ length: FRECENCY_ENTRY_LIMIT + 50 }, (_, index) =>
      line(`k${index}`, 1, NOW - (FRECENCY_ENTRY_LIMIT + 50 - index))
    )

    await writeFile(file, `${lines.join('\n')}\n`)
    const { history } = await harness(file)

    await history.load()

    const text = await Bun.file(file).text()
    expect(text.trim().split('\n')).toHaveLength(FRECENCY_ENTRY_LIMIT)
    expect(text.startsWith(line(`k${FRECENCY_ENTRY_LIMIT + 49}`, 1, NOW - 1))).toBe(true)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await readdir(root)).toEqual(['frecency.jsonl'])
  })

  test('off writes nothing, reads nothing and ranks nothing', async () => {
    const root = await tempRoot()
    const file = join(root, 'frecency.jsonl')
    await writeFile(file, `${line('session:tmux:api', 3, NOW)}\n`)
    const { history } = await harness(file)
    await history.load()

    history.configure(false)

    expect(history.boost(session('api'))).toBe(0)
    expect(await history.record(['session:tmux:web'])).toEqual({ kind: 'off' })
    expect(await Bun.file(file).text()).toBe(`${line('session:tmux:api', 3, NOW)}\n`)
  })

  test('a file it cannot write is reported and the open still returns', async () => {
    const root = await tempRoot()
    const dir = join(root, 'locked')
    await mkdir(dir)
    await chmod(dir, 0o500)
    const { history, reports } = await harness(join(dir, 'frecency.jsonl'))

    try {
      const outcome = await history.record(['session:tmux:api'])

      expect(outcome.kind).toBe('failed')
      expect(reports.join('\n')).toContain('this open was not recorded')
    } finally {
      await chmod(dir, 0o700)
    }
  })

  test('an unreadable file is never overwritten with reset counts', async () => {
    const root = await tempRoot()
    const file = join(root, 'frecency.jsonl')
    await writeFile(file, `${line('session:tmux:api', 7, NOW)}\n`)
    await chmod(file, 0o200)
    const { history, reports } = await harness(file)

    try {
      expect((await history.record(['session:tmux:api'])).kind).toBe('failed')
      expect(reports.join('\n')).toContain('search history is off until the next start')
    } finally {
      await chmod(file, 0o600)
    }

    expect(await Bun.file(file).text()).toBe(`${line('session:tmux:api', 7, NOW)}\n`)
  })

  test('a write slower than the timeout returns instead of holding up the open', async () => {
    const root = await tempRoot()
    // A FIFO with no reader never finishes opening for append.
    const fifo = join(root, 'frecency.jsonl')
    const made = Bun.spawnSync(['mkfifo', fifo])
    expect(made.exitCode).toBe(0)

    const { history, reports } = await harness(fifo, 50)
    const started = performance.now()

    const outcome = await history.record(['session:tmux:api'])

    expect(outcome).toEqual({ kind: 'failed', reason: 'recording took longer than 50ms' })
    expect(performance.now() - started).toBeLessThan(1000)
    expect(reports.join('\n')).toContain('the open went ahead without waiting')
  })
})
