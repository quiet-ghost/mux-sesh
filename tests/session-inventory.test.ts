import { afterEach, expect, test } from 'bun:test'
import { createEffectRuntime } from '../src/app/effect-runtime'
import {
  createSessionInventory,
  type InventorySnapshot,
  type InventoryStatus,
} from '../src/app/session-inventory'
import { getDefaultConfig } from '../src/config'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError } from '../src/multiplexer/types'
import { ViewMode, type Config } from '../src/types'

interface PendingList {
  readonly call: number
  settled: boolean
  release(): void
  fail(cause: unknown): void
}

const config: Config = { ...getDefaultConfig('/fixture'), projectPaths: [] }
const refresh = { kind: 'refresh', viewMode: ViewMode.Sessions } as const
const disposers: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(disposers.splice(0).map(dispose => dispose()))
})

function workspace(title: string): LiveWorkspace {
  return {
    backend: 'tmux',
    id: title,
    title,
    path: `/fixture/${title}`,
    isActive: false,
    unitCount: 1,
  }
}

function unsupportedBackendCall(): never {
  throw new Error('Inventory tests only list workspaces')
}

// Each list() call stays pending until the test releases it with rows named after its call order.
function createDeferredBackend() {
  const pending: PendingList[] = []

  const backend: MultiplexerBackend = {
    kind: 'tmux',
    capabilities: { previousWorkspace: false },
    list() {
      const call = pending.length + 1
      const deferred = Promise.withResolvers<LiveWorkspace[]>()

      const entry: PendingList = {
        call,
        settled: false,
        release() {
          entry.settled = true
          deferred.resolve([workspace(`load-${call}`)])
        },
        fail(cause) {
          entry.settled = true
          deferred.reject(cause)
        },
      }

      pending.push(entry)

      return deferred.promise
    },
    open: unsupportedBackendCall,
    openOrCreate: unsupportedBackendCall,
    create: unsupportedBackendCall,
    start: unsupportedBackendCall,
    rename: unsupportedBackendCall,
    close: unsupportedBackendCall,
    current: unsupportedBackendCall,
    directory: unsupportedBackendCall,
    details: unsupportedBackendCall,
    openEditor: unsupportedBackendCall,
  }

  return { backend, pending }
}

function createHarness() {
  const effects = createEffectRuntime({ run: unsupportedBackendCall })
  const { backend, pending } = createDeferredBackend()
  const published: InventorySnapshot[] = []
  const statuses: InventoryStatus[] = []
  const defects: unknown[] = []

  const inventory = createSessionInventory({
    effects,
    measure: async (_name, run) => run(),
    publish: snapshot => published.push(snapshot),
    report: status => statuses.push(status),
    onDefect: cause => defects.push(cause),
  })

  disposers.push(async () => {
    inventory.dispose()
    await effects.dispose()
  })

  async function listCalls(count: number): Promise<void> {
    for (let tick = 0; pending.length < count; tick++) {
      if (tick > 100) throw new Error(`Expected ${count} list() calls, saw ${pending.length}`)
      await Bun.sleep(0)
    }
  }

  async function quiesce(): Promise<void> {
    for (let tick = 0; tick < 10; tick++) await Bun.sleep(0)
  }

  // Releasing the newest open load first is the order in which a late result would win.
  async function drainNewestFirst(): Promise<void> {
    for (let round = 0; round < 10; round++) {
      await quiesce()
      const open = pending.filter(entry => !entry.settled)

      if (open.length === 0) return

      for (const entry of open.reverse()) entry.release()
    }
  }

  const titles = () => published.map(snapshot => snapshot.sessionItems.map(item => item.title))

  return {
    inventory,
    pending,
    published,
    statuses,
    defects,
    context: { config, backend },
    listCalls,
    quiesce,
    drainNewestFirst,
    titles,
  }
}

test('a late refresh that started before a newer one cannot overwrite the newer inventory', async () => {
  const harness = createHarness()
  const first = harness.inventory.refresh(refresh, harness.context)
  await harness.listCalls(1)
  const second = harness.inventory.refresh(refresh, harness.context)

  await harness.drainNewestFirst()

  const outcomes = await Promise.all([first, second])
  expect(harness.titles().at(-1)).toEqual(['load-2'])
  expect(harness.titles()).toEqual([['load-1'], ['load-2']])
  expect(outcomes.map(outcome => outcome.kind)).toEqual(['published', 'published'])
})

test('a refresh that started before a config change cannot publish after it', async () => {
  const harness = createHarness()
  const stale = harness.inventory.refresh(refresh, harness.context)
  await harness.listCalls(1)
  const changedConfig: Config = { ...config, sortOrder: 'alphabetical' }
  const current = harness.inventory.refresh(refresh, { ...harness.context, config: changedConfig })

  harness.pending[0]?.release()
  expect(await stale).toEqual({ kind: 'superseded' })
  expect(harness.published).toEqual([])

  await harness.listCalls(2)
  harness.pending[1]?.release()
  expect(await current).toMatchObject({ kind: 'published' })
  expect(harness.titles()).toEqual([['load-2']])
})

test('a refresh that started before a view change cannot publish after it', async () => {
  const harness = createHarness()
  const stale = harness.inventory.refresh(refresh, harness.context)
  await harness.listCalls(1)

  harness.inventory.observe({ viewMode: ViewMode.Projects, ...harness.context })
  harness.pending[0]?.release()

  expect(await stale).toEqual({ kind: 'superseded' })
  expect(harness.published).toEqual([])
  expect(await harness.inventory.refresh({ kind: 'agents-poll' }, harness.context)).toEqual({
    kind: 'superseded',
  })
  await harness.quiesce()
  expect(harness.pending).toHaveLength(1)
})

test('three overlapping refresh requests cause at most two list() calls', async () => {
  const harness = createHarness()
  const first = harness.inventory.refresh(refresh, harness.context)
  await harness.listCalls(1)
  const second = harness.inventory.refresh(refresh, harness.context)
  const third = harness.inventory.refresh(refresh, harness.context)

  await harness.drainNewestFirst()
  const outcomes = await Promise.all([first, second, third])
  await harness.quiesce()

  expect(harness.pending).toHaveLength(2)
  expect(outcomes[1]).toEqual(outcomes[2])
  expect(harness.titles()).toEqual([['load-1'], ['load-2']])
})

test('an Agents poll joins the load already in flight', async () => {
  const harness = createHarness()
  const manual = harness.inventory.refresh(refresh, harness.context)
  await harness.listCalls(1)
  const poll = harness.inventory.refresh({ kind: 'agents-poll' }, harness.context)

  await harness.drainNewestFirst()

  expect(await poll).toEqual(await manual)
  await harness.quiesce()
  expect(harness.pending).toHaveLength(1)
})

test('an expected list failure keeps the last inventory and reports staleness until recovery', async () => {
  const harness = createHarness()
  const loaded = harness.inventory.refresh(refresh, harness.context)
  await harness.listCalls(1)
  harness.pending[0]?.release()
  expect(await loaded).toMatchObject({ kind: 'published' })

  const failure = new MultiplexerError('server-stopped', 'fixture server stopped')
  const failed = harness.inventory.refresh(refresh, harness.context)
  await harness.listCalls(2)
  harness.pending[1]?.fail(failure)

  expect(await failed).toEqual({ kind: 'failed', failure })
  expect(harness.titles()).toEqual([['load-1']])
  expect(harness.inventory.status()).toEqual({ kind: 'stale', failure })
  expect(harness.statuses).toEqual([{ kind: 'stale', failure }])

  const recovered = harness.inventory.refresh(refresh, harness.context)
  await harness.listCalls(3)
  harness.pending[2]?.release()

  expect(await recovered).toMatchObject({ kind: 'published' })
  expect(harness.titles()).toEqual([['load-1'], ['load-3']])
  expect(harness.inventory.status()).toEqual({ kind: 'fresh' })
  expect(harness.statuses).toEqual([{ kind: 'stale', failure }, { kind: 'fresh' }])
  expect(harness.defects).toEqual([])
})

test('a defect during a load goes to the fatal channel and publishes nothing', async () => {
  const harness = createHarness()
  const defect = new Error('fixture programming error')
  const loading = harness.inventory.refresh(refresh, harness.context)
  await harness.listCalls(1)
  harness.pending[0]?.fail(defect)

  expect(await loading).toEqual({ kind: 'defect', cause: defect })
  expect(harness.defects).toEqual([defect])
  expect(harness.published).toEqual([])
  expect(harness.inventory.status()).toEqual({ kind: 'fresh' })
})

test('loading is pending while a startup or refresh load runs or waits, and polls do not count', async () => {
  const harness = createHarness()
  const seen: boolean[] = []

  const unsubscribe = harness.inventory.loading.subscribe(() =>
    seen.push(harness.inventory.loading.pending())
  )

  expect(harness.inventory.loading.pending()).toBe(false)

  harness.inventory.observe({ viewMode: ViewMode.Sessions, ...harness.context })
  const poll = harness.inventory.refresh({ kind: 'agents-poll' }, harness.context)
  await harness.listCalls(1)
  expect(harness.inventory.loading.pending()).toBe(false)

  const manual = harness.inventory.refresh(refresh, harness.context)
  expect(harness.inventory.loading.pending()).toBe(true)

  await harness.drainNewestFirst()
  await Promise.all([poll, manual])
  await harness.quiesce()

  expect(harness.inventory.loading.pending()).toBe(false)
  expect(seen).toEqual([true, false])
  unsubscribe()
})
