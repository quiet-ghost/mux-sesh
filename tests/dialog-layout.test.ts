import { describe, expect, test } from 'bun:test'
import {
  fitDialogRow,
  fitsOptionalDialogRows,
  getDialogChromeRows,
  getDialogListRows,
  getDialogTitleWidth,
  getDialogWidth,
  truncateDialogText,
} from '../src/ui/dialog-layout'
import { getSelectionIndex } from '../src/ui/use-item-selection'

describe('dialog layout', () => {
  test('clamps the dialog width to the terminal without a fixed minimum', () => {
    expect(getDialogWidth(120, 68)).toBe(68)
    expect(getDialogWidth(60, 68)).toBe(56)
    expect(getDialogWidth(40, 68)).toBe(36)
    expect(getDialogWidth(3, 68)).toBe(1)
  })

  test('budgets both borders, the footer rule and the footer as chrome rows', () => {
    expect(getDialogChromeRows({})).toBe(4)
    expect(getDialogChromeRows({ description: 'catppuccin' })).toBe(5)
  })

  test('fits the title between `┌─ ` and ` ─┐` in the top border', () => {
    expect(getDialogTitleWidth(56)).toBe(50)
    expect(getDialogTitleWidth(4)).toBe(1)
  })

  test('keeps at least one list row in tiny terminals', () => {
    expect(getDialogListRows(18, 10)).toBe(6)
    expect(getDialogListRows(8, 10)).toBe(1)
  })

  test('shows optional rows only when the list keeps a usable height', () => {
    expect(fitsOptionalDialogRows(24, 10, 3)).toBe(true)
    expect(fitsOptionalDialogRows(18, 10, 3)).toBe(false)
  })

  test('truncates text and row values to the available width', () => {
    expect(truncateDialogText('Commands', 20)).toBe('Commands')
    expect(truncateDialogText('Commands', 5)).toBe('Comm…')
    expect(truncateDialogText('Commands', 0)).toBe('')
    expect(fitDialogRow('Editor', 'nvim -c "lua"', 14)).toEqual({
      label: 'Editor',
      value: 'nvim …',
    })
    expect(fitDialogRow('Editor Command', 'nvim', 14)).toEqual({
      label: 'Editor Command',
      value: '',
    })
  })

  test('re-selects a remembered key or falls back to the first item', () => {
    expect(getSelectionIndex(['a', 'b', 'c'], 'c')).toBe(2)
    expect(getSelectionIndex(['a', 'b'], 'c')).toBe(0)
    expect(getSelectionIndex([], undefined)).toBe(0)
  })
})
