import { afterEach, describe, expect, test } from 'bun:test'
import { TextAttributes } from '@opentui/core'
import { testRender } from '@opentui/react/test-utils'
import HighlightedText from '../src/ui/HighlightedText'
import { fitListRowWithMatches } from '../src/ui/session-viewport'
import { fitDialogLabelMatches } from '../src/ui/dialog-layout'
import { truncateMiddleCut } from '../src/util/truncate'

let setup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
})

describe('match positions survive truncation', () => {
  test('a middle cut keeps head and tail positions and drops the elided ones', () => {
    const cut = truncateMiddleCut('abcdefghijklmnopqrst', 9)

    expect(cut.text).toBe('abcd…qrst')
    expect(cut.head).toBe(4)
    expect(cut.tailStart).toBe(16)
  })

  test('an uncut context keeps every position', () => {
    const row = fitListRowWithMatches('alpha', 'projects', 40, 10, { descIndices: [0, 7] })

    expect(row.context).toBe('projects')
    expect(row.contextMatches).toEqual([0, 7])
  })

  test('context positions are mapped through the middle ellipsis', () => {
    // 'a-long-context-path' fits as 'a-l…th': head 3 cells, tail from index 17.
    const row = fitListRowWithMatches('a-very-long-session-title', 'a-long-context-path', 20, 25, {
      titleIndices: [0, 10, 11, 24],
      descIndices: [0, 2, 9, 17, 18],
    })

    expect(row.context).toBe('a-l…th')
    expect(row.contextMatches).toEqual([0, 2, 4, 5])
    // 'a-very-long…': position 11 is under the ellipsis and 24 was cut.
    expect(row.title).toBe('a-very-long…')
    expect(row.titleMatches).toEqual([0, 10])
  })

  test('dialog labels drop positions cut at the end', () => {
    expect(fitDialogLabelMatches('Catppuccin Frappe', 'Catppuccin…', [0, 1, 10, 11])).toEqual([
      0, 1,
    ])
    expect(fitDialogLabelMatches('Nord', 'Nord', [0, 3])).toEqual([0, 3])
  })
})

describe('highlighted text', () => {
  test('marks runs of matched characters without splitting per character', async () => {
    setup = await testRender(
      <text>
        <HighlightedText
          text="mux-sesh-picker"
          matchIndices={[0, 1, 2, 9, 14]}
          color="#ffffff"
          highlightColor="#ff0000"
          highlightAttributes={TextAttributes.UNDERLINE}
        />
      </text>,
      { width: 20, height: 1, consoleMode: 'disabled' }
    )
    await setup.renderOnce()

    const spans = setup.captureSpans().lines[0]?.spans.filter(span => span.text.trim()) ?? []
    const marked = spans.filter(span => (span.attributes & TextAttributes.UNDERLINE) !== 0)

    expect(marked.map(span => span.text)).toEqual(['mux', 'p', 'r'])
    expect(spans.map(span => span.text).join('')).toBe('mux-sesh-picker')
  })
})
