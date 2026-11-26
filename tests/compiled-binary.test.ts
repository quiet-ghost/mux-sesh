import { describe, expect, test } from 'bun:test'
import { readPackageVersion, singleTarget } from '../tools/build/build'
import { APP_ENTRYPOINT, binaryPath, compileBinary } from '../tools/build/compile'
import { runSmoke } from '../tools/build/smoke'

// Compiling and launching a ~140 MB binary is too slow for every run: MUX_SESH_BINARY_SMOKE=1 bun test tests/compiled-binary.test.ts
const enabled = process.env.MUX_SESH_BINARY_SMOKE === '1'

describe.skipIf(!enabled)('compiled binary smoke', () => {
  test(
    'the current platform binary loads its native libraries and restores the terminal',
    async () => {
      const selection = singleTarget()

      if (!selection.ok) throw new Error(selection.message)

      for (const target of selection.targets) {
        const outcome = await compileBinary({
          entrypoint: APP_ENTRYPOINT,
          target,
          version: await readPackageVersion(),
          outfile: binaryPath(target),
        })

        if (!outcome.ok) throw new Error(outcome.message)

        const result = await runSmoke({ target, runs: 1, compareSource: false })

        expect(result.failures).toEqual([])
      }
    },
    { timeout: 120_000 }
  )
})
