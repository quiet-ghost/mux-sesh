import { describe, expect, test } from 'bun:test'
import { formatVersionBadge } from '../src/ui/VersionBadge'

describe('formatVersionBadge', () => {
  test('shows the running version by default', () => {
    expect(formatVersionBadge('1.5.0')).toBe('v1.5.0')
  })

  test('shows both versions when an updated version is pending restart', () => {
    expect(formatVersionBadge('1.5.0', '1.6.0')).toBe('v1.5.0 -> v1.6.0')
  })

  test('does not duplicate the version when no restart is pending', () => {
    expect(formatVersionBadge('1.5.0', '1.5.0')).toBe('v1.5.0')
  })

  test('shows dev instead of a version for bun run dev', () => {
    expect(formatVersionBadge('1.9.9', null, true)).toBe('dev')
    expect(formatVersionBadge('1.9.9', '1.10.0', true)).toBe('dev')
  })
})
