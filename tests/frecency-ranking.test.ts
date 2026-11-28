import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createItemFilter, filterAndSortItems } from '../src/search'
import { OpenKey } from '../src/search/frecency'
import { createOpenHistory, type OpenHistory } from '../src/search/frecency-store'
import type { LiveWorkspace } from '../src/multiplexer'
import type { Item } from '../src/items/item'
import { renderSessionScreen } from './fixtures/session-screen'
import { listRow, selectedRowText } from './fixtures/selection'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 26)

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

interface Clock {
  now: number
}

async function openHistory(clock: Clock = { now: NOW }): Promise<OpenHistory> {
  const root = await mkdtemp(join(tmpdir(), 'mux-sesh-frecency-ranking-'))
  roots.push(root)

  const history = createOpenHistory({
    path: () => join(root, 'frecency.jsonl'),
    now: () => clock.now,
    timeoutMs: 1000,
    report: message => {
      throw new Error(`unexpected history report: ${message}`)
    },
  })

  history.configure(true)

  return history
}

function session(title: string): Item {
  return {
    title,
    desc: 'dev',
    path: `/fixture/${title}`,
    isSession: true,
    itemKind: 'tmux',
    backend: 'tmux',
    sessionId: `$${title}`,
  }
}

async function open(history: OpenHistory, title: string, times = 1): Promise<void> {
  for (let count = 0; count < times; count++) {
    expect(await history.record([OpenKey.session('tmux', title)])).toEqual({ kind: 'recorded' })
  }
}

function ranked(history: OpenHistory, items: Item[], query: string): string[] {
  const filter = createItemFilter({ boost: item => history.boost(item) })

  return filter(items, query).map(item => item.title)
}

describe('search ranking by open history', () => {
  test('with equal match quality, the opened item ranks first', async () => {
    const history = await openHistory()
    const items = [session('api-one'), session('api-two')]

    expect(ranked(history, items, 'api')).toEqual(['api-one', 'api-two'])

    await open(history, 'api-two')

    expect(ranked(history, items, 'api')).toEqual(['api-two', 'api-one'])
  })

  test('the more often opened item ranks first', async () => {
    const history = await openHistory()
    const items = [session('api-one'), session('api-two')]

    await open(history, 'api-one', 2)
    await open(history, 'api-two', 5)

    expect(ranked(history, items, 'api')).toEqual(['api-two', 'api-one'])
  })

  test('the more recently opened item ranks first at the same count', async () => {
    const clock = { now: NOW - 10 * DAY }
    const history = await openHistory(clock)
    const items = [session('api-one'), session('api-two')]

    await open(history, 'api-two', 3)
    clock.now = NOW
    await open(history, 'api-one', 3)

    expect(ranked(history, items, 'api')).toEqual(['api-one', 'api-two'])
  })

  test('a much better match still beats a heavily opened weaker one', async () => {
    const history = await openHistory()

    await open(history, 'api-gateway', 200)
    await open(history, 'my-utils-mux', 200)

    expect(ranked(history, [session('api-gateway'), session('api')], 'api')[0]).toBe('api')
    expect(ranked(history, [session('my-utils-mux'), session('mux-sesh')], 'mux')[0]).toBe(
      'mux-sesh'
    )
  })

  test('the empty query keeps the source order, however often rows were opened', async () => {
    const history = await openHistory()
    const items = [session('alpha'), session('beta'), session('gamma')]

    await open(history, 'gamma', 20)

    expect(ranked(history, items, '')).toEqual(['alpha', 'beta', 'gamma'])
    expect(ranked(history, items, '   ')).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('history switched off ranks by match alone', async () => {
    const history = await openHistory()
    const items = [session('api-one'), session('api-two')]

    await open(history, 'api-two', 5)
    history.configure(false)

    expect(ranked(history, items, 'api')).toEqual(['api-one', 'api-two'])
  })

  test('the stateless ranker takes the same boost', async () => {
    const history = await openHistory()
    const items = [session('api-one'), session('api-two')]

    await open(history, 'api-two')

    expect(
      filterAndSortItems(items, 'api', { boost: item => history.boost(item) }).map(
        item => item.title
      )
    ).toEqual(['api-two', 'api-one'])
  })
})

describe('search ranking on the picker screen', () => {
  const workspaces: LiveWorkspace[] = ['api-one', 'api-two', 'web'].map((title, index) => ({
    backend: 'herdr',
    id: `w${index}`,
    title,
    path: `/fixture/${title}`,
    isActive: index === 0,
    unitCount: 1,
  }))

  async function searchApi(searchHistory: boolean): Promise<string> {
    const history = await openHistory()
    expect(await history.record([OpenKey.session('herdr', 'api-two')])).toEqual({
      kind: 'recorded',
    })

    // A fresh history over the same file, as a new picker run would load it.
    const restarted = createOpenHistory({
      path: () => join(roots.at(-1) ?? '', 'frecency.jsonl'),
      now: () => NOW,
      timeoutMs: 1000,
      report: message => {
        throw new Error(`unexpected history report: ${message}`)
      },
    })

    const screen = await renderSessionScreen(
      { width: 80, height: 20 },
      { keybindMode: 'standard', workspaces, openHistory: restarted, config: { searchHistory } }
    )

    try {
      await screen.settle()
      // Joins the read the screen started after mounting; it does nothing while history is off.
      await restarted.load()
      expect(await selectedRowText(screen)).toMatch(listRow('.*api-one'))
      await screen.typeText('api')

      return await selectedRowText(screen)
    } finally {
      screen.destroy()
    }
  }

  test('a session opened in an earlier run ranks first among equal matches', async () => {
    expect(await searchApi(true)).toMatch(listRow('.*api-two'))
  })

  test('search_history off keeps the match order', async () => {
    expect(await searchApi(false)).toMatch(listRow('.*api-one'))
  })
})
