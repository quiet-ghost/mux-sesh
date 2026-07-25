import { describe, expect, test } from 'bun:test'
import { buildClipboardSequence } from '../src/util/clipboard'

describe('OSC 52 clipboard', () => {
  test('writes a direct OSC 52 sequence', () => {
    expect(buildClipboardSequence('crash', {})).toBe('\u001b]52;c;Y3Jhc2g=\u0007')
  })

  test('wraps OSC 52 for tmux passthrough', () => {
    const sequence = buildClipboardSequence('crash', { TMUX: '/tmp/tmux' })
    expect(sequence).toStartWith('\u001bPtmux;\u001b\u001b]52;c;')
    expect(sequence).toEndWith('\u0007\u001b\\')
  })
})
