import { describe, expect, test } from 'bun:test'
import { KeyHint } from '../src/ui/key-hints'

const HINTS: KeyHint[] = [
  { label: 'navigate', key: '↑/↓' },
  { label: 'run', key: 'enter' },
  { label: 'close', key: 'esc' },
]

describe('key hints', () => {
  test('reads label then key, two spaces apart', () => {
    expect(KeyHint.text(HINTS)).toBe('navigate ↑/↓  run enter  close esc')
  })

  test('keeps whole hints that fit and drops the rest from the end', () => {
    expect(KeyHint.fit(HINTS, 34)).toEqual(HINTS)
    expect(KeyHint.fit(HINTS, 33)).toEqual(HINTS.slice(0, 2))
    expect(KeyHint.fit(HINTS, 23)).toEqual(HINTS.slice(0, 2))
    expect(KeyHint.fit(HINTS, 22)).toEqual(HINTS.slice(0, 1))
    expect(KeyHint.fit(HINTS, 12)).toEqual(HINTS.slice(0, 1))
    expect(KeyHint.fit(HINTS, 11)).toEqual([])
  })
})
