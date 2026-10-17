import { describe, expect, test } from 'bun:test'
import { isAgentSessionItem, isAgentSessionName } from '../src/agents/session-name'

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

test('Herdr workspaces use native status for agent grouping', () => {
  expect(
    isAgentSessionItem({
      isSession: true,
      title: 'api',
      itemKind: 'herdr',
      agentStatus: 'working',
    })
  ).toBe(true)
  expect(
    isAgentSessionItem({
      isSession: true,
      title: 'api',
      itemKind: 'herdr',
      agentStatus: 'unknown',
    })
  ).toBe(false)
  expect(
    isAgentSessionItem({
      isSession: true,
      title: 'unknown-agent',
      itemKind: 'herdr',
      agentStatus: 'unknown',
      target: { kind: 'agent', tabId: 'agents:t1', paneId: 'agents:p1' },
    })
  ).toBe(true)
})
