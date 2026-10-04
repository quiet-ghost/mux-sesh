import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { summarizeTimings, type TimingSummary } from '../../src/util/perf'
import { PICKER_CORPUS_SIZE, PICKER_QUERIES } from './picker-corpus'

interface NativeBaseline {
  fixtureFiles: number
  indexedFiles: number
  indexedDirectories: number
  pageSize: number
  iterations: number
  warmup: number
  initializeAndScanMs: number
  mixedSearch: TimingSummary
  released: boolean
}

export async function runNativeBaseline(iterations = 30, warmup = 5): Promise<NativeBaseline> {
  const { FileFinder } = await import('@ff-labs/fff-bun')
  if (!FileFinder.isAvailable()) {
    throw new Error(
      'FFF native library is unavailable; install the locked dependencies before benchmarking'
    )
  }
  const root = await mkdtemp(join(tmpdir(), 'mux-sesh-baseline-'))
  try {
    for (let offset = 0; offset < PICKER_CORPUS_SIZE.projects; offset += 32) {
      const count = Math.min(32, PICKER_CORPUS_SIZE.projects - offset)
      const writes = await Promise.allSettled(
        Array.from({ length: count }, async (_, index) => {
          const directory = join(root, `project-${String(offset + index).padStart(5, '0')}`)
          await mkdir(directory)
          await Bun.write(join(directory, 'README.md'), '# Benchmark fixture\n')
        })
      )
      for (const write of writes) {
        if (write.status === 'rejected') {
          throw new Error('Native benchmark fixture creation failed', { cause: write.reason })
        }
      }
    }

    const start = performance.now()
    const created = FileFinder.create({
      basePath: root,
      disableMmapCache: true,
      disableContentIndexing: true,
    })
    if (!created.ok) throw new Error(`FFF fixture initialization failed: ${created.error}`)
    const finder = created.value
    try {
      const scanned = await finder.waitForScan(10000)
      if (!scanned.ok) throw new Error(`FFF fixture scan failed: ${scanned.error}`)
      if (!scanned.value) throw new Error('FFF fixture scan did not finish within 10 seconds')
      const initializeAndScanMs = performance.now() - start
      const samples: number[] = []
      let indexedFiles = 0
      let indexedDirectories = 0
      for (let index = 0; index < warmup + iterations; index++) {
        const query = PICKER_QUERIES[index % PICKER_QUERIES.length]
        const queryStart = performance.now()
        const result = finder.mixedSearch(query, { pageSize: 60 })
        const elapsed = performance.now() - queryStart
        if (!result.ok) throw new Error(`FFF fixture search failed: ${result.error}`)
        if (
          result.value.totalFiles !== PICKER_CORPUS_SIZE.projects ||
          !result.value.items.some(entry => entry.item.relativePath.includes(query))
        ) {
          throw new Error('FFF fixture search returned an incomplete corpus or no matches')
        }
        indexedFiles = result.value.totalFiles
        indexedDirectories = result.value.totalDirs
        if (index >= warmup) samples.push(elapsed)
      }
      finder.destroy()
      return {
        fixtureFiles: PICKER_CORPUS_SIZE.projects,
        indexedFiles,
        indexedDirectories,
        pageSize: 60,
        iterations,
        warmup,
        initializeAndScanMs,
        mixedSearch: summarizeTimings(samples),
        released: finder.isDestroyed,
      }
    } finally {
      finder.destroy()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
