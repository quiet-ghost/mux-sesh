import { expect, test } from 'bun:test'
import { getSessionMeta } from '../src/ui/session-meta'

test('Herdr metadata shows agent state but hides unknown age', () => {
  expect(
    getSessionMeta({
      title: 'agent',
      desc: '',
      path: '/repo',
      isSession: true,
      itemKind: 'herdr',
      agentStatus: 'working',
    })
  ).toBe('working')
  expect(
    getSessionMeta({
      title: 'plain',
      desc: '',
      path: '/repo',
      isSession: true,
      itemKind: 'herdr',
      agentStatus: 'unknown',
    })
  ).toBe('')
})
