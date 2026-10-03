import type { MultiplexerBackend } from '../../src/multiplexer'
import { summarizeTimings, type TimingSummary } from '../../src/util/perf'
import { renderSessionScreen } from '../fixtures/session-screen'
import {
  createPickerCorpus,
  PICKER_CORPUS_SIZE,
  PICKER_QUERIES,
  type PickerWork,
} from './picker-corpus'

interface PickerBaselineOptions {
  iterations?: number
  warmup?: number
}

interface PickerBaseline {
  corpus: { sessions: number; projects: number }
  dimensions: { width: number; height: number }
  iterations: number
  warmup: number
  timings: {
    firstUsableFrameMs: number
    cachedProjectsFrameMs: number
    navigationToFrame: TimingSummary
    navigationPreview: TimingSummary
    localFilter: TimingSummary
    queryToFrame: TimingSummary
  }
  work: {
    startup: PickerWork
    navigation: PickerWork
    projects: PickerWork
    queries: PickerWork
    statistics: PickerWork
  }
  released: boolean
}

function subtractPickerWork(after: PickerWork, before: PickerWork): PickerWork {
  return {
    navigation: after.navigation - before.navigation,
    inventory: after.inventory - before.inventory,
    search: after.search - before.search,
    preview: after.preview - before.preview,
    statistics: after.statistics - before.statistics,
    subprocess: after.subprocess - before.subprocess,
  }
}

function requireSelectedRow(frame: string, title: string): void {
  if (!frame.split('\n').some(line => line.includes('›') && line.includes(title))) {
    throw new Error(`Baseline frame did not show selected row ${title}`)
  }
}

async function captureStatisticsEntry(
  corpus: ReturnType<typeof createPickerCorpus>
): Promise<boolean> {
  function unexpectedBackendCall(): never {
    throw new Error('The statistics-entry probe must not perform backend I/O')
  }
  const backend: MultiplexerBackend = {
    kind: 'tmux',
    capabilities: { previousWorkspace: false },
    async list() {
      corpus.work.inventory++
      return [
        {
          backend: 'tmux',
          id: 'opencode-fixture',
          title: 'opencode-fixture',
          path: '/fixture',
          isActive: false,
          unitCount: 1,
        },
      ]
    },
    open: unexpectedBackendCall,
    openOrCreate: unexpectedBackendCall,
    rename: unexpectedBackendCall,
    close: unexpectedBackendCall,
    current: unexpectedBackendCall,
    directory: unexpectedBackendCall,
    details: unexpectedBackendCall,
    openEditor: unexpectedBackendCall,
  }
  const screen = await renderSessionScreen(
    { width: 60, height: 18 },
    { backend, loadStatistics: corpus.loadStatistics }
  )
  try {
    await screen.pressKey('o')
    requireSelectedRow(await screen.frame(), 'opencode-fixture')
    screen.destroy()
    return (
      screen.renderer.isDestroyed &&
      screen.renderer.stdin.listenerCount('data') === 0 &&
      screen.lifecycle.at(-1) === 'unmounted'
    )
  } finally {
    screen.destroy()
  }
}

export async function runPickerBaseline({
  iterations = 30,
  warmup = 5,
}: PickerBaselineOptions = {}): Promise<PickerBaseline> {
  const corpus = createPickerCorpus()
  const dimensions = { width: 120, height: 36 }
  const start = performance.now()
  const screen = await renderSessionScreen(dimensions, corpus)

  try {
    requireSelectedRow(await screen.frame(), 'session-000')
    const firstUsableFrameMs = performance.now() - start
    const startupWork = { ...corpus.work }

    async function navigate(index: number): Promise<number> {
      const start = performance.now()
      corpus.work.navigation++
      await screen.pressKey('ARROW_DOWN')
      requireSelectedRow(await screen.frame(), `session-${String(index).padStart(3, '0')}`)
      return performance.now() - start
    }

    for (let index = 0; index < warmup; index++) await navigate(index + 1)
    const beforeNavigation = { ...corpus.work }
    const previewOffset = corpus.previewSamples.length
    const navigationSamples: number[] = []
    for (let index = 0; index < iterations; index++) {
      navigationSamples.push(await navigate(warmup + index + 1))
    }
    const navigationWork = subtractPickerWork(corpus.work, beforeNavigation)
    const navigationPreview = summarizeTimings(corpus.previewSamples.slice(previewOffset))

    const beforeProjects = { ...corpus.work }
    const projectStart = performance.now()
    await screen.pressKey('n')
    requireSelectedRow(await screen.frame(), 'project-00000')
    const cachedProjectsFrameMs = performance.now() - projectStart
    const projectWork = subtractPickerWork(corpus.work, beforeProjects)

    async function query(index: number): Promise<number> {
      const query = PICKER_QUERIES[index % PICKER_QUERIES.length]
      const start = performance.now()
      await screen.replaceQuery(query)
      requireSelectedRow(await screen.frame(), query)
      return performance.now() - start
    }

    for (let index = 0; index < warmup; index++) await query(index)
    const beforeQueries = { ...corpus.work }
    const filterOffset = corpus.filterSamples.length
    const querySamples: number[] = []
    for (let index = 0; index < iterations; index++) querySamples.push(await query(warmup + index))
    const queryWork = subtractPickerWork(corpus.work, beforeQueries)

    screen.destroy()
    const beforeStatistics = { ...corpus.work }
    const statisticsReleased = await captureStatisticsEntry(corpus)
    const statisticsWork = subtractPickerWork(corpus.work, beforeStatistics)
    return {
      corpus: PICKER_CORPUS_SIZE,
      dimensions,
      iterations,
      warmup,
      timings: {
        firstUsableFrameMs,
        cachedProjectsFrameMs,
        navigationToFrame: summarizeTimings(navigationSamples),
        navigationPreview,
        localFilter: summarizeTimings(corpus.filterSamples.slice(filterOffset)),
        queryToFrame: summarizeTimings(querySamples),
      },
      work: {
        startup: startupWork,
        navigation: navigationWork,
        projects: projectWork,
        queries: queryWork,
        statistics: statisticsWork,
      },
      released:
        statisticsReleased &&
        screen.renderer.isDestroyed &&
        screen.renderer.stdin.listenerCount('data') === 0 &&
        screen.lifecycle.at(-1) === 'unmounted',
    }
  } finally {
    screen.destroy()
  }
}
