import { describe, expect, test } from 'bun:test'
import {
  PendingClose,
  type PendingCloseKeyState,
  type PendingCloseStep,
} from '../src/app/pending-close'
import type { CleanupPlan } from '../src/sessions/cleanup-plan'

const plan: CleanupPlan = {
  key: 'tmux:$2',
  ref: { backend: 'tmux', id: '$2', title: 'beta' },
  path: '/fixture/beta',
  units: 1,
  warnings: [],
  revision: 3,
}

const armed = PendingClose.arm(plan)

const onRow: PendingCloseKeyState = {
  targetKey: 'tmux:$2',
  prefixActive: false,
  prefixKeyPressed: false,
}

describe('a waiting close and the next key', () => {
  test('with nothing waiting, every key acts as usual', () => {
    expect(PendingClose.onKey(PendingClose.none, { name: 'd' }, onRow)).toEqual({ kind: 'pass' })
    expect(PendingClose.onKey(PendingClose.none, { name: 'escape' }, onRow)).toEqual({
      kind: 'pass',
    })
  })

  test('d confirms exactly the frozen plan, bare, after the prefix, or as ctrl+d', () => {
    const confirm: PendingCloseStep = { kind: 'confirm', plan }

    expect(PendingClose.onKey(armed, { name: 'd' }, onRow)).toEqual(confirm)
    expect(PendingClose.onKey(armed, { name: 'd' }, { ...onRow, prefixActive: true })).toEqual(
      confirm
    )
    expect(PendingClose.onKey(armed, { name: 'd', ctrl: true }, onRow)).toEqual(confirm)
  })

  test('esc only cancels, so it cannot also quit or clear the search', () => {
    expect(PendingClose.onKey(armed, { name: 'escape' }, onRow)).toEqual({ kind: 'cancel' })
  })

  test('any other key cancels and still acts', () => {
    for (const key of [
      { name: 'j' },
      { name: 'm' },
      { name: 'down' },
      { name: 'd', shift: true },
    ]) {
      expect(PendingClose.onKey(armed, key, onRow)).toEqual({ kind: 'cancel-and-pass' })
    }

    expect(PendingClose.onKey(armed, { name: 'd', meta: true }, onRow)).toEqual({
      kind: 'cancel-and-pass',
    })
  })

  test('the prefix key keeps it waiting for d; a second prefix cancels', () => {
    expect(PendingClose.onKey(armed, { name: 'x' }, { ...onRow, prefixKeyPressed: true })).toEqual({
      kind: 'pass',
    })
    expect(
      PendingClose.onKey(
        armed,
        { name: 'x' },
        { ...onRow, prefixKeyPressed: true, prefixActive: true }
      )
    ).toEqual({ kind: 'cancel-and-pass' })
    expect(PendingClose.onKey(armed, { name: 'r' }, { ...onRow, prefixActive: true })).toEqual({
      kind: 'cancel-and-pass',
    })
  })

  test('once another row is under the cursor, even d only cancels and acts as usual', () => {
    expect(PendingClose.onKey(armed, { name: 'd' }, { ...onRow, targetKey: 'tmux:$3' })).toEqual({
      kind: 'cancel-and-pass',
    })
    expect(PendingClose.onKey(armed, { name: 'd' }, { ...onRow, targetKey: undefined })).toEqual({
      kind: 'cancel-and-pass',
    })
  })
})

describe('a waiting close on screen', () => {
  test('shows its warnings as one warn status line, as plain text', () => {
    const warned = PendingClose.arm({
      ...plan,
      warnings: [
        { kind: 'in-use' },
        { kind: 'agent-active', name: 'be\u001b[31mta\u0007', status: 'blocked' },
      ],
    })

    expect(PendingClose.statusLines(warned)).toEqual([
      {
        kind: 'warn',
        text: "Attached: a client is using it now. Agent in 'beta ' is waiting for input",
      },
    ])
  })

  test('adds no status line without warnings or when nothing waits', () => {
    expect(PendingClose.statusLines(armed)).toEqual([])
    expect(PendingClose.statusLines(PendingClose.none)).toEqual([])
  })
})
