import { describe, expect, test } from 'bun:test'
import { buildClipboardSequence, writeClipboard } from '../src/diagnostics/clipboard'

function terminal(isTTY: boolean, fail = false) {
  const written: string[] = []

  return {
    written,
    output: {
      isTTY,
      write: (chunk: string) => {
        if (fail) throw new Error('fixture write failure')
        written.push(chunk)

        return true
      },
    },
  }
}

describe('OSC 52 clipboard', () => {
  test('writes a direct OSC 52 sequence', () => {
    expect(buildClipboardSequence('crash', {})).toBe('\u001b]52;c;Y3Jhc2g=\u0007')
  })

  test('wraps OSC 52 for tmux passthrough', () => {
    const sequence = buildClipboardSequence('crash', { TMUX: '/tmp/tmux' })
    expect(sequence).toStartWith('\u001bPtmux;\u001b\u001b]52;c;')
    expect(sequence).toEndWith('\u0007\u001b\\')
  })

  test('an OSC 52 write is reported as unconfirmed, never as copied', () => {
    const fixture = terminal(true)

    expect(writeClipboard('crash', fixture.output, {})).toEqual({ kind: 'sent-unconfirmed' })
    expect(fixture.written).toEqual(['\u001b]52;c;Y3Jhc2g=\u0007'])
  })

  test('no terminal, empty text, or a failed write is reported as unavailable', () => {
    const notTerminal = terminal(false)
    const failing = terminal(true, true)

    expect(writeClipboard('crash', notTerminal.output, {})).toEqual({ kind: 'unavailable' })
    expect(writeClipboard('', terminal(true).output, {})).toEqual({ kind: 'unavailable' })
    expect(writeClipboard('crash', failing.output, {})).toEqual({ kind: 'unavailable' })
    expect(notTerminal.written).toEqual([])
  })
})
