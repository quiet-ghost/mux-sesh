import { describe, expect, test } from 'bun:test'
import {
  formatPanePreview,
  formatWindowCommand,
  sanitizeTmuxSessionName,
} from '../src/tmux/helpers'

describe('tmux helpers', () => {
  test('formats pane previews by stripping ansi and trimming empty lines', () => {
    expect(formatPanePreview('\u001b[31mhello\u001b[0m\n\nworld\r\n')).toEqual(['hello', 'world'])
  })

  test('sanitizes tmux session names without changing slashes', () => {
    expect(sanitizeTmuxSessionName('my.session name')).toBe('my_session_name')
  })

  test('hides shell commands in window labels', () => {
    expect(formatWindowCommand('zsh')).toBe('')
    expect(formatWindowCommand('nvim')).toBe('nvim')
  })
})
