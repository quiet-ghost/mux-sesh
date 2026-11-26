import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { MultiplexerBackend } from '../multiplexer'
import { isBackendFailure } from '../multiplexer/failure'
import { getItemKey } from '../multiplexer/items'
import { annotateProjectItemsWithSessionLinks } from '../projects/session-links'
import { filterAndSortItems } from '../search'
import {
  combineFileSearchResults,
  FileSearchUnavailableError,
  isFileSearchFailure,
  searchFilesAndDirectories,
  warmFileSearch,
} from '../search/fff'
import { AppMode, type Config, type Item } from '../types'
import { isGitHubURL } from '../util/github'
import { measure } from '../util/perf'
import { requestFatalShutdown } from '../util/shutdown'
import { loadSessionCandidateItems } from './data'

const FILE_SEARCH_DEBOUNCE_MS = 120

export interface LauncherQueryServices {
  readonly debounceMs: number
  readonly filterItems: (items: Item[], query: string) => Item[]
  readonly searchFiles: (query: string, config: Config) => Promise<Item[]>
  readonly warmFiles: (config: Config) => Promise<void>
  readonly loadCandidates: (config: Config, backend: MultiplexerBackend) => Promise<Item[]>
  readonly linkSessions: (items: Item[], liveSessions: Item[], config: Config) => Promise<Item[]>
  readonly onDefect: (cause: unknown) => void
}

export const LAUNCHER_QUERY_SERVICES: LauncherQueryServices = {
  debounceMs: FILE_SEARCH_DEBOUNCE_MS,
  filterItems: filterAndSortItems,
  searchFiles: searchFilesAndDirectories,
  warmFiles: warmFileSearch,
  loadCandidates: (config, backend) => loadSessionCandidateItems(config, measure, backend),
  linkSessions: annotateProjectItemsWithSessionLinks,
  onDefect: requestFatalShutdown,
}

export interface LauncherQueryState {
  readonly appMode: AppMode
  readonly config: Config | null
  readonly backend: MultiplexerBackend | null
  readonly searchQuery: string
  readonly allItems: Item[]
  readonly sessionItems: Item[]
  readonly items: Item[]
  readonly cursor: number
  readonly setAllItems: Dispatch<SetStateAction<Item[]>>
  readonly setItems: Dispatch<SetStateAction<Item[]>>
  readonly setCursor: Dispatch<SetStateAction<number>>
  readonly setSessionCandidateItems: Dispatch<SetStateAction<Item[]>>
  readonly setMessage: Dispatch<SetStateAction<string>>
}

// A new query selects its first row; rows arriving later for the same query keep the selection.
type LauncherSelection = 'first' | 'keep'

interface LocalResults {
  readonly source: Item[]
  readonly query: string
  readonly items: Item[]
}

interface NativeResults {
  readonly query: string
  readonly items: Item[]
}

export function formatFileSearchFailure(failure: Error): string {
  return failure instanceof FileSearchUnavailableError
    ? `File search is unavailable: ${failure.message}. Showing project matches only.`
    : `File search failed: ${failure.message}. Showing project matches only; the next query retries.`
}

function formatCandidateFailure(failure: Error): string {
  return `${failure.message} Showing cached projects; reopen New session to retry.`
}

// The only writer of New-session rows and cursor. Every native search is tagged with the
// generation of the query that started it and merges in only while that query is current.
function createLauncherQuery(
  latest: { readonly current: LauncherQueryState },
  services: LauncherQueryServices
) {
  let generation = 0
  let disposed = false
  let publishedQuery: string | undefined
  let local: LocalResults | undefined
  let native: NativeResults | undefined
  let published: Item[] | undefined
  let selectedKey: string | undefined
  let reportedFailure: string | undefined

  function localResults(source: Item[], query: string): Item[] {
    if (local?.source === source && local.query === query) return local.items

    const items = query.trim() ? services.filterItems(source, query) : source
    local = { source, query, items }

    return items
  }

  function publish(selection: LauncherSelection): void {
    const { searchQuery, allItems, setItems, setCursor } = latest.current
    const query = searchQuery.trim()
    const localItems = localResults(allItems, searchQuery)

    const nextItems =
      native?.query === query
        ? combineFileSearchResults(native.items, localItems, query)
        : localItems

    const kept =
      selection === 'keep' && selectedKey !== undefined
        ? nextItems.findIndex(item => getItemKey(item) === selectedKey)
        : -1

    const cursor = Math.max(kept, 0)
    const selected = nextItems[cursor]
    published = nextItems
    selectedKey = selected ? getItemKey(selected) : undefined
    setItems(nextItems)
    setCursor(cursor)
  }

  function report(failure: Error): void {
    if (reportedFailure !== undefined) return

    reportedFailure = formatFileSearchFailure(failure)
    latest.current.setMessage(reportedFailure)
  }

  function recover(): void {
    const recovered = reportedFailure
    reportedFailure = undefined

    if (recovered) latest.current.setMessage(current => (current === recovered ? '' : current))
  }

  function fail(cause: unknown, current: boolean): void {
    if (disposed) return

    if (!isFileSearchFailure(cause)) {
      services.onDefect(cause)

      return
    }

    if (current) report(cause)
  }

  return {
    // Follows keyboard movement over the rows this owner published.
    observe(items: Item[], cursor: number): void {
      if (items !== published) return

      const selected = items[cursor]
      selectedKey = selected ? getItemKey(selected) : undefined
    },

    refresh(): void {
      const { searchQuery } = latest.current
      const selection = publishedQuery === searchQuery ? 'keep' : 'first'
      publishedQuery = searchQuery
      publish(selection)
    },

    begin(): number {
      native = undefined

      return ++generation
    },

    cancel(started: number): void {
      if (started === generation) generation++
    },

    async search(query: string, config: Config, started: number): Promise<void> {
      try {
        const found = await services.searchFiles(query, config)

        const linked =
          found.length === 0
            ? found
            : await services.linkSessions(
                found,
                latest.current.sessionItems.filter(item => item.isSession),
                config
              )

        if (disposed || started !== generation) return

        recover()

        if (linked.length === 0) return

        native = { query, items: linked }
        publish('keep')
      } catch (cause) {
        fail(cause, started === generation)
      }
    },

    async warm(config: Config): Promise<void> {
      try {
        await services.warmFiles(config)
      } catch (cause) {
        // Warm-up is best effort; the next search reports an expected failure for its query.
        if (!disposed && !isFileSearchFailure(cause)) services.onDefect(cause)
      }
    },

    async loadCandidates(
      config: Config,
      backend: MultiplexerBackend,
      isCurrent: () => boolean
    ): Promise<void> {
      try {
        const candidates = await services.loadCandidates(config, backend)

        if (disposed || !isCurrent()) return

        latest.current.setSessionCandidateItems(candidates)
        latest.current.setAllItems(candidates)
      } catch (cause) {
        if (disposed || !isCurrent()) return

        if (!isBackendFailure(cause)) {
          services.onDefect(cause)

          return
        }

        latest.current.setMessage(formatCandidateFailure(cause))
      }
    },

    deactivate(): void {
      generation++
      publishedQuery = undefined
      local = undefined
      native = undefined
      published = undefined
      selectedKey = undefined
    },

    dispose(): void {
      disposed = true
      generation++
    },
  }
}

export function useLauncherQuery(
  state: LauncherQueryState,
  services: LauncherQueryServices = LAUNCHER_QUERY_SERVICES
): void {
  const latest = useRef(state)
  latest.current = state

  const [owner] = useState(() => createLauncherQuery(latest, services))
  const { appMode, config, backend, searchQuery, allItems } = state
  const active = appMode === AppMode.NewSession

  owner.observe(state.items, state.cursor)

  useEffect(() => {
    if (!active) {
      owner.deactivate()

      return
    }

    owner.refresh()
  }, [active, allItems, owner, searchQuery])

  useEffect(() => {
    if (!active || !config) return

    const query = searchQuery.trim()
    const started = owner.begin()

    if (!query || isGitHubURL(query)) {
      owner.warm(config).catch(services.onDefect)

      return () => owner.cancel(started)
    }

    const timeout = setTimeout(() => {
      owner.search(query, config, started).catch(services.onDefect)
    }, services.debounceMs)

    return () => {
      clearTimeout(timeout)
      owner.cancel(started)
    }
  }, [active, config, owner, searchQuery, services])

  useEffect(() => {
    if (!active || !config || !backend) return

    let current = true
    owner.loadCandidates(config, backend, () => current).catch(services.onDefect)

    return () => {
      current = false
    }
  }, [active, backend, config, owner, services])

  useEffect(() => () => owner.dispose(), [owner])
}
