import { describe, expect, test } from 'bun:test'
import { PrefixKey } from '../src/config/prefix-key'
import { matchesPrefixKey } from '../src/app/keyboard/shared'

describe('PrefixKey.parse', () => {
  test.each([
    ['ctrl+a', 'ctrl+a'],
    [' Ctrl+A ', 'ctrl+a'],
    ['shift+ctrl+b', 'ctrl+shift+b'],
    ['ctrl+space', 'ctrl+space'],
    ['space', 'space'],
    [',', ','],
    [';', ';'],
    ['f5', 'f5'],
    ['ctrl+tab', 'ctrl+tab'],
    ['ctrl+1', 'ctrl+1'],
  ])('%j is the key %j', (text, key) => {
    expect(PrefixKey.parse(text)).toEqual({ kind: 'parsed', key })
  })

  test.each([
    ['', 'Type a key, such as ctrl+a'],
    ['ctrl+', '"ctrl+" names no key; end it with one, such as ctrl+a'],
    ['alt+x', '"alt" is not a modifier mux-sesh reads; use ctrl or shift'],
    ['ctrl+ctrl+a', '"ctrl" is written twice'],
    ['ctrl+enter', '"enter" is not a key here; use one character, space, tab or f1–f12'],
    ['j', 'j alone would type into search; add ctrl, such as ctrl+j'],
    ['shift+7', 'shift+7 alone would type into search; add ctrl, such as ctrl+7'],
  ])('%j is refused: %s', (text, reason) => {
    expect(PrefixKey.parse(text)).toEqual({ kind: 'invalid', reason })
  })

  test('every key it accepts is the key the keyboard matches', () => {
    for (const [text, input] of [
      ['ctrl+a', { name: 'a', ctrl: true }],
      ['ctrl+shift+b', { name: 'b', ctrl: true, shift: true }],
      ['space', { name: 'space' }],
      [',', { name: ',' }],
      ['f5', { name: 'f5' }],
    ] as const) {
      const parsed = PrefixKey.parse(text)

      expect(parsed.kind === 'parsed' && matchesPrefixKey(input, parsed.key)).toBe(true)
    }
  })
})
