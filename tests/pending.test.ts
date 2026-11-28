import { describe, expect, test } from 'bun:test'
import { anyPending, createPendingFlag, IDLE } from '../src/util/pending'

describe('pending flag', () => {
  test('notifies only when it changes, and serves as a launch guard', () => {
    const flag = createPendingFlag()
    const seen: boolean[] = []
    const unsubscribe = flag.subscribe(() => seen.push(flag.pending()))

    expect(flag.active).toBe(false)
    flag.active = true
    flag.active = true
    expect(flag.active).toBe(true)
    flag.active = false
    unsubscribe()
    flag.active = true

    expect(seen).toEqual([true, false])
  })

  test('anyPending is pending while one of its signals is', () => {
    const left = createPendingFlag()
    const right = createPendingFlag()
    const either = anyPending([left, right, IDLE])
    let notified = 0
    const unsubscribe = either.subscribe(() => notified++)

    expect(either.pending()).toBe(false)
    left.active = true
    right.active = true
    left.active = false
    expect(either.pending()).toBe(true)
    right.active = false
    expect(either.pending()).toBe(false)
    unsubscribe()
    left.active = true

    expect(notified).toBe(4)
  })
})
