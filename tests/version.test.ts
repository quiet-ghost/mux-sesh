import { test, expect, describe, mock } from 'bun:test'
import { isNewerVersion, getLatestVersion, CURRENT_VERSION } from '../src/update/version'

describe('version', () => {
  describe('CURRENT_VERSION', () => {
    test('should match package.json version', () => {
      expect(CURRENT_VERSION).toBeDefined()
      expect(typeof CURRENT_VERSION).toBe('string')
      expect(CURRENT_VERSION).toMatch(/^\d+\.\d+\.\d+/)
    })
  })

  describe('isNewerVersion', () => {
    test('should return true when latest is newer (major)', () => {
      expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true)
    })

    test('should return true when latest is newer (minor)', () => {
      expect(isNewerVersion('1.0.0', '1.1.0')).toBe(true)
    })

    test('should return true when latest is newer (patch)', () => {
      expect(isNewerVersion('1.0.0', '1.0.1')).toBe(true)
    })

    test('should return false when versions are equal', () => {
      expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    })

    test('should return false when latest is older (major)', () => {
      expect(isNewerVersion('2.0.0', '1.0.0')).toBe(false)
    })

    test('should return false when latest is older (minor)', () => {
      expect(isNewerVersion('1.1.0', '1.0.0')).toBe(false)
    })

    test('should return false when latest is older (patch)', () => {
      expect(isNewerVersion('1.0.1', '1.0.0')).toBe(false)
    })

    test('should handle different version lengths', () => {
      expect(isNewerVersion('1.0', '1.0.1')).toBe(true)
      expect(isNewerVersion('1.0.0', '1.0')).toBe(false)
    })

    test('should handle multi-digit version numbers', () => {
      expect(isNewerVersion('1.9.0', '1.10.0')).toBe(true)
      expect(isNewerVersion('1.99.0', '1.100.0')).toBe(true)
    })

    test('should handle complex version comparisons', () => {
      expect(isNewerVersion('1.2.3', '1.2.4')).toBe(true)
      expect(isNewerVersion('1.2.3', '1.3.0')).toBe(true)
      expect(isNewerVersion('1.2.3', '2.0.0')).toBe(true)
      expect(isNewerVersion('2.0.0', '1.9.9')).toBe(false)
    })
  })

  describe('getLatestVersion', () => {
    test('should fetch latest version from npm registry', async () => {
      const version = await getLatestVersion()
      expect(version).toBeDefined()
      if (version) {
        expect(typeof version).toBe('string')
        expect(version).toMatch(/^\d+\.\d+\.\d+/)
      }
    })

    test('should return null on fetch error', async () => {
      // Mock fetch to simulate network error
      const originalFetch = global.fetch
      const originalConsoleError = console.error
      console.error = mock(() => {})
      global.fetch = (async () => {
        throw new Error('Network error')
      }) as unknown as typeof fetch

      const version = await getLatestVersion()
      expect(version).toBe(null)

      // Restore original fetch
      global.fetch = originalFetch
      console.error = originalConsoleError
    })

    test('should return null on non-ok response', async () => {
      // Mock fetch to return error status
      const originalFetch = global.fetch
      const originalConsoleError = console.error
      console.error = mock(() => {})
      global.fetch = (async () =>
        ({
          ok: false,
          status: 404,
        }) as Response) as unknown as typeof fetch

      const version = await getLatestVersion()
      expect(version).toBe(null)

      // Restore original fetch
      global.fetch = originalFetch
      console.error = originalConsoleError
    })
  })
})
