import { describe, expect, test } from 'bun:test'
import { subscribeThemeFollow } from '../src/styles/theme-follow'

describe('subscribeThemeFollow', () => {
  test('debounces watch and SIGUSR2 into one refresh', async () => {
    const watchers: Array<() => void> = []
    const signals: Array<() => void> = []
    let refreshCount = 0

    const subscription = subscribeThemeFollow(
      '/tmp/fake-home',
      { onRefresh: () => {
        refreshCount += 1
      } },
      {
        debounceMs: 15,
        watch: (_path, listener) => {
          watchers.push(listener)
          return { close: () => {} }
        },
        onSignal: (_signal, listener) => {
          signals.push(listener)
          return () => {}
        },
      }
    )

    expect(watchers).toHaveLength(1)
    expect(signals).toHaveLength(1)

    watchers[0]?.()
    signals[0]?.()

    expect(refreshCount).toBe(0)
    await Bun.sleep(30)
    expect(refreshCount).toBe(1)

    subscription.stop()
  })

  test('stop prevents further refreshes', async () => {
    const watchers: Array<() => void> = []
    let refreshCount = 0
    let closed = false
    let unsubscribed = false

    const subscription = subscribeThemeFollow(
      '/tmp/fake-home',
      { onRefresh: () => {
        refreshCount += 1
      } },
      {
        debounceMs: 10,
        watch: (_path, listener) => {
          watchers.push(listener)
          return {
            close: () => {
              closed = true
            },
          }
        },
        onSignal: (_signal, _listener) => () => {
          unsubscribed = true
        },
      }
    )

    subscription.stop()
    expect(closed).toBe(true)
    expect(unsubscribed).toBe(true)

    watchers[0]?.()
    await Bun.sleep(20)
    expect(refreshCount).toBe(0)
  })
})
