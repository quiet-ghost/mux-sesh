import { isExpectedActionFailure } from './action-outcome'

export interface ActionOwnerOptions {
  // Shows an expected failure that a handler did not already turn into an outcome.
  report: (cause: Error) => void
  // Crash recovery for defects; production passes requestFatalShutdown.
  onDefect: (cause: unknown) => void
}

// The single owner of foreground work started from keys: nothing it runs can float or vanish
// into the renderer's console. Synchronous throws and rejections are routed the same way.
export interface ActionOwner {
  readonly run: (task: () => Promise<void> | void) => void
}

function create(options: ActionOwnerOptions): ActionOwner {
  function fail(cause: unknown): void {
    if (isExpectedActionFailure(cause)) {
      options.report(cause)

      return
    }

    options.onDefect(cause)
  }

  function run(task: () => Promise<void> | void): void {
    try {
      Promise.resolve(task()).catch(fail)
    } catch (cause) {
      fail(cause)
    }
  }

  return { run }
}

export const ActionOwner = { create } as const
