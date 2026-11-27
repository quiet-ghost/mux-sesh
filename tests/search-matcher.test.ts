import { describe, expect, test } from 'bun:test'
import fuzzysort from 'fuzzysort'
import { createItemFilter, filterAndSortItems } from '../src/search'
import type { Item } from '../src/types'

const WORDS = [
  'api',
  'gateway',
  'mux',
  'sesh',
  'dev',
  'tools',
  'notes',
  'web',
  'app',
  'core',
  'data',
]

function corpus(size: number): Item[] {
  return Array.from({ length: size }, (_, index) => {
    const first = WORDS[index % WORDS.length] ?? 'x'
    const second = WORDS[(index * 7 + 3) % WORDS.length] ?? 'y'
    const title = `${first}-${second}-${index}`
    const parent = index % 3 === 0 ? '/home/tester/dev/work' : '/home/tester/src'

    return {
      title,
      desc: index % 3 === 0 ? '~/dev/work' : '~/src',
      path: index % 5 === 0 ? `${parent}/${second}-${first}` : `${parent}/${title}`,
      isSession: index % 2 === 0,
      isPinned: index % 11 === 0,
    }
  })
}

function typed(query: string): string[] {
  return Array.from({ length: query.length }, (_, index) => query.slice(0, index + 1))
}

function snapshot(items: Item[]): unknown[] {
  return items.map(item => ({ title: item.title, path: item.path, searchMatch: item.searchMatch }))
}

describe('incremental item filtering', () => {
  test('refining a query returns exactly what a fresh search returns', () => {
    const items = corpus(240)
    const filter = createItemFilter()

    const queries = [
      ...typed('api gate'),
      ...typed('mux-sesh').reverse(),
      ...typed('dev work'),
      ...typed('zzz'),
      ...typed('d t 1'),
      ...typed('sesh  app'),
      ...typed('WEB'),
    ]

    for (const query of queries) {
      expect({ query, items: snapshot(filter(items, query)) }).toEqual({
        query,
        items: snapshot(filterAndSortItems(items, query)),
      })
    }
  })

  test('starts over when the source list changes', () => {
    const filter = createItemFilter()
    const first = corpus(60)

    const second = [
      ...corpus(60),
      { title: 'apiary', desc: '~', path: '/apiary', isSession: false },
    ]

    filter(first, 'ap')

    expect(snapshot(filter(second, 'api'))).toEqual(snapshot(filterAndSortItems(second, 'api')))
    expect(filter(second, 'api').some(item => item.title === 'apiary')).toBe(true)
  })

  test('returns the source rows without match metadata for a blank query', () => {
    const items = corpus(10)
    const filter = createItemFilter()

    filter(items, 'api')

    expect(filter(items, '  ').map(item => item.searchMatch)).toEqual(items.map(() => undefined))
  })
})

describe('prepared search targets', () => {
  test('prepares each searchable string once across queries and refreshes changed text', () => {
    let prepared = 0

    const filter = createItemFilter({
      prepare: text => {
        prepared++

        return fuzzysort.prepare(text)
      },
    })

    const items = corpus(50)

    // Title, path basename when it differs from the title, and context.
    const strings = items.reduce(
      (total, item) => total + 2 + (item.path.endsWith(`/${item.title}`) ? 0 : 1),
      0
    )

    for (const query of ['a', 'ap', 'api', 'x', 'api g', 'dev', 'not']) filter(items, query)

    expect(prepared).toBe(strings)

    // Its path basename already differs from its title, so only the title is prepared again.
    const renamed = items[0]

    if (!renamed) throw new Error('fixture corpus is empty')

    renamed.title = 'zebra-renamed'

    expect(filter(items, 'zebra').map(item => item.title)).toEqual(['zebra-renamed'])
    expect(prepared).toBe(strings + 1)
  })

  test('accepts a ranking boost hook as a multiplicative lift', () => {
    const items = corpus(30)
    const boosted = items.find(item => item.title.startsWith('web-'))

    if (!boosted) throw new Error('fixture corpus has no web- item')

    const filter = createItemFilter({ boost: item => (item === boosted ? 1 : 0) })

    expect(filter(items, 'e')[0]?.title).toBe(boosted.title)
  })
})
