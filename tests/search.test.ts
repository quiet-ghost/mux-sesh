import { describe, expect, test } from 'bun:test'
import { clearMatchIndices, filterAndSortItems } from '../src/search'
import type { Item } from '../src/types'

function createItem(overrides: Partial<Item> = {}): Item {
  return {
    title: 'mux-sesh',
    desc: '~/dev/projects/mux-sesh',
    path: '/tmp/mux-sesh',
    isSession: false,
    ...overrides,
  }
}

describe('search', () => {
  test('returns typed search metadata without mutating the source items', () => {
    const sourceItems = [
      createItem(),
      createItem({ title: 'sesh', desc: '~/dev/projects/sesh', path: '/tmp/sesh' }),
    ]

    const results = filterAndSortItems(sourceItems, 'mux')

    expect(results).toHaveLength(1)
    expect(results[0]?.searchMatch?.titleIndices).toEqual([0, 1, 2])
    expect(sourceItems[0]?.searchMatch).toBeUndefined()
    expect(sourceItems[1]?.searchMatch).toBeUndefined()
  })

  test('can clear search metadata without changing non-search fields', () => {
    const items = [
      createItem({
        searchMatch: {
          titleIndices: [0, 1],
          descIndices: [6, 7],
        },
      }),
    ]

    const cleared = clearMatchIndices(items)

    expect(cleared[0]).toEqual(createItem())
    expect(cleared[0]).not.toBe(items[0])
  })

  test('prefers an exact project root match over a weaker path match', () => {
    const results = filterAndSortItems(
      [
        createItem({ title: 'highlight-helper', path: '/tmp/highlight-helper', desc: '~/dev/highlight-helper' }),
        createItem({
          title: 'notes',
          path: '/tmp/misc/notes',
          desc: '~/dev/misc/highlight-helper-notes',
        }),
      ],
      'highlight-helper'
    )

    expect(results[0]?.title).toBe('highlight-helper')
  })
})
