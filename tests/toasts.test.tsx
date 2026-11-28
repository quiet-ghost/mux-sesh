import { afterEach, describe, expect, jest, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'
import {
  TOAST_DURATION_MS,
  ToastQueue,
  useToasts,
  type ShowToast,
  type ToastInput,
  type Toasts,
} from '../src/app/notifications'

describe('toast queue', () => {
  test('shows one toast at a time, in order', () => {
    const queue = [
      { kind: 'error', message: 'Could not open' },
      { kind: 'success', message: 'Refreshed' },
    ] as const satisfies ReadonlyArray<ToastInput>

    const shown = queue.reduce(ToastQueue.push, ToastQueue.empty)

    expect(shown.current).toMatchObject({ kind: 'error', message: 'Could not open' })
    expect(shown.pending).toHaveLength(1)

    const next = ToastQueue.advance(shown)

    expect(next.current).toMatchObject({ kind: 'success', message: 'Refreshed' })
    expect(ToastQueue.advance(next).current).toBeUndefined()
  })

  test('newer feedback replaces a toast on screen unless it is an error', () => {
    const refused = ToastQueue.push(ToastQueue.empty, { kind: 'warning', message: 'No' })
    const replaced = ToastQueue.push(refused, { kind: 'success', message: 'Refreshed' })

    expect(replaced.current).toMatchObject({ kind: 'success', message: 'Refreshed' })
    expect(replaced.pending).toEqual([])

    const failed = ToastQueue.push(replaced, { kind: 'error', message: 'Could not open' })
    const waiting = ToastQueue.push(failed, { kind: 'warning', message: 'No' })

    expect(waiting.current).toMatchObject({ kind: 'error', message: 'Could not open' })
    expect(waiting.pending).toMatchObject([{ kind: 'warning', message: 'No' }])
  })

  test('behind an error, every error waits and only the newest other toast does', () => {
    const queue = [
      { kind: 'error', message: 'first' },
      { kind: 'warning', message: 'stale refusal' },
      { kind: 'error', message: 'second' },
      { kind: 'success', message: 'Refreshed' },
      { kind: 'error', message: 'second' },
    ] as const satisfies ReadonlyArray<ToastInput>

    const shown = queue.reduce(ToastQueue.push, ToastQueue.empty)

    expect(shown.current).toMatchObject({ message: 'first' })
    expect(shown.pending.map(toast => toast.message)).toEqual(['second', 'Refreshed'])
  })

  test('acknowledging removes only an error and shows what waited behind it', () => {
    const failed = ToastQueue.push(ToastQueue.empty, { kind: 'error', message: 'Could not open' })
    const waiting = ToastQueue.push(failed, { kind: 'info', message: 'Update available' })
    const seen = ToastQueue.acknowledge(waiting)

    expect(seen.current).toMatchObject({ kind: 'info', message: 'Update available' })
    expect(ToastQueue.acknowledge(seen)).toBe(seen)
  })

  test('a repeat restarts the toast on screen instead of queueing a copy', () => {
    const first = ToastQueue.push(ToastQueue.empty, { kind: 'error', message: 'Could not open' })
    const repeated = ToastQueue.push(first, { kind: 'error', message: 'Could not open' })

    expect(repeated.pending).toEqual([])
    expect(repeated.current?.id).not.toBe(first.current?.id)
  })

  test('failures stay longer than confirmations', () => {
    expect(TOAST_DURATION_MS.error).toBeGreaterThan(TOAST_DURATION_MS.success)
    expect(TOAST_DURATION_MS.success).toBe(5000)
  })
})

interface Probe {
  toasts?: Toasts
}

function ToastProbe({ probe }: { probe: Probe }) {
  probe.toasts = useToasts()

  return <text>{probe.toasts.current?.message ?? 'none'}</text>
}

let destroy: (() => void) | undefined

afterEach(() => {
  destroy?.()
  destroy = undefined
  jest.useRealTimers()
})

async function mountProbe(): Promise<{ probe: Probe; show: ShowToast }> {
  const probe: Probe = {}
  const setup = await testRender(<ToastProbe probe={probe} />, { width: 40, height: 4 })

  destroy = () => act(() => setup.renderer.destroy())

  const show: ShowToast = toast => {
    act(() => probe.toasts?.showToast(toast))
  }

  return { probe, show }
}

function advance(milliseconds: number): void {
  act(() => {
    jest.advanceTimersByTime(milliseconds)
  })
}

describe('useToasts', () => {
  test('each kind leaves after its own duration, then the next one shows', async () => {
    const { probe, show } = await mountProbe()
    jest.useFakeTimers()

    show({ kind: 'error', message: 'Could not open' })
    show({ kind: 'success', message: 'Refreshed' })
    expect(probe.toasts?.current?.message).toBe('Could not open')
    expect(probe.toasts?.more).toBe(1)

    advance(TOAST_DURATION_MS.error - 1)
    expect(probe.toasts?.current?.message).toBe('Could not open')

    advance(1)
    expect(probe.toasts?.current?.message).toBe('Refreshed')
    expect(probe.toasts?.more).toBe(0)

    advance(TOAST_DURATION_MS.success)
    expect(probe.toasts?.current).toBeUndefined()
    expect(jest.getTimerCount()).toBe(0)
  })

  test('acknowledging a confirmation changes nothing, so a key causes no render', async () => {
    const { probe, show } = await mountProbe()

    show({ kind: 'success', message: 'Refreshed' })
    const before = probe.toasts

    act(() => probe.toasts?.acknowledgeToast())

    expect(probe.toasts).toBe(before)
  })

  test('unmounting clears the timer of the toast on screen', async () => {
    const { show } = await mountProbe()
    jest.useFakeTimers()

    show({ kind: 'info', message: 'Update available' })
    expect(jest.getTimerCount()).toBe(1)

    destroy?.()
    destroy = undefined

    expect(jest.getTimerCount()).toBe(0)
  })
})
