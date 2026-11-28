import { describe, expect, test } from 'bun:test'
import { handleCloseBatch } from '../src/app/session-actions'
import { CommandInterrupted } from '../src/multiplexer/command'
import { workspaceToItem } from '../src/multiplexer/items'
import type { LiveWorkspace, MultiplexerBackend, WorkspaceRef } from '../src/multiplexer/types'
import { CleanupBatch, CloseReceipt } from '../src/sessions/cleanup-batch'
import type { Item } from '../src/types'

function tmux(id: string, title: string, extra: Partial<LiveWorkspace> = {}): Item {
  return workspaceToItem({
    backend: 'tmux',
    id,
    title,
    path: `/work/${title}`,
    isActive: false,
    unitCount: 1,
    ...extra,
  })
}

const api = tmux('$1', 'api')
const web = tmux('$2', 'web')
const docs = tmux('$3', 'docs')

const project: Item = {
  title: 'api',
  desc: '/work/api',
  path: '/work/api',
  isSession: false,
  itemKind: 'project',
  linkedSessionName: 'api',
}

const noHost = { kind: 'known', id: undefined } as const

function batchOf(marked: Item[], inventory: Item[]): CleanupBatch {
  const review = CleanupBatch.review(marked, inventory, 1, noHost)

  if (review.kind === 'refused') throw new Error(review.reason)

  return review.batch
}

function unsupported(): never {
  throw new Error('This batch backend only lists, closes and reports current')
}

function backendClosing(onClose: (target: WorkspaceRef) => void): MultiplexerBackend {
  return {
    kind: 'tmux',
    capabilities: { previousWorkspace: true },
    list: unsupported,
    details: unsupported,
    open: unsupported,
    async current() {
      return undefined
    },
    async close(target) {
      onClose(target)
    },
    openOrCreate: unsupported,
    create: unsupported,
    start: unsupported,
    rename: unsupported,
    directory: unsupported,
    openEditor: unsupported,
  }
}

describe('CleanupBatch.review', () => {
  test('refuses a project row that would imply closing its linked session', () => {
    const batch = batchOf([project, web], [api, web])

    expect(CleanupBatch.readyPlans(batch).map(plan => plan.ref.id)).toEqual(['$2'])
    expect(CleanupBatch.refusedMembers(batch)).toEqual([
      {
        key: 'project:api',
        title: 'api',
        reason:
          "it is a project, and closing it would also close its linked session 'api'. That session stays open; mark it to close it.",
      },
    ])
  })

  test('refuses the whole batch when nothing marked can be closed', () => {
    const review = CleanupBatch.review([project], [api], 1, noHost)

    expect(review.kind).toBe('refused')
  })

  test('refuses a marked session that is no longer listed', () => {
    const batch = batchOf([api, web], [web])

    expect(CleanupBatch.refusedMembers(batch).map(member => member.reason)).toEqual([
      'it is no longer listed.',
    ])
  })
})

describe('handleCloseBatch', () => {
  test('an interrupted close keeps finished work and leaves later targets unattempted', async () => {
    const closed: string[] = []

    const backend = backendClosing(target => {
      closed.push(target.id)

      if (target.id === '$2') throw new CommandInterrupted({ executable: 'tmux' })
    })

    const outcome = await handleCloseBatch(batchOf([api, web, docs], [api, web, docs]), backend, {
      sessionItems: [api, web, docs],
      revision: 1,
      // The list could not be read again, so the unfinished close stays unknown.
      reloadSessions: async () => undefined,
    })

    if (outcome.kind !== 'receipt') throw new Error(`Expected a receipt, got ${outcome.kind}`)

    expect(closed).toEqual(['$1', '$2'])
    expect(outcome.receipt.results.map(result => result.kind)).toEqual([
      'closed',
      'unknown',
      'unattempted',
    ])
    expect(CloseReceipt.retryable(outcome.receipt).map(plan => plan.ref.id)).toEqual(['$2', '$3'])
  })
})

describe('CloseReceipt.reconcile', () => {
  test('a gone target is settled and never retried; a listed failure stays retryable', async () => {
    const backend = backendClosing(target => {
      throw new CommandInterrupted({ executable: target.id })
    })

    const outcome = await handleCloseBatch(batchOf([api], [api]), backend, {
      sessionItems: [api],
      revision: 1,
      reloadSessions: async () => [api],
    })

    if (outcome.kind !== 'receipt') throw new Error(`Expected a receipt, got ${outcome.kind}`)

    expect(CloseReceipt.retryable(outcome.receipt)).toHaveLength(1)

    const settled = CloseReceipt.reconcile(outcome.receipt, [])
    expect(settled.results.map(result => result.kind)).toEqual(['closed'])
    expect(CloseReceipt.retryable(settled)).toEqual([])
  })
})
