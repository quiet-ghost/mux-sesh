import { test, expect, describe, mock } from 'bun:test'
import {
  canAutoUpdate,
  detectInstallMethod,
  getInstalledVersion,
  performUpgrade,
} from '../src/update/installation'
import { CURRENT_VERSION } from '../src/update/version'
import type { SpawnOptions, Subprocess } from 'bun'

const sourceRuntimePath = new URL('../src/index.tsx', import.meta.url).pathname
const realSpawn = Bun.spawn

type AnySpawnOptions = SpawnOptions.SpawnOptions<
  SpawnOptions.Writable,
  SpawnOptions.Readable,
  SpawnOptions.Readable
>

// Runs the replacement command returned by `respond` instead of the requested one.
function spawnInstead(respond: (command: string[]) => string[]): typeof Bun.spawn {
  function spawn<
    const In extends SpawnOptions.Writable = 'ignore',
    const Out extends SpawnOptions.Readable = 'pipe',
    const Err extends SpawnOptions.Readable = 'inherit',
  >(options: SpawnOptions.SpawnOptions<In, Out, Err> & { cmd: string[] }): Subprocess<In, Out, Err>
  function spawn<
    const In extends SpawnOptions.Writable = 'ignore',
    const Out extends SpawnOptions.Readable = 'pipe',
    const Err extends SpawnOptions.Readable = 'inherit',
  >(cmds: string[], options?: SpawnOptions.SpawnOptions<In, Out, Err>): Subprocess<In, Out, Err>
  function spawn(
    commandOrOptions: string[] | (AnySpawnOptions & { cmd: string[] }),
    options?: AnySpawnOptions
  ): Subprocess<SpawnOptions.Writable, SpawnOptions.Readable, SpawnOptions.Readable> {
    if (Array.isArray(commandOrOptions)) {
      return realSpawn(respond(commandOrOptions), options)
    }

    return realSpawn({ ...commandOrOptions, cmd: respond(commandOrOptions.cmd) })
  }

  return spawn
}

function printing(output: string): string[] {
  return ['printf', '%s', output]
}

describe('installation', () => {
  describe('detectInstallMethod', () => {
    test('should detect npm installation', async () => {
      const originalSpawn = Bun.spawn
      Bun.spawn = spawnInstead(() => printing('mux-sesh@1.0.0\n'))

      const method = await detectInstallMethod('/tmp/not-mux-sesh/runtime.ts')
      expect(method).toBe('npm')

      Bun.spawn = originalSpawn
    })

    test('should detect bun installation', async () => {
      const originalSpawn = Bun.spawn
      let callCount = 0

      Bun.spawn = spawnInstead(() => {
        callCount++

        return callCount === 1 ? printing('other-package@1.0.0\n') : printing('mux-sesh@1.0.0\n')
      })

      const method = await detectInstallMethod('/tmp/not-mux-sesh/runtime.ts')
      expect(method).toBe('bun')

      Bun.spawn = originalSpawn
    })

    test('should detect brew installation', async () => {
      const originalSpawn = Bun.spawn
      let callCount = 0

      Bun.spawn = spawnInstead(() => {
        callCount++

        return callCount <= 2 ? printing('other-package\n') : printing('mux-sesh 1.0.0\n')
      })

      const method = await detectInstallMethod('/tmp/not-mux-sesh/runtime.ts')
      expect(method).toBe('brew')

      Bun.spawn = originalSpawn
    })

    test('should return unknown when not found in any package manager', async () => {
      const originalSpawn = Bun.spawn
      Bun.spawn = spawnInstead(() => printing('other-package@1.0.0\n'))

      const method = await detectInstallMethod('/tmp/not-mux-sesh/runtime.ts')
      expect(method).toBe('unknown')

      Bun.spawn = originalSpawn
    })

    test('should handle spawn errors gracefully', async () => {
      const originalSpawn = Bun.spawn
      Bun.spawn = spawnInstead(() => {
        throw new Error('Spawn error')
      })

      const method = await detectInstallMethod('/tmp/not-mux-sesh/runtime.ts')
      expect(method).toBe('unknown')

      Bun.spawn = originalSpawn
    })

    test('should prefer the active bun install path over npm listings', async () => {
      const method = await detectInstallMethod(
        '/home/ghost/.cache/.bun/install/global/node_modules/mux-sesh/src/index.tsx'
      )

      expect(method).toBe('bun')
    })

    test('should detect source checkouts as source installs', async () => {
      const method = await detectInstallMethod(sourceRuntimePath)
      expect(method).toBe('source')
    })
  })

  describe('getInstalledVersion', () => {
    test('should read the running package version from the runtime path', async () => {
      const version = await getInstalledVersion(sourceRuntimePath)
      expect(version).toBe(CURRENT_VERSION)
    })

    test('should return null when no package root can be found', async () => {
      const version = await getInstalledVersion('/tmp/not-mux-sesh/runtime.ts')
      expect(version).toBeNull()
    })
  })

  describe('performUpgrade', () => {
    test('should return false for unknown install method', async () => {
      const success = await performUpgrade('unknown', '1.2.0')
      expect(success).toBe(false)
    })

    test('should execute npm upgrade command', async () => {
      const originalSpawn = Bun.spawn
      let capturedCommand: string[] = []

      Bun.spawn = spawnInstead(cmd => {
        capturedCommand = cmd

        return ['true']
      })

      const success = await performUpgrade('npm', '1.2.0')
      expect(success).toBe(true)
      expect(capturedCommand).toEqual(['npm', 'install', '-g', 'mux-sesh@1.2.0'])

      Bun.spawn = originalSpawn
    })

    test('should execute bun upgrade command', async () => {
      const originalSpawn = Bun.spawn
      let capturedCommand: string[] = []

      Bun.spawn = spawnInstead(cmd => {
        capturedCommand = cmd

        return ['true']
      })

      const success = await performUpgrade('bun', '1.2.0')
      expect(success).toBe(true)
      expect(capturedCommand).toEqual(['bun', 'install', '-g', 'mux-sesh@1.2.0'])

      Bun.spawn = originalSpawn
    })

    test('should execute brew upgrade command', async () => {
      const originalSpawn = Bun.spawn
      let capturedCommand: string[] = []

      Bun.spawn = spawnInstead(cmd => {
        capturedCommand = cmd

        return ['true']
      })

      const success = await performUpgrade('brew', '1.2.0')
      expect(success).toBe(true)
      expect(capturedCommand).toEqual(['brew', 'upgrade', 'mux-sesh'])

      Bun.spawn = originalSpawn
    })

    test('should return false on non-zero exit code', async () => {
      const originalSpawn = Bun.spawn
      Bun.spawn = spawnInstead(() => ['false'])

      const success = await performUpgrade('npm', '1.2.0')
      expect(success).toBe(false)

      Bun.spawn = originalSpawn
    })

    test('should return false on spawn error', async () => {
      const originalSpawn = Bun.spawn
      const originalConsoleError = console.error
      console.error = mock(() => {})
      Bun.spawn = spawnInstead(() => {
        throw new Error('Spawn error')
      })

      const success = await performUpgrade('npm', '1.2.0')
      expect(success).toBe(false)

      Bun.spawn = originalSpawn
      console.error = originalConsoleError
    })
  })

  describe('canAutoUpdate', () => {
    test('supports npm and bun installs', () => {
      expect(canAutoUpdate('npm')).toBe(true)
      expect(canAutoUpdate('bun')).toBe(true)
    })

    test('does not auto-update brew, source, or unknown installs', () => {
      expect(canAutoUpdate('brew')).toBe(false)
      expect(canAutoUpdate('source')).toBe(false)
      expect(canAutoUpdate('unknown')).toBe(false)
    })
  })
})
