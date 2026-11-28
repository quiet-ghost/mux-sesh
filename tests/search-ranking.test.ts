import { describe, expect, test } from 'bun:test'
import type { CommandEntry } from '../src/app/action-catalog'
import { filterAndSortItems } from '../src/search'
import {
  filterSettingsEntries,
  filterSettingsOptions,
  type SettingsEntry,
} from '../src/settings/settings-catalog'
import type { Item } from '../src/types'
import { filterCommandEntries } from '../src/ui/CommandsModal'

function session(title: string, overrides: Partial<Item> = {}): Item {
  return {
    title,
    desc: 'dev',
    path: `/home/tester/dev/${title}`,
    isSession: true,
    backend: 'tmux',
    ...overrides,
  }
}

function project(title: string, parent = '/home/tester/dev/projects'): Item {
  return {
    title,
    desc: parent.replace('/home/tester', '~'),
    path: `${parent}/${title}`,
    isSession: false,
    itemKind: 'project',
  }
}

function titles(items: Item[]): string[] {
  return items.map(item => item.title)
}

describe('item ranking', () => {
  const devSessions = [
    session('notes'),
    session('api-gateway'),
    session('devtools'),
    session('mux-sesh'),
    session('deploy-service-v2'),
  ]

  test('ranks title matches above rows that only match by their path context', () => {
    const results = titles(filterAndSortItems(devSessions, 'dev'))

    expect(results[0]).toBe('devtools')
    expect(results.indexOf('deploy-service-v2')).toBeLessThan(results.indexOf('notes'))
    expect(results.indexOf('deploy-service-v2')).toBeLessThan(results.indexOf('mux-sesh'))
  })

  test('keeps exact path segment matches for 3+ character queries, below every title match', () => {
    const projects = [project('notes'), project('devtools'), project('mux-sesh')]

    expect(titles(filterAndSortItems(projects, 'dev'))).toEqual(['devtools', 'notes', 'mux-sesh'])
  })

  test('drops path-only matches for short queries and for scattered path matches', () => {
    const projects = [project('notes'), project('devtools'), project('mux-sesh')]

    expect(titles(filterAndSortItems(projects, 'de'))).toEqual(['devtools'])
    // `dpr` is a subsequence of `~/dev/projects` but not a substring of it.
    expect(titles(filterAndSortItems(projects, 'dpr'))).toEqual([])
  })

  test('highlights the best alignment instead of the first occurrence', () => {
    const [result] = filterAndSortItems([session('my-utils-mux')], 'mux')

    expect(result?.searchMatch?.titleIndices).toEqual([9, 10, 11])
  })

  test('matches word starts across separators', () => {
    const results = filterAndSortItems([session('notes'), session('mux-sesh')], 'mx')

    expect(titles(results)).toEqual(['mux-sesh'])
    expect(results[0]?.searchMatch?.titleIndices).toEqual([0, 2])
  })

  test('still matches long titles', () => {
    const long = session('a-very-long-session-name-for-the-billing-service-worker')

    expect(titles(filterAndSortItems([long], 'worker'))).toEqual([long.title])
  })

  test('a pinned row is lifted but does not beat a far better match', () => {
    const results = filterAndSortItems(
      [session('my-mixer', { isPinned: true }), session('mx')],
      'mx'
    )

    expect(titles(results)).toEqual(['mx', 'my-mixer'])
  })

  test('a pinned row wins a tie with an otherwise equal match', () => {
    const results = filterAndSortItems(
      [session('api-one'), session('api-two', { isPinned: true })],
      'api'
    )

    expect(titles(results)).toEqual(['api-two', 'api-one'])
  })

  test('keeps the source order for equal matches', () => {
    const results = filterAndSortItems([session('zeta-app'), session('beta-app')], 'app')

    expect(titles(results)).toEqual(['zeta-app', 'beta-app'])
  })

  test('requires every space-separated term to match', () => {
    const items = [session('api'), session('gateway'), session('api-gateway')]

    expect(titles(filterAndSortItems(items, 'api gate'))).toEqual(['api-gateway'])
    expect(titles(filterAndSortItems(items, 'api zzz'))).toEqual([])
  })

  test('ranks a row matching every term in its title above a split title/context match', () => {
    const items = [session('api', { desc: 'gateway' }), session('api-gateway')]

    const results = filterAndSortItems(items, 'api gate')

    expect(titles(results)).toEqual(['api-gateway', 'api'])
    expect(results[0]?.searchMatch?.titleIndices).toEqual([0, 1, 2, 4, 5, 6, 7])
    expect(results[1]?.searchMatch).toEqual({ titleIndices: [0, 1, 2], descIndices: [0, 1, 2, 3] })
  })

  test('matches a session by its path basename when the session name differs', () => {
    const renamed = session('api', { path: '/home/tester/dev/billing-gateway' })

    expect(titles(filterAndSortItems([session('notes'), renamed], 'billing'))).toEqual(['api'])
  })

  test('prefers an exact title over a prefix match and a prefix over a mid-word match', () => {
    const results = filterAndSortItems(
      [session('my-api'), session('api-gateway'), session('api')],
      'api'
    )

    expect(titles(results)).toEqual(['api', 'api-gateway', 'my-api'])
  })
})

function command(category: string, title: string, keywords?: string): CommandEntry {
  const entry: CommandEntry = {
    id: 'new-session',
    category,
    title,
    keybind: '',
    scope: 'global',
    availability: { kind: 'available' },
  }

  if (keywords) entry.keywords = keywords

  return entry
}

describe('command palette ranking', () => {
  const entries = [
    command('Navigate', 'Search'),
    command('Session', 'New session'),
    command('Session', 'Rename'),
    command('Session', 'Close session', 'kill'),
    command('View', 'Themes', 'theme color scheme appearance'),
  ]

  test('fuzzy-matches command titles', () => {
    expect(filterCommandEntries(entries, 'nwsess').map(entry => entry.title)).toEqual([
      'New session',
    ])
  })

  test('ranks title matches first and keeps each category together', () => {
    // `Rename` only matches through its `Session` category, so it ranks after both titles.
    expect(filterCommandEntries(entries, 'ses').map(entry => entry.title)).toEqual([
      'New session',
      'Close session',
      'Rename',
    ])

    expect(filterCommandEntries(entries, 'session').map(entry => entry.title)).toEqual([
      'New session',
      'Close session',
      'Rename',
    ])
  })

  test('matches keywords', () => {
    expect(filterCommandEntries(entries, 'kil').map(entry => entry.title)).toEqual([
      'Close session',
    ])
  })
})

function setting(title: string, value: string, description: string): SettingsEntry {
  return {
    id: 'theme',
    title,
    category: 'Appearance',
    description,
    keywords: '',
    value,
    control: 'open',
    reset: 'default',
  }
}

describe('settings ranking', () => {
  test('fuzzy-matches settings by label and ranks label matches first', () => {
    const entries = [
      setting('Theme', 'catppuccin', 'Built-in, custom, or system'),
      setting('Keybind mode', 'vim', 'Navigation style'),
      setting('Color scheme', 'system', 'System, dark, or light'),
    ]

    expect(filterSettingsEntries(entries, 'kbmode').map(entry => entry.title)).toEqual([
      'Keybind mode',
    ])

    expect(filterSettingsEntries(entries, 'sys').map(entry => entry.title)).toEqual([
      'Color scheme',
      'Theme',
    ])
  })

  test('fuzzy-matches setting options', () => {
    const options = [
      { value: 'system', label: 'System', description: 'Follow the desktop or terminal theme' },
      { value: 'tokyonight', label: 'Tokyo Night', description: 'tokyonight' },
      { value: 'catppuccin', label: 'Catppuccin', description: 'catppuccin' },
      {
        value: 'catppuccin-macchiato',
        label: 'Catppuccin Macchiato',
        description: 'catppuccin-macchiato',
      },
    ]

    expect(filterSettingsOptions(options, 'cat').map(option => option.label)).toEqual([
      'Catppuccin',
      'Catppuccin Macchiato',
    ])

    expect(filterSettingsOptions(options, 'ctpmac').map(option => option.label)).toEqual([
      'Catppuccin Macchiato',
    ])

    expect(filterSettingsOptions(options, 'tn')[0]?.label).toBe('Tokyo Night')
  })
})
