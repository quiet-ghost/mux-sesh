import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { isAgentSessionItem } from '../agents/session-name'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey } from '../multiplexer/items'
import { ViewMode, type Config, type Item } from '../types'
import { createPendingFlag, type PendingSignal } from '../util/pending'
import { requestFatalShutdown } from '../util/shutdown'
import {
  getAgentSelectionIndex,
  getProjectSelectionIndex,
  getSessionSelectionIndex,
  loadProjectItemsWithLinks,
  loadSessionItems,
  reuseSessionItemIdentities,
  type Measure,
} from './data'
import {
  readEffect,
  type AppEffectRuntime,
  type OperationOutcome,
  type ReadFailure,
} from './effect-runtime'

// Startup may fall back to Projects when no sessions exist; Agents polls never change the view.
export type InventoryRequest =
  | { readonly kind: 'startup' }
  | { readonly kind: 'refresh'; readonly viewMode: ViewMode }
  | { readonly kind: 'agents-poll' }

export interface InventoryContext {
  readonly config: Config
  readonly backend: MultiplexerBackend
}

export interface InventoryScope {
  readonly viewMode: ViewMode
  readonly config: Config | null
  readonly backend: MultiplexerBackend | null
}

// `liveSessions` is every live session, hidden ones included; Settings counts what each hides.
export type InventorySnapshot =
  | {
      readonly viewMode: ViewMode.Sessions
      readonly liveSessions: Item[]
      readonly sessionItems: Item[]
    }
  | {
      readonly viewMode: ViewMode.Projects
      readonly liveSessions: Item[]
      readonly sessionItems: Item[]
      readonly projectSourceItems: Item[]
      readonly projectItems: Item[]
    }

export type InventoryStatus =
  { readonly kind: 'fresh' } | { readonly kind: 'stale'; readonly failure: ReadFailure }

export type InventoryOutcome =
  | {
      readonly kind: 'published'
      readonly generation: number
      readonly snapshot: InventorySnapshot
    }
  | { readonly kind: 'failed'; readonly failure: ReadFailure }
  | { readonly kind: 'superseded' }
  | { readonly kind: 'defect'; readonly cause: unknown }
  | { readonly kind: 'interrupted' }

export interface SessionInventoryOptions {
  effects: AppEffectRuntime
  measure: Measure
  publish: (snapshot: InventorySnapshot, request: InventoryRequest) => void
  report: (status: InventoryStatus) => void
  onDefect: (cause: unknown) => void
}

export interface SessionInventory {
  refresh(request: InventoryRequest, context: InventoryContext): Promise<InventoryOutcome>
  observe(scope: InventoryScope): void
  status(): InventoryStatus
  // Counts settled startup and refresh loads (manual, mutation, view); polls do not count.
  revision(): number
  subscribe(listener: () => void): () => void
  // Pending while a startup or refresh load runs or waits; Agents polls are background work.
  readonly loading: PendingSignal
  dispose(): void
}

interface InventoryLoad {
  readonly request: InventoryRequest
  readonly context: InventoryContext
  readonly waiters: Array<(outcome: InventoryOutcome) => void>
}

const SUPERSEDED: InventoryOutcome = { kind: 'superseded' }
const INTERRUPTED: InventoryOutcome = { kind: 'interrupted' }

function requestViewMode(request: InventoryRequest): ViewMode {
  return request.kind === 'refresh' ? request.viewMode : ViewMode.Sessions
}

function requestLabel(request: InventoryRequest): string {
  switch (request.kind) {
    case 'startup':
    case 'agents-poll':
      return request.kind
    case 'refresh':
      return request.viewMode === ViewMode.Sessions ? 'refresh' : 'refresh-projects'
  }
}

function scopeOf(request: InventoryRequest, context: InventoryContext): InventoryScope {
  return { viewMode: requestViewMode(request), config: context.config, backend: context.backend }
}

function sameScope(left: InventoryScope, right: InventoryScope): boolean {
  return (
    left.viewMode === right.viewMode &&
    left.config === right.config &&
    left.backend === right.backend
  )
}

async function loadSnapshot(
  request: InventoryRequest,
  { config, backend }: InventoryContext,
  measure: Measure
): Promise<InventorySnapshot> {
  const { liveSessions, visibleSessions, sessionItems } = await loadSessionItems(
    config,
    measure,
    backend,
    requestLabel(request)
  )

  const viewMode =
    request.kind === 'startup' && sessionItems.length === 0
      ? ViewMode.Projects
      : requestViewMode(request)

  if (viewMode === ViewMode.Sessions) return { viewMode, liveSessions, sessionItems }

  const { projectSourceItems, projectItems } = await loadProjectItemsWithLinks(
    config,
    visibleSessions,
    measure
  )

  return { viewMode, liveSessions, sessionItems, projectSourceItems, projectItems }
}

// One owner per app: loads run one at a time, overlapping requests share a single follow-up, and
// a result only publishes while its scope is current and it is newer than the last publication.
export function createSessionInventory(options: SessionInventoryOptions): SessionInventory {
  const lifetime = new AbortController()
  let scope: InventoryScope = { viewMode: ViewMode.Sessions, config: null, backend: null }
  let epoch = 0
  let generation = 0
  let publishedGeneration = 0
  let current: InventoryStatus = { kind: 'fresh' }
  let running: InventoryLoad | undefined
  let queued: InventoryLoad | undefined
  let revision = 0
  const listeners = new Set<() => void>()
  const loading = createPendingFlag()

  function syncLoading(): void {
    loading.active = (running !== undefined && running.request.kind !== 'agents-poll') || !!queued
  }

  function revise(request: InventoryRequest): void {
    if (request.kind === 'agents-poll') return
    revision++

    for (const listener of listeners) listener()
  }

  function observe(next: InventoryScope): void {
    if (sameScope(scope, next)) return
    scope = next
    epoch++
  }

  function setStatus(next: InventoryStatus): void {
    const changed = next.kind !== current.kind
    current = next

    if (changed) options.report(next)
  }

  function settle(
    outcome: OperationOutcome<InventorySnapshot, ReadFailure>,
    load: InventoryLoad,
    loadEpoch: number,
    loadGeneration: number
  ): InventoryOutcome {
    if (lifetime.signal.aborted) return INTERRUPTED

    switch (outcome.kind) {
      case 'interrupted':
        return INTERRUPTED
      case 'defect':
        options.onDefect(outcome.cause)

        return { kind: 'defect', cause: outcome.cause }
      case 'failure':
      case 'success':
        break
    }

    if (loadEpoch !== epoch || loadGeneration <= publishedGeneration) return SUPERSEDED

    if (outcome.kind === 'failure') {
      setStatus({ kind: 'stale', failure: outcome.error })
      revise(load.request)

      return { kind: 'failed', failure: outcome.error }
    }

    const snapshot = outcome.value
    publishedGeneration = loadGeneration
    // Startup can land in Projects; keep the scope aligned with the view it published.
    scope = { ...scope, viewMode: snapshot.viewMode }
    options.publish(snapshot, load.request)
    setStatus({ kind: 'fresh' })
    revise(load.request)

    return { kind: 'published', generation: loadGeneration, snapshot }
  }

  function read(load: InventoryLoad): Promise<OperationOutcome<InventorySnapshot, ReadFailure>> {
    return options.effects
      .run(
        readEffect(() => loadSnapshot(load.request, load.context, options.measure)),
        { signal: lifetime.signal }
      )
      .catch((cause: unknown): OperationOutcome<InventorySnapshot, ReadFailure> => ({
        kind: 'defect',
        cause,
      }))
  }

  async function run(load: InventoryLoad): Promise<void> {
    running = load
    syncLoading()
    const loadEpoch = epoch
    const loadGeneration = ++generation

    const result = sameScope(scope, scopeOf(load.request, load.context))
      ? settle(await read(load), load, loadEpoch, loadGeneration)
      : SUPERSEDED

    running = undefined
    const next = queued
    queued = undefined

    if (next) run(next).catch(options.onDefect)
    syncLoading()

    for (const resolve of load.waiters) resolve(result)
  }

  function refresh(
    request: InventoryRequest,
    context: InventoryContext
  ): Promise<InventoryOutcome> {
    if (lifetime.signal.aborted) return Promise.resolve(INTERRUPTED)

    const requested = scopeOf(request, context)

    if (!sameScope(scope, requested)) {
      if (request.kind === 'agents-poll') return Promise.resolve(SUPERSEDED)
      observe(requested)
    }

    const { promise, resolve } = Promise.withResolvers<InventoryOutcome>()

    if (!running) {
      run({ request, context, waiters: [resolve] }).catch(options.onDefect)

      return promise
    }

    if (request.kind === 'agents-poll') {
      // A background poll is satisfied by whichever load in its scope is already pending.
      ;(queued ?? running).waiters.push(resolve)

      return promise
    }

    queued = { request, context, waiters: [...(queued?.waiters ?? []), resolve] }
    syncLoading()

    return promise
  }

  function dispose(): void {
    lifetime.abort()

    if (queued) {
      for (const resolve of queued.waiters) resolve(INTERRUPTED)
      queued = undefined
    }

    syncLoading()
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
    }
  }

  return {
    refresh,
    observe,
    status: () => current,
    revision: () => revision,
    subscribe,
    loading: { pending: loading.pending, subscribe: loading.subscribe },
    dispose,
  }
}

export interface InventorySelection {
  readonly sessionCursor: number
  readonly agentKey: string | undefined
  readonly agentCursor: number
}

export interface InventorySink {
  readonly lastSessionSelectionRef: MutableRefObject<string | null>
  readonly lastProjectSelectionRef: MutableRefObject<string | null>
  readonly setSessionItems: Dispatch<SetStateAction<Item[]>>
  readonly setLiveSessions: Dispatch<SetStateAction<Item[]>>
  readonly setProjectSourceItems: Dispatch<SetStateAction<Item[]>>
  readonly setAllItems: Dispatch<SetStateAction<Item[]>>
  readonly setItems: Dispatch<SetStateAction<Item[]>>
  readonly setCursor: Dispatch<SetStateAction<number>>
  readonly setAgentCursor: Dispatch<SetStateAction<number>>
}

// The only place loaded inventory reaches React state: collections update together and cursors
// follow their remembered keys, falling back to the nearest row at the previous index.
export function publishInventory(
  snapshot: InventorySnapshot,
  selection: InventorySelection,
  sink: InventorySink
): void {
  const { sessionItems } = snapshot
  sink.setSessionItems(current => reuseSessionItemIdentities(current, sessionItems))
  sink.setLiveSessions(snapshot.liveSessions)

  if (snapshot.viewMode === ViewMode.Projects) {
    sink.setProjectSourceItems(snapshot.projectSourceItems)
    sink.setAllItems(snapshot.projectItems)
    sink.setItems(snapshot.projectItems)
    sink.setCursor(
      getProjectSelectionIndex(snapshot.projectItems, sink.lastProjectSelectionRef.current)
    )

    return
  }

  const remembered = sink.lastSessionSelectionRef.current
  const cursor = getSessionSelectionIndex(sessionItems, remembered, selection.sessionCursor)

  if (remembered !== null) {
    const selected = sessionItems.filter(item => !isAgentSessionItem(item))[cursor]
    sink.lastSessionSelectionRef.current = selected ? getItemKey(selected) : null
  }

  sink.setAllItems(current => reuseSessionItemIdentities(current, sessionItems))
  sink.setItems(current => reuseSessionItemIdentities(current, sessionItems))
  sink.setCursor(cursor)
  sink.setAgentCursor(
    getAgentSelectionIndex(sessionItems, selection.agentKey, selection.agentCursor)
  )
}

export function formatStaleInventoryMessage(failure: ReadFailure): string {
  return `${failure.message} Existing sessions are unchanged; refresh will retry.`
}

export interface SessionInventoryState extends InventorySink {
  readonly viewMode: ViewMode
  readonly config: Config | null
  readonly backend: MultiplexerBackend | null
  readonly cursor: number
  readonly agentCursor: number
  readonly selectedAgentSession: Item | undefined
  readonly setViewMode: Dispatch<SetStateAction<ViewMode>>
  readonly setMessage: Dispatch<SetStateAction<string>>
}

export function useSessionInventory(
  effects: AppEffectRuntime,
  measure: Measure,
  state: SessionInventoryState
): SessionInventory {
  const latest = useRef(state)
  latest.current = state

  const [inventory] = useState(() => {
    let reported: string | undefined

    return createSessionInventory({
      effects,
      measure,
      publish(snapshot, request) {
        const sink = latest.current

        if (request.kind === 'startup') sink.setViewMode(snapshot.viewMode)

        publishInventory(
          snapshot,
          {
            sessionCursor: sink.cursor,
            agentKey: sink.selectedAgentSession ? getItemKey(sink.selectedAgentSession) : undefined,
            agentCursor: sink.agentCursor,
          },
          sink
        )
      },
      report(status) {
        const { setMessage } = latest.current

        if (status.kind === 'stale') {
          reported = formatStaleInventoryMessage(status.failure)
          setMessage(reported)

          return
        }

        const recovered = reported
        reported = undefined

        if (recovered) setMessage(current => (current === recovered ? '' : current))
      },
      onDefect: requestFatalShutdown,
    })
  })

  const { viewMode, config, backend } = state

  useEffect(() => {
    inventory.observe({ viewMode, config, backend })
  }, [backend, config, inventory, viewMode])

  useEffect(() => () => inventory.dispose(), [inventory])

  return inventory
}
