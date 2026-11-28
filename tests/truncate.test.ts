import { describe, expect, test } from 'bun:test'
import { fitPath } from '../src/util/path-display'
import { displayWidth, truncateMiddle, truncatePathInText } from '../src/util/truncate'

const ELLIPSIS = '…'

// Seeded so a failure names an input that reproduces; no property-testing dependency.
function seeded(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHABET = ['a', 'Z', '/', '-', '.', '~', ' ', '漢', '字', '😀', 'é', 'é', '👩‍💻', '𝒳']

function randomText(next: () => number): string {
  const length = Math.floor(next() * 40)

  return Array.from({ length }, () => ALPHABET[Math.floor(next() * ALPHABET.length)] ?? 'a').join(
    ''
  )
}

function hasLoneSurrogate(text: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)
}

describe('truncateMiddle', () => {
  test('keeps text that fits', () => {
    expect(truncateMiddle('~/dev/mux-sesh', 14)).toBe('~/dev/mux-sesh')
    expect(truncateMiddle('', 0)).toBe('')
  })

  test('keeps the start and end of a long path', () => {
    expect(truncateMiddle('~/dev/worktrees/projects/mux-sesh', 20)).toBe('~/dev/work…/mux-sesh')
    expect(truncateMiddle('abcdef', 4)).toBe('ab…f')
    expect(truncateMiddle('abcdef', 2)).toBe('a…')
    expect(truncateMiddle('abcdef', 1)).toBe(ELLIPSIS)
    expect(truncateMiddle('abcdef', 0)).toBe('')
  })

  test('counts wide characters as two cells', () => {
    const text = '漢字漢字漢字漢字'

    expect(displayWidth(text)).toBe(16)
    expect(truncateMiddle(text, 7)).toBe('漢…漢字')
    expect(displayWidth(truncateMiddle(text, 6))).toBeLessThanOrEqual(6)
  })

  test('never splits a surrogate pair or a combining sequence', () => {
    expect(truncateMiddle('😀😀😀😀😀😀', 5)).toBe('😀…😀')
    expect(truncateMiddle('ééééé', 3)).toBe('é…é')
  })

  test('holds its properties on generated text', () => {
    const next = seeded(617)

    for (let run = 0; run < 2000; run++) {
      const text = randomText(next)
      const width = Math.floor(next() * 45)
      const result = truncateMiddle(text, width)
      const label = JSON.stringify({ text, width, result })

      expect(displayWidth(result), label).toBeLessThanOrEqual(width)
      expect(hasLoneSurrogate(result), label).toBe(false)

      if (displayWidth(text) <= width) {
        expect(result, label).toBe(text)
        continue
      }

      if (width === 0) continue

      const at = result.indexOf(ELLIPSIS)
      expect(at, label).toBeGreaterThanOrEqual(0)
      expect(text.startsWith(result.slice(0, at)), label).toBe(true)
      expect(text.endsWith(result.slice(at + ELLIPSIS.length)), label).toBe(true)
    }
  })
})

describe('fitPath', () => {
  test('collapses the home directory and truncates the middle', () => {
    const home = process.env.HOME ?? ''

    expect(fitPath(`${home}/dev/worktrees/projects/mux-sesh`, 20)).toBe('~/dev/work…/mux-sesh')
    expect(fitPath(`${home}/dev`, 20)).toBe('~/dev')
    expect(fitPath('/srv/a/very/long/absolute/path/to/repo', 16)).toBe('/srv/a/v…to/repo')
  })
})

describe('truncatePathInText', () => {
  const path = '~/dev/worktrees/projects/mux-sesh'

  test('shrinks only the path while the words around it fit', () => {
    expect(truncatePathInText(`'api'  ${path}  2 windows`, path, 40)).toBe(
      "'api'  ~/dev/workt…s/mux-sesh  2 windows"
    )
  })

  test('cuts the words after the path once the path is at its minimum', () => {
    const text = `Create in ${path}, then run: a-very-long-startup-command --with flags`
    const fitted = truncatePathInText(text, path, 40)

    expect(fitted).toBe('Create in ~/dev/wo…ux-sesh, then run: a…')
    expect(displayWidth(fitted)).toBe(40)
  })

  test('falls back to cutting the end when the path is not in the text', () => {
    expect(truncatePathInText('no path named here at all', path, 10)).toBe('no path n…')
  })
})
