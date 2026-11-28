import { useCallback, useEffect, useRef, useState } from 'react'

// info: neutral news; success: a confirmation; warning: a refusal or a degraded result that
// changed nothing; error: a failure.
export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface ToastInput {
  readonly kind: ToastKind
  readonly message: string
  readonly title?: string
}

export type ShowToast = (toast: ToastInput) => void

export interface QueuedToast extends ToastInput {
  readonly id: number
}

export interface ToastQueue {
  readonly current: QueuedToast | undefined
  readonly pending: readonly QueuedToast[]
  readonly nextId: number
}

// Failures stay longer so they can be read; only an error also leaves on the next key.
export const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>> = {
  info: 5000,
  success: 5000,
  warning: 5000,
  error: 8000,
}

const EMPTY: ToastQueue = { current: undefined, pending: [], nextId: 1 }

function sameToast(toast: ToastInput, other: ToastInput | undefined): boolean {
  return (
    other !== undefined &&
    toast.kind === other.kind &&
    toast.message === other.message &&
    toast.title === other.title
  )
}

// Newer feedback replaces the toast on screen, except an error: it keeps its full time and the
// rest wait behind it. While waiting, a newer non-error toast supersedes an older one; every
// error is kept. A repeat of the toast on screen restarts its time instead of queueing a copy.
function push(queue: ToastQueue, toast: ToastInput): ToastQueue {
  const entry: QueuedToast = { ...toast, id: queue.nextId }
  const nextId = queue.nextId + 1
  const { current } = queue

  if (!current || sameToast(toast, current) || current.kind !== 'error') {
    return { current: entry, pending: queue.pending, nextId }
  }

  if (queue.pending.some(pending => sameToast(toast, pending))) return queue

  const kept =
    toast.kind === 'error'
      ? queue.pending
      : queue.pending.filter(pending => pending.kind === 'error')

  return { current, pending: [...kept, entry], nextId }
}

function advance(queue: ToastQueue): ToastQueue {
  const [current, ...pending] = queue.pending

  return { current, pending, nextId: queue.nextId }
}

// The next key after an error means it was seen: it leaves, and whatever waited behind it shows.
function acknowledge(queue: ToastQueue): ToastQueue {
  return queue.current?.kind === 'error' ? advance(queue) : queue
}

export const ToastQueue = { empty: EMPTY, push, advance, acknowledge } as const

export interface Toasts {
  readonly current: QueuedToast | undefined
  readonly more: number
  readonly showToast: ShowToast
  // Called on every key; it updates state only while an error is on screen.
  readonly acknowledgeToast: () => void
}

// One notice at a time, shown in the footer's status line. The timer belongs to the notice on
// screen and is cleared on unmount.
export function useToasts(): Toasts {
  const [queue, setQueue] = useState(ToastQueue.empty)
  const { current } = queue
  const errorShown = useRef(false)
  errorShown.current = current?.kind === 'error'

  const showToast = useCallback<ShowToast>(toast => setQueue(latest => push(latest, toast)), [])

  const acknowledgeToast = useCallback(() => {
    if (errorShown.current) setQueue(acknowledge)
  }, [])

  useEffect(() => {
    if (!current) return

    const timer = setTimeout(() => setQueue(advance), TOAST_DURATION_MS[current.kind])

    return () => clearTimeout(timer)
  }, [current])

  return { current, more: queue.pending.length, showToast, acknowledgeToast }
}
