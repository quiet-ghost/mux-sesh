import { describe, expect, test } from 'bun:test'
import { getConfigDir, getConfigPath } from '../src/config'

describe('config paths', () => {
  test('prefers XDG config home when present', () => {
    process.env.XDG_CONFIG_HOME = '/tmp/xdg-config'

    expect(getConfigDir('/home/tester')).toBe('/tmp/xdg-config')
    expect(getConfigPath('/home/tester')).toBe('/tmp/xdg-config/mux-sesh/config.json')
  })

  test('falls back to home config directory', () => {
    delete process.env.XDG_CONFIG_HOME

    expect(getConfigDir('/home/tester')).toBe('/home/tester/.config')
    expect(getConfigPath('/home/tester')).toBe('/home/tester/.config/mux-sesh/config.json')
  })
})
