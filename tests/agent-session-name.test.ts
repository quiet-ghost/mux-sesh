import { describe, expect, test } from 'bun:test'
import { isAgentSessionItem, isAgentSessionName } from '../src/agents/session-name'
import { isOpencodeSessionItem, isOpencodeSessionName } from '../src/opencode/session-name'

describe('agent session names', () => {
  test.each([
    ['opencode-main', true],
    ['opencode-', true],
    ['pi-main', true],
    ['codex-work', true],
    ['claude-review', true],
    ['tui_chat', true],
    ['opencode', false],
    ['my-opencode-main', false],
    ['OpenCode-main', false],
    ['dev', false],
    ['pi', false],
  ])('classifies %s as agent=%s', (name, expected) => {
    expect(isAgentSessionName(name)).toBe(expected)
  })

  test('requires live session items for agent grouping', () => {
    expect(isAgentSessionItem({ title: 'pi-main', isSession: true })).toBe(true)
    expect(isAgentSessionItem({ title: 'pi-main', isSession: false })).toBe(false)
  })
})

test('Herdr workspaces use native agent status instead of tmux name grouping', () => {
  expect(isAgentSessionItem({ isSession: true, title: 'opencode-api', itemKind: 'herdr' })).toBe(
    false
  )
})

describe('opencode session names', () => {
  test.each([
    ['opencode-main', true],
    ['opencode-', true],
    ['pi-main', false],
    ['codex-work', false],
    ['claude-review', false],
    ['tui_chat', false],
    ['opencode', false],
  ])('classifies %s as opencode=%s', (name, expected) => {
    expect(isOpencodeSessionName(name)).toBe(expected)
  })

  test('keeps opencode stats matcher narrower than agents', () => {
    expect(isOpencodeSessionItem({ title: 'opencode-main', isSession: true })).toBe(true)
    expect(isOpencodeSessionItem({ title: 'pi-main', isSession: true })).toBe(false)
    expect(isOpencodeSessionItem({ title: 'tui_chat', isSession: true })).toBe(false)
  })
})
