import { afterEach, describe, expect, test } from 'bun:test'
import type { TestRendererSetup } from '@opentui/core/testing'
import { testRender } from '@opentui/react/test-utils'
import { act, useState, type Dispatch, type SetStateAction } from 'react'
import { useLauncherQuery, type LauncherQueryServices } from '../src/app/launcher-query'
import type { ShowToast, ToastInput } from '../src/app/notifications'
import { getDefaultConfig } from '../src/config'
import type { MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError } from '../src/multiplexer/types'
import { filterAndSortItems } from '../src/search'
import {
  createFileSearchScope,
  FileSearchUnavailableError,
  type FileSearchOutcome,
} from '../src/search/fff'
import { AppMode } from '../src/app/app-mode'
import type { Item } from '../src/items/item'
import { createFakeNative, type FakeNative } from './fixtures/fake-native-finder'
import { unsupportedBackend } from './fixtures/fake-backend'

const config = { ...getDefaultConfig('/fixture'), projectPaths: [] }
const NO_SESSIONS: Item[] = []

function unsupportedBackendCall(): never {
  throw new Error('The launcher-query probe never calls the backend')
}

const backend: MultiplexerBackend = unsupportedBackend({
  kind: 'tmux',
  capabilities: { previousWorkspace: false },
})

function project(title: string): Item {
  return { title, desc: '', path: `/fixture/${title}`, isSession: false, itemKind: 'project' }
}

function file(title: string): Item {
  return { title, desc: '', path: `/fixture/files/${title}`, isSession: false, itemKind: 'file' }
}

interface ScriptedServices {
  services: LauncherQueryServices
  searches: string[]
  warms: number
  disposals: number
  discarded: number[]
  defects: unknown[]
  search(query: string): PromiseWithResolvers<FileSearchOutcome>
  candidates: PromiseWithResolvers<Item[]>
}

function scriptServices(): ScriptedServices {
  const pending = new Map<string, PromiseWithResolvers<FileSearchOutcome>>()

  function search(query: string): PromiseWithResolvers<FileSearchOutcome> {
    const existing = pending.get(query)

    if (existing) return existing

    const created = Promise.withResolvers<FileSearchOutcome>()
    pending.set(query, created)

    return created
  }

  const scripted: ScriptedServices = {
    searches: [],
    warms: 0,
    disposals: 0,
    discarded: [],
    defects: [],
    search,
    candidates: Promise.withResolvers<Item[]>(),
    services: {
      debounceMs: 0,
      filterItems: filterAndSortItems,
      openFileSearch: () => ({
        async warm() {
          scripted.warms++
        },
        async search(query) {
          scripted.searches.push(query)

          return search(query).promise
        },
        dispose() {
          scripted.disposals++
        },
      }),
      onDiscardedSearch(nativeMs) {
        scripted.discarded.push(nativeMs)
      },
      async loadCandidates() {
        return scripted.candidates.promise
      },
      async linkSessions(items) {
        return items
      },
      onDefect(cause) {
        scripted.defects.push(cause)
      },
    },
  }

  return scripted
}

interface LauncherProbe {
  items: Item[]
  cursor: number
  message: string
  messages: string[]
  toasts: ToastInput[]
  writes: number
  setQuery: (query: string) => void
  setAppMode: (mode: AppMode) => void
  setCursor: Dispatch<SetStateAction<number>>
}

function createProbe(): LauncherProbe {
  return {
    items: [],
    cursor: 0,
    message: '',
    messages: [],
    toasts: [],
    writes: 0,
    setQuery: unsupportedBackendCall,
    setAppMode: unsupportedBackendCall,
    setCursor: unsupportedBackendCall,
  }
}

function LauncherScreen({
  initialItems,
  services,
  probe,
}: {
  initialItems: Item[]
  services: LauncherQueryServices
  probe: LauncherProbe
}) {
  const [appMode, setAppMode] = useState(AppMode.NewSession)
  const [searchQuery, setSearchQuery] = useState('')
  const [allItems, setAllItemsState] = useState(initialItems)
  const [items, setItemsState] = useState(initialItems)
  const [cursor, setCursorState] = useState(0)
  const [, setSessionCandidateItems] = useState<Item[]>([])
  const [message, setMessageState] = useState('')

  // Stable like React state setters, so effect dependencies see the production identities.
  const [setters] = useState(() => {
    function count<T>(write: Dispatch<SetStateAction<T>>): Dispatch<SetStateAction<T>> {
      return value => {
        probe.writes++
        write(value)
      }
    }

    const setMessage: Dispatch<SetStateAction<string>> = value => {
      if (!(value instanceof Function)) probe.messages.push(value)

      setMessageState(value)
    }

    const showToast: ShowToast = toast => {
      probe.toasts.push(toast)
    }

    return {
      setAllItems: count(setAllItemsState),
      setItems: count(setItemsState),
      setCursor: count(setCursorState),
      setSessionCandidateItems: count(setSessionCandidateItems),
      setMessage,
      showToast,
    }
  })

  useLauncherQuery(
    {
      appMode,
      config,
      backend,
      searchQuery,
      allItems,
      sessionItems: NO_SESSIONS,
      items,
      cursor,
      ...setters,
    },
    services
  )

  probe.items = items
  probe.cursor = cursor
  probe.message = message
  probe.setQuery = setSearchQuery
  probe.setAppMode = setAppMode
  probe.setCursor = setCursorState

  return (
    <box flexDirection="column">
      <text>{`selected: ${items[cursor]?.title ?? ''}`}</text>
      <text>{`rows: ${items.map(item => item.title).join(',')}`}</text>
      <text>{message}</text>
    </box>
  )
}

let setup: TestRendererSetup | undefined

afterEach(() => {
  const mounted = setup
  setup = undefined

  if (mounted && !mounted.renderer.isDestroyed) act(() => mounted.renderer.destroy())
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Bun.sleep(1)
  })
}

async function mountLauncher(initialItems: Item[], scripted: ScriptedServices) {
  const probe = createProbe()

  await act(async () => {
    setup = await testRender(
      <LauncherScreen initialItems={initialItems} services={scripted.services} probe={probe} />,
      { width: 80, height: 6, consoleMode: 'disabled' }
    )
  })
  await settle()

  return {
    probe,
    async query(text: string): Promise<void> {
      await act(async () => probe.setQuery(text))
      await settle()
    },
    async resolveSearch(query: string, rows: Item[], nativeMs = 0): Promise<void> {
      await act(async () =>
        scripted.search(query).resolve({ kind: 'found', items: rows, nativeMs })
      )
      await settle()
    },
    async resolveOutcome(query: string, outcome: FileSearchOutcome): Promise<void> {
      await act(async () => scripted.search(query).resolve(outcome))
      await settle()
    },
    async rejectSearch(query: string, cause: unknown): Promise<void> {
      await act(async () => scripted.search(query).reject(cause))
      await settle()
    },
    async resolveCandidates(rows: Item[]): Promise<void> {
      await act(async () => scripted.candidates.resolve(rows))
      await settle()
    },
  }
}

function titles(items: Item[]): string[] {
  return items.map(item => item.title)
}

function selected(probe: LauncherProbe): string | undefined {
  return probe.items[probe.cursor]?.title
}

const PROJECTS = [project('alpha'), project('alder'), project('beta')]

describe('launcher query owner', () => {
  test('a slower native result for an older query never replaces newer rows', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    await launcher.query('alp')
    expect(scripted.searches).toEqual(['al', 'alp'])

    await launcher.resolveSearch('alp', [file('alpine.md')])
    await launcher.resolveSearch('al', [file('alder-notes.md')])

    expect(titles(launcher.probe.items)).toContain('alpine.md')
    expect(titles(launcher.probe.items)).not.toContain('alder-notes.md')
    expect(titles(launcher.probe.items)).not.toContain('beta')
  })

  test('local rows publish immediately and a new query selects its first row', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await act(async () => launcher.probe.setCursor(2))
    await launcher.query('be')

    expect(titles(launcher.probe.items)).toEqual(['beta'])
    expect(launcher.probe.cursor).toBe(0)
  })

  test('native rows keep the selected key when they merge in', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    const alder = titles(launcher.probe.items).indexOf('alder')
    expect(alder).toBeGreaterThanOrEqual(0)
    await act(async () => launcher.probe.setCursor(alder))

    await launcher.resolveSearch('al', [file('alps.md')])

    expect(titles(launcher.probe.items)).toContain('alps.md')
    expect(selected(launcher.probe)).toBe('alder')
  })

  test('a late candidate load keeps the selected key and the current native rows', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    await launcher.resolveSearch('al', [file('alps.md')])
    const alder = titles(launcher.probe.items).indexOf('alder')
    await act(async () => launcher.probe.setCursor(alder))
    expect(selected(launcher.probe)).toBe('alder')

    await launcher.resolveCandidates([
      project('alpha'),
      project('alder'),
      project('beta'),
      project('almond'),
    ])

    expect(titles(launcher.probe.items)).toContain('almond')
    expect(titles(launcher.probe.items)).toContain('alps.md')
    expect(titles(launcher.probe.items)).not.toContain('beta')
    expect(selected(launcher.probe)).toBe('alder')
  })

  test('a late candidate load selects the first row when the selected key is gone', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    const alder = titles(launcher.probe.items).indexOf('alder')
    await act(async () => launcher.probe.setCursor(alder))

    await launcher.resolveCandidates([project('alpha'), project('beta')])

    expect(titles(launcher.probe.items)).toEqual(['alpha'])
    expect(launcher.probe.cursor).toBe(0)
  })

  test('a native search failure keeps local rows, reports once, and clears on recovery', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    await launcher.rejectSearch('al', new Error('native index offline'))

    expect(titles(launcher.probe.items).sort()).toEqual(['alder', 'alpha'])
    expect(launcher.probe.message).toContain('native index offline')
    expect(launcher.probe.message).toContain('project matches')

    await launcher.query('alp')
    await launcher.rejectSearch('alp', new Error('native index offline'))

    expect(titles(launcher.probe.items)).toEqual(['alpha'])
    expect(
      launcher.probe.messages.filter(text => text.includes('native index offline'))
    ).toHaveLength(1)

    await launcher.query('alph')
    await launcher.resolveSearch('alph', [])

    expect(launcher.probe.message).toBe('')
    expect(scripted.defects).toEqual([])
  })

  test('unavailable native search keeps local rows and says so without promising a retry', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    await launcher.rejectSearch(
      'al',
      new FileSearchUnavailableError('the native library could not be loaded')
    )

    expect(titles(launcher.probe.items).sort()).toEqual(['alder', 'alpha'])
    expect(launcher.probe.message).toBe(
      'File search is unavailable: the native library could not be loaded. Showing project matches only.'
    )
    expect(scripted.defects).toEqual([])
  })

  test('a stale native failure is not reported for the current query', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    await launcher.query('alp')
    await launcher.rejectSearch('al', new Error('native index offline'))

    expect(launcher.probe.message).toBe('')
    expect(scripted.defects).toEqual([])
  })

  test.each([
    { label: 'a non-Error rejection', cause: 'not an error' },
    { label: 'a programming error', cause: new TypeError('finder.mixedSearch is not a function') },
  ])('$label from native search is a defect', async ({ cause }) => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    await launcher.rejectSearch('al', cause)

    expect(scripted.defects).toEqual([cause])
    expect(launcher.probe.message).toBe('')
    expect(titles(launcher.probe.items).sort()).toEqual(['alder', 'alpha'])
  })

  test('an expected candidate failure keeps the cached rows and reports it', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await act(async () =>
      scripted.candidates.reject(new MultiplexerError('server-stopped', 'fixture server stopped'))
    )
    await settle()

    expect(titles(launcher.probe.items)).toEqual(titles(PROJECTS))
    expect(launcher.probe.message).toBe('')
    expect(launcher.probe.toasts).toEqual([
      {
        kind: 'warning',
        message: 'fixture server stopped Showing cached projects; reopen New session to retry.',
      },
    ])
    expect(scripted.defects).toEqual([])
  })

  test('leaving New session discards in-flight native and candidate results', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    await act(async () => launcher.probe.setAppMode(AppMode.Normal))
    await settle()
    const rows = launcher.probe.items
    const writes = launcher.probe.writes

    await launcher.resolveSearch('al', [file('alps.md')])
    await launcher.resolveCandidates([project('almond')])

    expect(launcher.probe.items).toBe(rows)
    expect(launcher.probe.writes).toBe(writes)
  })

  test('unmounting discards in-flight results without state updates', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    const writes = launcher.probe.writes
    const mounted = setup

    if (mounted) act(() => mounted.renderer.destroy())

    await launcher.resolveSearch('al', [file('alps.md')])
    await launcher.resolveCandidates([project('almond')])

    expect(launcher.probe.writes).toBe(writes)
    expect(scripted.defects).toEqual([])
  })

  test('empty and GitHub URL queries warm native search instead of querying it', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)
    expect(scripted.warms).toBe(1)

    await launcher.query('https://github.com/example/repo')

    expect(scripted.searches).toEqual([])
    expect(scripted.warms).toBe(2)
  })
})

function nativeServices(fake: FakeNative, defects: unknown[]): LauncherQueryServices {
  return {
    ...scriptServices().services,
    openFileSearch: () =>
      createFileSearchScope({
        load: async () => fake.native,
        roots: async () => ['/fixture'],
        limit: 60,
        scanWaitMs: 1500,
      }),
    onDefect(cause) {
      defects.push(cause)
    },
  }
}

async function mountNative(fake: FakeNative, defects: unknown[]) {
  const probe = createProbe()

  await act(async () => {
    setup = await testRender(
      <LauncherScreen
        initialItems={PROJECTS}
        services={nativeServices(fake, defects)}
        probe={probe}
      />,
      { width: 80, height: 6, consoleMode: 'disabled' }
    )
  })
  await settle()

  return probe
}

function unmount(): void {
  const mounted = setup

  if (mounted) act(() => mounted.renderer.destroy())
}

describe('launcher query native search lifecycle', () => {
  test('a stale native search is discarded and its synchronous cost is reported', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    await launcher.query('alp')
    await launcher.resolveSearch('alp', [file('alpine.md')], 3)
    await launcher.resolveSearch('al', [file('alder-notes.md')], 7)

    expect(scripted.discarded).toEqual([7])
    expect(titles(launcher.probe.items)).not.toContain('alder-notes.md')
  })

  test('a failed native outcome keeps local rows and reports it for the current query', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    await launcher.resolveOutcome('al', {
      kind: 'failed',
      failure: new Error('the native finder for /fixture could not start'),
    })

    expect(titles(launcher.probe.items).sort()).toEqual(['alder', 'alpha'])
    expect(launcher.probe.message).toContain('could not start')
    expect(scripted.defects).toEqual([])
  })

  test('disabled native search adds no rows and no message', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    await launcher.resolveOutcome('al', { kind: 'disabled' })

    expect(titles(launcher.probe.items).sort()).toEqual(['alder', 'alpha'])
    expect(launcher.probe.message).toBe('')
    expect(scripted.defects).toEqual([])
  })

  test('unmounting disposes the owned file search scope exactly once', async () => {
    const scripted = scriptServices()
    const launcher = await mountLauncher(PROJECTS, scripted)

    await launcher.query('al')
    unmount()
    await settle()

    expect(scripted.disposals).toBe(1)
  })

  test('opening New session on projects does not open a native finder for any root', async () => {
    const fake = createFakeNative()
    const defects: unknown[] = []
    await mountNative(fake, defects)

    expect(fake.attempts).toEqual([])
    expect(defects).toEqual([])
  })

  test('an explicit query opens the root finder and merges its rows', async () => {
    const fake = createFakeNative()
    const defects: unknown[] = []
    const probe = await mountNative(fake, defects)

    await act(async () => probe.setQuery('al'))
    await settle()

    expect(fake.attempts).toEqual(['/fixture'])
    expect(titles(probe.items)).toContain('al-fixture.md')
    expect(defects).toEqual([])
  })

  test('exit during the scan wait destroys the finder once and never publishes', async () => {
    const fake = createFakeNative({ holdScans: true })
    const defects: unknown[] = []
    const probe = await mountNative(fake, defects)

    await act(async () => probe.setQuery('al'))
    await settle()
    expect(fake.created).toHaveLength(1)
    const writes = probe.writes

    unmount()
    await act(async () => fake.releaseScans())
    await settle()

    expect(fake.created.map(finder => finder.destroyed)).toEqual([1])
    expect(
      fake.created.map(finder => finder.searches.length + finder.searchesAfterDestroy)
    ).toEqual([0])
    expect(probe.writes).toBe(writes)
    expect(defects).toEqual([])
  })

  test('a remounted owner opens its own finder and the old one is destroyed once', async () => {
    const fake = createFakeNative()
    const defects: unknown[] = []
    const first = await mountNative(fake, defects)

    await act(async () => first.setQuery('al'))
    await settle()
    unmount()

    const second = await mountNative(fake, defects)
    await act(async () => second.setQuery('al'))
    await settle()

    expect(fake.created.map(finder => finder.destroyed)).toEqual([1, 0])
    expect(titles(second.items)).toContain('al-fixture.md')
    expect(defects).toEqual([])
  })
})
