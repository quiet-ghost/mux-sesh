import { describe, expect, test } from 'bun:test'
import { workspaceToItem } from '../src/multiplexer/items'
import type { LiveWorkspace, WorkspaceRef } from '../src/multiplexer/types'
import { CleanupPlan, type ClosureRef } from '../src/sessions/cleanup-plan'
import type { Item } from '../src/types'

function herdr(extra: Partial<LiveWorkspace> = {}): Item {
  return workspaceToItem({
    backend: 'herdr',
    id: 'w1',
    title: 'api',
    path: '/work/api',
    isActive: false,
    unitCount: 3,
    ...extra,
  })
}

const pane: Item = workspaceToItem({
  backend: 'herdr',
  id: 'w1',
  title: 'opencode-api',
  path: '/work/api',
  isActive: false,
  unitCount: 1,
  agentStatus: 'working',
  target: { kind: 'agent', tabId: 'w1:t2', paneId: 'w1:p4' },
})

function planOf(item: Item, inventory: Item[] = [item], revision = 1): CleanupPlan {
  const review = CleanupPlan.review(item, inventory, revision)

  if (review.kind === 'refused') throw new Error(review.reason)

  return review.plan
}

describe('CleanupPlan.review', () => {
  test('captures the exact whole-workspace ref, scope and revision', () => {
    const plan = planOf(herdr(), [herdr()], 4)

    expect(plan).toEqual({
      key: 'herdr:w1',
      ref: { backend: 'herdr', id: 'w1', title: 'api' },
      path: '/work/api',
      units: 3,
      warnings: [],
      revision: 4,
    })
    expect(CleanupPlan.title(plan)).toBe("Close Herdr workspace 'api'?")
    expect(CleanupPlan.scope(plan)).toBe('Closes 3 tabs and their panes')
  })

  test.each(['idle', 'done', 'unknown'] as const)(
    'a detached, unfocused %s target carries no warnings',
    agentStatus => {
      expect(planOf(herdr({ agentStatus })).warnings).toEqual([])
    }
  )

  test('warns about attached, pinned, and agents working inside the workspace', () => {
    const workspace = { ...herdr({ isActive: true }), isPinned: true }
    const plan = planOf(workspace, [workspace, pane])

    expect(plan.warnings.map(CleanupPlan.describeWarning)).toEqual([
      'Attached: a client is using it now',
      'Pinned: you marked it to keep',
      "Agent working in 'opencode-api'",
    ])
  })

  test('an agent pane is refused rather than widened to its workspace', () => {
    expect(CleanupPlan.review(pane, [pane], 1)).toEqual({
      kind: 'refused',
      reason:
        "'opencode-api' is an agent pane; mux-sesh closes only whole workspaces. Nothing was closed. Close the pane in Herdr.",
    })
  })

  test('a ref carrying an agent pane target is not a closure ref', () => {
    const paneRef: WorkspaceRef = {
      backend: 'herdr',
      id: 'w1',
      title: 'opencode-api',
      target: { kind: 'agent', tabId: 'w1:t2', paneId: 'w1:p4' },
    }

    // @ts-expect-error An agent pane ref cannot be closed as a whole workspace.
    const widened: ClosureRef = paneRef

    expect(widened.id).toBe('w1')
  })
})

describe('CleanupPlan.recheck', () => {
  test('an unchanged target confirms the stored plan even after a refresh', () => {
    const plan = planOf(herdr())

    expect(CleanupPlan.recheck(plan, [herdr({ title: 'other', id: 'w2' }), herdr()], 9)).toEqual({
      kind: 'confirmed',
      plan,
    })
  })

  test('a new warning stops the close', () => {
    const plan = planOf(herdr(), [herdr()])
    const check = CleanupPlan.recheck(plan, [herdr(), pane], 2)

    expect(check).toEqual({
      kind: 'changed',
      message:
        "Did not close workspace 'api': it changed since you reviewed it (new warning: Agent working in 'opencode-api'). Nothing was closed. Press d to review it again.",
    })
  })

  test('a vanished target says so and closes nothing else', () => {
    const check = CleanupPlan.recheck(planOf(herdr()), [herdr({ id: 'w2', title: 'web' })], 2)

    expect(check).toEqual({
      kind: 'changed',
      message:
        "Did not close workspace 'api': 'api' is no longer listed. The list was refreshed after you reviewed it. Nothing was closed.",
    })
  })
})
