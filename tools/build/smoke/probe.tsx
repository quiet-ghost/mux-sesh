import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { testRender } from '@opentui/react/test-utils'
import { App } from '../../../src/app'
import { loadNativeFileSearch } from '../../../src/search/fff'
import { isCompiledBinary } from '../../../src/update/build'
import { getDefaultRuntimePath } from '../../../src/update/installation'
import { CURRENT_VERSION } from '../../../src/update/version'

// Process start to the full app module graph evaluated: the import cost every launch pays.
const importMs = performance.now()

const PROBE_FILE = 'mux-sesh-probe-target.md'

export interface ProbeReport {
  readonly importMs: number
  readonly version: string
  readonly compiled: boolean
  readonly runtimePathIsExecutable: boolean
  readonly appLoaded: boolean
  readonly rendered: boolean
  readonly fileSearch: string
}

async function probeRendering(): Promise<boolean> {
  const setup = await testRender(<text>probe frame</text>, {
    width: 20,
    height: 2,
    consoleMode: 'disabled',
  })

  try {
    await setup.renderOnce()

    return setup.captureCharFrame().includes('probe frame')
  } finally {
    setup.renderer.destroy()
  }
}

async function probeFileSearch(): Promise<string> {
  const search = await loadNativeFileSearch()

  if (search.kind === 'disabled') return 'disabled'

  if (search.kind === 'unavailable') return `unavailable: ${search.failure.message}`

  const root = await mkdtemp(join(tmpdir(), 'mux-sesh-probe-'))

  try {
    await Bun.write(join(root, PROBE_FILE), 'probe')
    const created = search.create(root)

    if (!created.ok) return `create failed: ${created.error}`

    const finder = created.value

    try {
      const scanned = await finder.waitForScan(5000)

      if (!scanned.ok) return `scan failed: ${scanned.error}`

      const result = finder.mixedSearch('probe target', { pageSize: 10 })

      if (!result.ok) return `search failed: ${result.error}`

      const found = result.value.items.some(
        mixed => mixed.type === 'file' && mixed.item.fileName === PROBE_FILE
      )

      return found ? 'matched' : 'no match'
    } finally {
      finder.destroy()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const report: ProbeReport = {
  importMs,
  version: CURRENT_VERSION,
  compiled: isCompiledBinary(),
  runtimePathIsExecutable: getDefaultRuntimePath() === process.execPath,
  appLoaded: Boolean(App),
  rendered: await probeRendering(),
  fileSearch: await probeFileSearch(),
}

console.log(JSON.stringify(report))
