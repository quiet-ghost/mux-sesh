import { constants } from 'fs'
import { access, stat } from 'fs/promises'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import {
  CommandInterrupted,
  CommandOutputLimitError,
  CommandTimeoutError,
  CommandTransportError,
  type CommandRunner,
} from '../multiplexer/command'
import type { Config, Item } from '../types'
import { mapWithConcurrency } from '../util/concurrency'
import { normalizePathForMatching } from '../util/glob'
import {
  filterProjectCandidatePaths,
  filterSessionCandidatePaths,
  PRUNED_PROJECT_DIRECTORY_NAMES,
  toProjectItem,
  uniqueNormalizedPaths,
  type DiscoveryScope,
} from './discovery'
import { applyZoxideMode, getZoxideEntries } from './zoxide'

const ROOT_SCAN_CONCURRENCY = 4

export type DiscoveryFailureReason =
  | { kind: 'missing' }
  | { kind: 'not-directory' }
  | { kind: 'inaccessible'; code: string }
  | { kind: 'find-exit'; exitCode: number; stderr: string }
  | { kind: 'timeout'; timeoutMs: number }
  | { kind: 'output-limit'; limitBytes: number }
  | { kind: 'command-failed'; message: string }

export interface DiscoveryFailure {
  root: string
  reason: DiscoveryFailureReason
}

export interface DiscoveryResult {
  items: Item[]
  failures: DiscoveryFailure[]
}

export interface DiscoveryRunReport {
  result: DiscoveryResult
  reportedFailures: DiscoveryFailure[]
}

// A nonzero find exit (for example one unreadable subdirectory) still lists what it could read.
type RootScan =
  | { kind: 'ok'; root: string; paths: string[] }
  | { kind: 'partial'; root: string; paths: string[]; failure: DiscoveryFailure }
  | { kind: 'failed'; root: string; failure: DiscoveryFailure }

interface ScopeSettings {
  scanDepth: number
  requireProjectMarker: boolean
  // Session candidates skip hidden folders below a root; projects keep repos like ~/.dotfiles.
  pruneHidden: boolean
  selectPaths: (paths: string[]) => Promise<string[]>
}

const SCOPE_SETTINGS: Record<DiscoveryScope, ScopeSettings> = {
  projects: {
    scanDepth: 3,
    requireProjectMarker: true,
    pruneHidden: false,
    selectPaths: filterProjectCandidatePaths,
  },
  'session-candidates': {
    scanDepth: 5,
    requireProjectMarker: false,
    pruneHidden: true,
    selectPaths: async paths => filterSessionCandidatePaths(paths),
  },
}

const decodeErrorCode = Schema.decodeUnknownOption(Schema.Struct({ code: Schema.String }))

function failed(root: string, reason: DiscoveryFailureReason): RootScan {
  return { kind: 'failed', root, failure: { root, reason } }
}

function fileSystemFailure(cause: Error): DiscoveryFailureReason {
  const code = Option.match(decodeErrorCode(cause), {
    onNone: () => 'UNKNOWN',
    onSome: error => error.code,
  })

  return code === 'ENOENT' || code === 'ENOTDIR'
    ? { kind: 'missing' }
    : { kind: 'inaccessible', code }
}

async function checkRoot(root: string): Promise<DiscoveryFailureReason | undefined> {
  try {
    if (!(await stat(root)).isDirectory()) {
      return { kind: 'not-directory' }
    }

    await access(root, constants.R_OK | constants.X_OK)

    return undefined
  } catch (cause) {
    if (cause instanceof Error) {
      return fileSystemFailure(cause)
    }

    throw cause
  }
}

function findCommand(root: string, maxDepth: number, pruneHidden: boolean): string[] {
  const names = pruneHidden
    ? ['.*', ...PRUNED_PROJECT_DIRECTORY_NAMES]
    : PRUNED_PROJECT_DIRECTORY_NAMES

  const pruneExpression = names.flatMap((name, index) =>
    index === 0 ? ['-name', name] : ['-o', '-name', name]
  )

  return [
    'find',
    root,
    '-mindepth',
    '1',
    '-maxdepth',
    String(maxDepth),
    '(',
    ...pruneExpression,
    ')',
    '-prune',
    '-o',
    '-type',
    'd',
    '-print',
  ]
}

function parseFindOutput(output: string): string[] {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(path => normalizePathForMatching(path))
}

async function scanRoot(
  root: string,
  settings: ScopeSettings,
  runner: CommandRunner
): Promise<RootScan> {
  const rootFailure = await checkRoot(root)

  if (rootFailure) {
    return failed(root, rootFailure)
  }

  try {
    const result = await runner.run(findCommand(root, settings.scanDepth, settings.pruneHidden))
    const paths = parseFindOutput(result.stdout)

    if (result.exitCode === 0) {
      return { kind: 'ok', root, paths }
    }

    const reason: DiscoveryFailureReason = {
      kind: 'find-exit',
      exitCode: result.exitCode,
      stderr: result.stderr.trim(),
    }

    return { kind: 'partial', root, paths, failure: { root, reason } }
  } catch (cause) {
    if (cause instanceof CommandTimeoutError) {
      return failed(root, { kind: 'timeout', timeoutMs: cause.timeoutMs })
    }

    if (cause instanceof CommandOutputLimitError) {
      return failed(root, { kind: 'output-limit', limitBytes: cause.limitBytes })
    }

    if (cause instanceof CommandTransportError || cause instanceof CommandInterrupted) {
      return failed(root, { kind: 'command-failed', message: cause.message })
    }

    throw cause
  }
}

// Missing roots are common with the default project paths, and a partial scan still listed its
// projects, so only roots that yielded nothing because of a real failure reach the user.
function reportedFailure(scan: RootScan): DiscoveryFailure[] {
  switch (scan.kind) {
    case 'ok':
      return []
    case 'partial':
      return scan.paths.length === 0 ? [scan.failure] : []
    case 'failed':
      return scan.failure.reason.kind === 'missing' ? [] : [scan.failure]
  }
}

export async function runProjectDiscovery(
  config: Config,
  scope: DiscoveryScope,
  runner: CommandRunner
): Promise<DiscoveryRunReport> {
  const settings = SCOPE_SETTINGS[scope]

  const scans = await mapWithConcurrency(
    uniqueNormalizedPaths(config.projectPaths),
    ROOT_SCAN_CONCURRENCY,
    root => scanRoot(root, settings, runner)
  )

  const failures = scans.flatMap(scan => (scan.kind === 'ok' ? [] : [scan.failure]))
  const reportedFailures = scans.flatMap(reportedFailure)
  const scanned = scans.flatMap(scan => (scan.kind === 'failed' ? [] : [scan]))

  if (scanned.length === 0) {
    return { result: { items: [], failures }, reportedFailures }
  }

  const selectedPaths = await settings.selectPaths(scanned.flatMap(scan => scan.paths))

  const zoxideEntries =
    config.zoxideMode === 'off'
      ? []
      : await getZoxideEntries(
          async command => {
            const result = await runner.run(command)

            return { exitCode: result.exitCode, output: result.stdout }
          },
          scanned.map(scan => scan.root),
          settings.requireProjectMarker
        )

  return {
    result: {
      items: applyZoxideMode(selectedPaths.map(toProjectItem), zoxideEntries, config),
      failures,
    },
    reportedFailures,
  }
}
