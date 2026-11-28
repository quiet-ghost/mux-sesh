import { parseArgs } from 'util'
import * as Schema from 'effect/Schema'
import { APP_ENTRYPOINT, REPO_ROOT, binaryPath, compileBinary } from './compile'
import { detectHost } from './host'
import { BUILD_TARGETS, BuildTarget, Host } from './targets'

const USAGE = [
  'Usage: bun tools/build/build.ts [--single | --target <package> ...] [--version <semver>]',
  '  (no flags)          build every platform package',
  '  --single            build the best package for this machine',
  '  --target <package>  build the named package, e.g. mux-sesh-linux-arm64',
  "  --version <semver>  stamp this version instead of package.json's, e.g. 2.0.0-rc.1",
].join('\n')

// SemVer 2.0, the version syntax npm accepts for a published package.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*))*)?(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?$/

const decodeVersion = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.String }))

export type TargetSelection =
  | { readonly ok: true; readonly targets: readonly BuildTarget[] }
  | { readonly ok: false; readonly message: string }

// Without a requested version, build and pack stamp package.json's.
export type BuildArgs =
  | {
      readonly ok: true
      readonly targets: readonly BuildTarget[]
      readonly version: string | undefined
    }
  | { readonly ok: false; readonly message: string }

export async function readPackageVersion(): Promise<string> {
  return decodeVersion(await Bun.file(`${REPO_ROOT}/package.json`).json()).version
}

export function isSemVer(version: string): boolean {
  return SEMVER.test(version)
}

export async function resolveVersion(requested: string | undefined): Promise<string> {
  return requested ?? (await readPackageVersion())
}

export function singleTarget(): TargetSelection {
  const host = detectHost()
  const best = host ? Host.candidates(host)[0] : undefined

  if (!best) {
    return {
      ok: false,
      message: `mux-sesh has no binary target for ${process.platform}-${process.arch}. Supported: ${BUILD_TARGETS.map(target => BuildTarget.packageName(target)).join(', ')}.`,
    }
  }

  return { ok: true, targets: [best] }
}

function namedTargets(names: readonly string[]): TargetSelection {
  if (names.length === 0) return { ok: true, targets: BUILD_TARGETS }

  const targets = names.map(name => ({ name, target: BuildTarget.find(name) }))
  const unknown = targets.flatMap(entry => (entry.target ? [] : [entry.name]))

  if (unknown.length > 0) {
    return {
      ok: false,
      message: `Unknown target ${unknown.join(', ')}. Choose from: ${BUILD_TARGETS.map(target => BuildTarget.packageName(target)).join(', ')}.`,
    }
  }

  return { ok: true, targets: targets.flatMap(entry => (entry.target ? [entry.target] : [])) }
}

// Throws on unknown or malformed flags, like parseArgs.
export function parseBuildArgs(args: readonly string[]): BuildArgs {
  const { values } = parseArgs({
    args: [...args],
    options: {
      single: { type: 'boolean', default: false },
      target: { type: 'string', multiple: true, default: [] },
      version: { type: 'string' },
    },
    strict: true,
  })

  if (values.version !== undefined && !isSemVer(values.version)) {
    return {
      ok: false,
      message: `--version ${JSON.stringify(values.version)} is not a SemVer version npm can publish. Use a form like 2.0.0 or 2.0.0-rc.1.`,
    }
  }

  const selection = values.single ? singleTarget() : namedTargets(values.target)

  return selection.ok ? { ...selection, version: values.version } : selection
}

async function main(args: readonly string[]): Promise<number> {
  let selection: BuildArgs

  try {
    selection = parseBuildArgs(args)
  } catch (cause) {
    console.error(`${cause instanceof Error ? cause.message : String(cause)}\n\n${USAGE}`)

    return 2
  }

  if (!selection.ok) {
    console.error(selection.message)

    return 1
  }

  const version = await resolveVersion(selection.version)

  for (const target of selection.targets) {
    const started = performance.now()

    const outcome = await compileBinary({
      entrypoint: APP_ENTRYPOINT,
      target,
      version,
      outfile: binaryPath(target),
    })

    if (!outcome.ok) {
      console.error(outcome.message)

      return 1
    }

    const megabytes = (outcome.bytes / 1024 / 1024).toFixed(1)
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    console.log(
      `${BuildTarget.packageName(target)} ${version}: ${outcome.outfile} (${megabytes} MiB, ${seconds}s)`
    )
  }

  return 0
}

if (import.meta.main) process.exitCode = await main(Bun.argv.slice(2))
