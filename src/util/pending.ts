// Whether some work is still running, readable at any time and observable as it changes.
export interface PendingSignal {
  readonly pending: () => boolean
  readonly subscribe: (listener: () => void) => () => void
}

// A pending flag set by its owner; its `active` field makes it usable as a LaunchGuard.
export interface PendingFlag extends PendingSignal {
  active: boolean
}

export const IDLE: PendingSignal = {
  pending: () => false,
  subscribe: () => () => {},
}

export function createPendingFlag(): PendingFlag {
  let active = false
  const listeners = new Set<() => void>()

  return {
    get active() {
      return active
    },
    set active(next: boolean) {
      if (next === active) return
      active = next

      for (const listener of listeners) listener()
    },
    pending: () => active,
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export function anyPending(signals: readonly PendingSignal[]): PendingSignal {
  return {
    pending: () => signals.some(signal => signal.pending()),
    subscribe(listener) {
      const unsubscribes = signals.map(signal => signal.subscribe(listener))

      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe()
      }
    },
  }
}
