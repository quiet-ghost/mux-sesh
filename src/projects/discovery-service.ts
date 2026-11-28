import type { CommandRunner } from '../multiplexer/command'
import type { Config } from '../types'
import { toHomeRelativePath } from '../util/path-display'
import { buildCacheKey, type DiscoveryScope } from './discovery'
import {
  runProjectDiscovery,
  type DiscoveryFailure,
  type DiscoveryFailureReason,
  type DiscoveryResult,
  type DiscoveryRunReport,
} from './loader'

export type { DiscoveryFailure, DiscoveryFailureReason, DiscoveryResult, DiscoveryScope }

export type DiscoveryFailureListener = (failures: readonly DiscoveryFailure[]) => void

export interface ProjectDiscoveryOptions {
  runner: CommandRunner
  ttlMs: number
}

export interface ProjectDiscovery {
  load(config: Config, scope: DiscoveryScope): Promise<DiscoveryResult>
  refresh(): void
  subscribeFailures(listener: DiscoveryFailureListener): () => void
}

interface CachedDiscovery {
  result: DiscoveryResult
  expiresAt: number
}

interface DiscoveryRun {
  generation: number
  promise: Promise<DiscoveryResult>
}

function describeReason(reason: DiscoveryFailureReason): string {
  switch (reason.kind) {
    case 'missing':
      return 'does not exist'
    case 'not-directory':
      return 'is not a directory'
    case 'inaccessible':
      return `cannot be read: ${reason.code}`
    case 'find-exit': {
      const detail = reason.stderr.split('\n')[0]

      return detail ? `find exited ${reason.exitCode}: ${detail}` : `find exited ${reason.exitCode}`
    }

    case 'timeout':
      return `find timed out after ${reason.timeoutMs / 1000} s`
    case 'output-limit':
      return `find output exceeded ${reason.limitBytes} bytes`
    case 'command-failed':
      return `find could not run: ${reason.message}`
  }
}

export function describeDiscoveryFailures(failures: readonly DiscoveryFailure[]): string {
  const roots = failures
    .map(failure => `${toHomeRelativePath(failure.root)} (${describeReason(failure.reason)})`)
    .join('; ')

  const subject = failures.length === 1 ? 'a project root' : `${failures.length} project roots`

  return `Could not scan ${subject}: ${roots}. Projects from other roots are still listed. Fix the directory permissions or Project Paths (project_paths in the config), then refresh.`
}

export function createProjectDiscovery(options: ProjectDiscoveryOptions): ProjectDiscovery {
  const cache = new Map<string, CachedDiscovery>()
  const runs = new Map<string, DiscoveryRun>()
  const currentRevisions = new Map<DiscoveryScope, string>()
  const listeners = new Set<DiscoveryFailureListener>()
  let generation = 0

  function trackRevision(scope: DiscoveryScope, revision: string): void {
    const previous = currentRevisions.get(scope)

    if (previous === revision) {
      return
    }

    if (previous !== undefined) {
      cache.delete(previous)
    }

    currentRevisions.set(scope, revision)
  }

  function isCurrent(scope: DiscoveryScope, revision: string, runGeneration: number): boolean {
    return runGeneration === generation && currentRevisions.get(scope) === revision
  }

  function publish(revision: string, report: DiscoveryRunReport): void {
    cache.set(revision, { result: report.result, expiresAt: Date.now() + options.ttlMs })

    if (report.reportedFailures.length > 0) {
      for (const listener of listeners) {
        listener(report.reportedFailures)
      }
    }
  }

  function start(config: Config, scope: DiscoveryScope, revision: string): DiscoveryRun {
    const runGeneration = generation

    const promise = runProjectDiscovery(config, scope, options.runner)
      .then(report => {
        if (isCurrent(scope, revision, runGeneration)) {
          publish(revision, report)
        }

        return report.result
      })
      .finally(() => {
        if (runs.get(revision) === run) {
          runs.delete(revision)
        }
      })

    const run = { generation: runGeneration, promise }

    runs.set(revision, run)

    return run
  }

  return {
    async load(config, scope) {
      const revision = buildCacheKey(config, scope)
      trackRevision(scope, revision)

      const cached = cache.get(revision)

      if (cached && cached.expiresAt > Date.now()) {
        return cached.result
      }

      const running = runs.get(revision)

      if (running && running.generation === generation) {
        return running.promise
      }

      return start(config, scope, revision).promise
    },
    refresh() {
      generation += 1
      cache.clear()
    },
    subscribeFailures(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}
