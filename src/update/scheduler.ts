import type { Config } from '../types'

export interface AutoUpdateScheduler {
  // Returns a cancel for a check that has not started yet; a started check is never repeated.
  schedule: (config: Config) => () => void
}

interface AutoUpdateSchedulerOptions {
  delayMs: number
  check: (config: Config) => void
}

export function createAutoUpdateScheduler(
  options: AutoUpdateSchedulerOptions
): AutoUpdateScheduler {
  let started = false

  return {
    schedule(config) {
      if (started) return () => {}

      const timeout = setTimeout(() => {
        if (started) return
        started = true
        options.check(config)
      }, options.delayMs)

      return () => clearTimeout(timeout)
    },
  }
}
