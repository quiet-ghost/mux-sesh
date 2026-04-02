import { describe, expect, test } from 'bun:test'
import { getDefaultConfig } from '../src/config'
import {
  buildEditorCommand,
  getNextSessionName,
  quoteShellArg,
  requireConfig,
  requireConfiguredItem,
} from '../src/handlers/action-helpers'

describe('action helpers', () => {
  test('quotes shell arguments safely for editor launch commands', () => {
    expect(quoteShellArg("/tmp/it's-here")).toBe("'/tmp/it'\\''s-here'")
    expect(buildEditorCommand('nvim', "/tmp/it's-here")).toBe("nvim '/tmp/it'\\''s-here'")
  })

  test('normalizes rename targets and skips empty or unchanged names', () => {
    expect(getNextSessionName('alpha', ' beta ')).toBe('beta')
    expect(getNextSessionName('alpha', 'alpha')).toBeNull()
    expect(getNextSessionName('alpha', '   ')).toBeNull()
  })

  test('requires loaded config and configured items', () => {
    const config = getDefaultConfig('/home/tester')
    expect(requireConfig(config)).toBe(config)
    expect(() => requireConfig(null)).toThrow('Config is not loaded yet')

    const item = {
      title: 'repo',
      desc: '',
      path: '/tmp/repo',
      isSession: false,
      itemKind: 'configured' as const,
    }
    expect(requireConfiguredItem(item)).toBe(item)
    expect(() => requireConfiguredItem(undefined)).toThrow(
      'Select a configured session to edit its target'
    )
  })
})
