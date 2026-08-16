import { watch, type FSWatcher } from 'node:fs'
import { getOmarchyThemeNamePath } from './omarchy'

export type ThemeFollowSignal = 'SIGUSR2'

export interface ThemeFollowHandlers {
  onRefresh: () => void
}

export interface ThemeFollowWatchHandle {
  close: () => void
}

export interface SubscribeThemeFollowOptions {
  debounceMs?: number
  watch?: (path: string, listener: () => void) => ThemeFollowWatchHandle
  onSignal?: (signal: ThemeFollowSignal, listener: () => void) => () => void
}

export interface ThemeFollowSubscription {
  stop: () => void
}

const DEFAULT_DEBOUNCE_MS = 80

export function ignoreUnhandledThemeFollowSignal(): void {
  process.on('SIGUSR2', () => {})
}

function defaultWatch(path: string, listener: () => void): ThemeFollowWatchHandle {
  const watcher: FSWatcher = watch(path, listener)
  return {
    close: () => {
      watcher.close()
    },
  }
}

function defaultOnSignal(signal: ThemeFollowSignal, listener: () => void): () => void {
  process.on(signal, listener)
  return () => {
    process.off(signal, listener)
  }
}

export function subscribeThemeFollow(
  homeDir: string,
  handlers: ThemeFollowHandlers,
  options: SubscribeThemeFollowOptions = {}
): ThemeFollowSubscription {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const watchPath = options.watch ?? defaultWatch
  const onSignal = options.onSignal ?? defaultOnSignal
  let timeout: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const scheduleRefresh = (): void => {
    if (stopped) {
      return
    }

    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      timeout = undefined
      if (!stopped) {
        handlers.onRefresh()
      }
    }, debounceMs)
  }

  let watcher: ThemeFollowWatchHandle | undefined
  try {
    watcher = watchPath(getOmarchyThemeNamePath(homeDir), scheduleRefresh)
  } catch {
    watcher = undefined
  }

  const unsubscribeSignal = onSignal('SIGUSR2', scheduleRefresh)

  return {
    stop: () => {
      stopped = true
      if (timeout) {
        clearTimeout(timeout)
        timeout = undefined
      }
      watcher?.close()
      unsubscribeSignal()
    },
  }
}
