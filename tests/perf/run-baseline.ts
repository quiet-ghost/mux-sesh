import { cpus, release } from 'os'
import pkg from '../../package.json'

if (process.argv.length > 2) {
  throw new Error(
    'The picker baseline accepts no paths or options; it uses generated fixtures only'
  )
}

const importStart = performance.now()
const { runPickerBaseline } = await import('./picker-baseline')
const harnessImportMs = performance.now() - importStart
const picker = await runPickerBaseline()
const { runNativeBaseline } = await import('./native-baseline')
const native = await runNativeBaseline(picker.iterations, picker.warmup)
if (!picker.released || !native.released) {
  throw new Error(
    'Baseline resources were not released; discard these results and investigate cleanup'
  )
}

console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      environment: {
        platform: process.platform,
        arch: process.arch,
        kernel: release(),
        cpu: cpus()[0]?.model ?? 'unavailable',
        bun: Bun.version,
        app: pkg.version,
        dependencies: pkg.dependencies,
      },
      scope: {
        firstFrame:
          'Fresh renderer and fixture inventory after module imports and corpus generation',
        warmQueries:
          'Cached project candidates; native search and discovery excluded from UI timing',
        subprocess: 'Recorded Herdr CommandRunner calls; no backend processes spawned',
        statistics:
          'One tmux agent entry; count-only statistics callback; no private storage or timed poll wait',
        native:
          'Fresh finder; freshly written OS-warm temporary corpus; no frecency/history DB; warmed synchronous mixedSearch',
      },
      harnessImportMs,
      picker,
      native,
    },
    null,
    2
  )
)
