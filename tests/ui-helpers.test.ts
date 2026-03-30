import { describe, expect, test } from 'bun:test'
import { formatPreviewOutput, interpolatePreviewCommand } from '../src/preview/project'
import { getVisibleWindow } from '../src/ui/list-window'

describe('project preview helpers', () => {
  test('interpolates preview command placeholders with the project path', () => {
    expect(interpolatePreviewCommand('eza --all {}', '/tmp/project')).toBe('eza --all /tmp/project')
    expect(interpolatePreviewCommand(undefined, '/tmp/project')).toBeUndefined()
  })

  test('strips ansi escape codes and truncates long preview output', () => {
    const formatted = formatPreviewOutput(`\u001b[31mhello\u001b[0m\n${'x'.repeat(130)}\nthird`, 2)

    expect(formatted.truncated).toBe(true)
    expect(formatted.lines[0]).toBe('hello')
    expect(formatted.lines[1]?.endsWith('…')).toBe(true)
  })
})

describe('list windowing', () => {
  test('keeps the cursor centered when possible', () => {
    const result = getVisibleWindow(['a', 'b', 'c', 'd', 'e', 'f'], 3, 3)

    expect(result).toEqual({
      items: ['c', 'd', 'e'],
      startIndex: 2,
    })
  })

  test('clamps the visible window near the list start and end', () => {
    expect(getVisibleWindow(['a', 'b', 'c'], 0, 2)).toEqual({
      items: ['a', 'b'],
      startIndex: 0,
    })

    expect(getVisibleWindow(['a', 'b', 'c', 'd'], 3, 2)).toEqual({
      items: ['c', 'd'],
      startIndex: 2,
    })
  })
})
