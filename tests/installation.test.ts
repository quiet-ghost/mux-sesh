import { test, expect, describe, mock } from 'bun:test'
import { detectInstallMethod, performUpgrade } from '../src/update/installation'
import type { Subprocess } from 'bun'

describe('installation', () => {
  describe('detectInstallMethod', () => {
    test('should detect npm installation', async () => {
      const originalSpawn = Bun.spawn
      const mockProcess = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('mux-sesh@1.0.0\n'))
            controller.close()
          },
        }),
      } as Subprocess

      Bun.spawn = mock(() => mockProcess) as typeof Bun.spawn

      const method = await detectInstallMethod()
      expect(method).toBe('npm')

      Bun.spawn = originalSpawn
    })

    test('should detect bun installation', async () => {
      const originalSpawn = Bun.spawn
      let callCount = 0
      const mockProcessNoMatch = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('other-package@1.0.0\n'))
            controller.close()
          },
        }),
      } as Subprocess
      const mockProcessMatch = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('mux-sesh@1.0.0\n'))
            controller.close()
          },
        }),
      } as Subprocess

      Bun.spawn = mock(() => {
        callCount++
        return callCount === 1 ? mockProcessNoMatch : mockProcessMatch
      }) as typeof Bun.spawn

      const method = await detectInstallMethod()
      expect(method).toBe('bun')

      Bun.spawn = originalSpawn
    })

    test('should detect brew installation', async () => {
      const originalSpawn = Bun.spawn
      let callCount = 0
      const mockProcessNoMatch = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('other-package\n'))
            controller.close()
          },
        }),
      } as Subprocess
      const mockProcessMatch = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('mux-sesh 1.0.0\n'))
            controller.close()
          },
        }),
      } as Subprocess

      Bun.spawn = mock(() => {
        callCount++
        return callCount <= 2 ? mockProcessNoMatch : mockProcessMatch
      }) as typeof Bun.spawn

      const method = await detectInstallMethod()
      expect(method).toBe('brew')

      Bun.spawn = originalSpawn
    })

    test('should return unknown when not found in any package manager', async () => {
      const originalSpawn = Bun.spawn
      const mockProcess = {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('other-package@1.0.0\n'))
            controller.close()
          },
        }),
      } as Subprocess

      Bun.spawn = mock(() => mockProcess) as typeof Bun.spawn

      const method = await detectInstallMethod()
      expect(method).toBe('unknown')

      Bun.spawn = originalSpawn
    })

    test('should handle spawn errors gracefully', async () => {
      const originalSpawn = Bun.spawn
      Bun.spawn = mock(() => {
        throw new Error('Spawn error')
      }) as typeof Bun.spawn

      const method = await detectInstallMethod()
      expect(method).toBe('unknown')

      Bun.spawn = originalSpawn
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
      const mockProcess = {
        exited: Promise.resolve(),
        exitCode: 0,
      } as unknown as Subprocess

      Bun.spawn = mock((cmd) => {
        capturedCommand = cmd as string[]
        return mockProcess
      }) as typeof Bun.spawn

      const success = await performUpgrade('npm', '1.2.0')
      expect(success).toBe(true)
      expect(capturedCommand).toEqual(['npm', 'install', '-g', 'mux-sesh@1.2.0'])

      Bun.spawn = originalSpawn
    })

    test('should execute bun upgrade command', async () => {
      const originalSpawn = Bun.spawn
      let capturedCommand: string[] = []
      const mockProcess = {
        exited: Promise.resolve(),
        exitCode: 0,
      } as unknown as Subprocess

      Bun.spawn = mock((cmd) => {
        capturedCommand = cmd as string[]
        return mockProcess
      }) as typeof Bun.spawn

      const success = await performUpgrade('bun', '1.2.0')
      expect(success).toBe(true)
      expect(capturedCommand).toEqual(['bun', 'install', '-g', 'mux-sesh@1.2.0'])

      Bun.spawn = originalSpawn
    })

    test('should execute brew upgrade command', async () => {
      const originalSpawn = Bun.spawn
      let capturedCommand: string[] = []
      const mockProcess = {
        exited: Promise.resolve(),
        exitCode: 0,
      } as unknown as Subprocess

      Bun.spawn = mock((cmd) => {
        capturedCommand = cmd as string[]
        return mockProcess
      }) as typeof Bun.spawn

      const success = await performUpgrade('brew', '1.2.0')
      expect(success).toBe(true)
      expect(capturedCommand).toEqual(['brew', 'upgrade', 'mux-sesh'])

      Bun.spawn = originalSpawn
    })

    test('should return false on non-zero exit code', async () => {
      const originalSpawn = Bun.spawn
      const mockProcess = {
        exited: Promise.resolve(),
        exitCode: 1,
      } as unknown as Subprocess

      Bun.spawn = mock(() => mockProcess) as typeof Bun.spawn

      const success = await performUpgrade('npm', '1.2.0')
      expect(success).toBe(false)

      Bun.spawn = originalSpawn
    })

    test('should return false on spawn error', async () => {
      const originalSpawn = Bun.spawn
      const originalConsoleError = console.error
      console.error = mock(() => {})
      Bun.spawn = mock(() => {
        throw new Error('Spawn error')
      }) as typeof Bun.spawn

      const success = await performUpgrade('npm', '1.2.0')
      expect(success).toBe(false)

      Bun.spawn = originalSpawn
      console.error = originalConsoleError
    })
  })
})
