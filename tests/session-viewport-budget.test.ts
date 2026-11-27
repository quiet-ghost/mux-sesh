import { describe, expect, test } from 'bun:test'
import type { Item } from '../src/types'
import { fitListRow, getSessionViewport } from '../src/ui/session-viewport'
import { getStatusRows, type StatusLine } from '../src/ui/status-line'

function session(index: number, isPinned = false): Item {
  return {
    title: `session-${index}`,
    desc: '',
    path: `/fixture/${index}`,
    isSession: true,
    itemKind: index % 4 === 3 ? 'configured' : 'tmux',
    isPinned,
  }
}

function sessions(count: number, pinned: number): Item[] {
  const items = Array.from({ length: count }, (_, index) => session(index, index < pinned))

  return [
    ...items.filter(item => item.isPinned),
    ...items.filter(item => !item.isPinned && item.itemKind !== 'configured'),
    ...items.filter(item => !item.isPinned && item.itemKind === 'configured'),
  ]
}

function sectionOf(item: Item): string {
  return item.isPinned ? 'pinned' : (item.itemKind ?? 'item')
}

function renderedSessionRows(items: Item[]): number {
  if (items.length === 0) return 1

  return items.reduce((rows, item, index) => {
    const previous = items[index - 1]

    if (!previous) return rows + 2

    return rows + (sectionOf(previous) === sectionOf(item) ? 1 : 3)
  }, 0)
}

describe('session viewport row budget', () => {
  test('never exceeds the rows and keeps both selections visible', () => {
    for (let rows = 6; rows <= 40; rows++) {
      for (const [count, pinned] of [
        [0, 0],
        [1, 0],
        [12, 2],
        [40, 5],
      ]) {
        for (let agentCount = 0; agentCount <= 6; agentCount += 3) {
          for (const agentsActive of [false, true]) {
            const sessionItems = sessions(count, pinned)
            const agents = Array.from({ length: agentCount }, (_, index) => session(100 + index))
            const cursor = Math.max(0, count - 1)
            const agentCursor = Math.max(0, agentCount - 1)

            const viewport = getSessionViewport({
              rows,
              sessions: sessionItems,
              agents,
              cursor,
              agentCursor,
              agentsActive,
            })

            const agentRows =
              viewport.agents.kind === 'shown'
                ? 2 + Math.max(1, viewport.agents.window.items.length)
                : 0

            expect(renderedSessionRows(viewport.sessions.items) + agentRows).toBeLessThanOrEqual(
              rows
            )

            if (count > 0) {
              expect(viewport.sessions.items).toContain(sessionItems[cursor])
            }

            if (agentCount > 0 && viewport.agents.kind === 'shown') {
              expect(viewport.agents.window.items).toContain(agents[agentCursor])
            }

            expect(viewport.agents.kind).toBe(agentCount > 0 || agentsActive ? 'shown' : 'hidden')
          }
        }
      }
    }
  })

  test('gives the active Agents section the larger share', () => {
    const input = {
      rows: 20,
      sessions: sessions(30, 0),
      agents: Array.from({ length: 30 }, (_, index) => session(100 + index)),
      cursor: 0,
      agentCursor: 0,
    }

    const inactive = getSessionViewport({ ...input, agentsActive: false })
    const active = getSessionViewport({ ...input, agentsActive: true })

    if (inactive.agents.kind !== 'shown' || active.agents.kind !== 'shown') {
      throw new Error('Agents section should be shown when agents exist')
    }

    expect(active.agents.window.items.length).toBeGreaterThan(inactive.agents.window.items.length)
    expect(active.sessions.items.length).toBeLessThan(inactive.sessions.items.length)
  })
})

describe('list row text', () => {
  test('keeps short rows and truncates long titles at the end and contexts in the middle', () => {
    expect(fitListRow('alpha', 'projects', 40, 10)).toEqual({
      title: 'alpha',
      spacer: '       ',
      context: 'projects',
    })
    expect(fitListRow('a-very-long-session-title', '', 10, 0).title).toBe('a-very-lo…')

    const row = fitListRow('a-very-long-session-title', 'a-long-context-path', 20, 25)
    expect(row.title).toBe('a-very-long…')
    expect(row.context).toBe('a-l…th')
    expect(row.title.length + row.spacer.length + row.context.length).toBe(20)
  })

  test('counts the rows the status line adds to the footer', () => {
    const stale: StatusLine = {
      kind: 'stale',
      text: 'fixture server stopped. Existing sessions are unchanged.',
    }

    expect(getStatusRows(undefined, 0, [], 60, 'v1.0.0')).toBe(0)
    expect(
      getStatusRows({ id: 1, kind: 'success', message: 'Refreshed' }, 0, [], 60, 'v1.0.0')
    ).toBe(0)
    // 21 message columns wrap it into four rows; the third ends in an ellipsis instead.
    expect(getStatusRows(undefined, 0, [stale], 30, 'v1.0.0')).toBe(3)
    // 34 columns beside `any key  v1.0.0`, then 51 per row: 100 characters take three rows.
    expect(
      getStatusRows({ id: 1, kind: 'error', message: 'x'.repeat(100) }, 0, [], 60, 'v1.0.0')
    ).toBe(2)
  })
})
