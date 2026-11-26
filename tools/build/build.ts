import { parseArgs } from 'util'
import * as Schema from 'effect/Schema'
import { APP_ENTRYPOINT, REPO_ROOT, binaryPath, compileBinary } from './compile'
import { detectHost } from './host'
import { BUILD_TARGETS, BuildTarget, Host } from './targets'

const USAGE = [
  'Usage: bun tools/build/build.ts [--single | --target <package> ...]',
  '  (no flags)          build every platform package',
  '  --single            build the best package for this machine',
  '  --target <package>  build the named package, e.g. mux-sesh-linux-arm64',
].join('\n')

const decodeVersion = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.String }))

export type TargetSelection =
  | { readonly ok: true; readonly targets: readonly BuildTarget[] }
  | { readonly ok: false; readonly message: string }

export async function readPackageVersion(): Promise<string> {
  return decodeVersion(await Bun.file(`${REPO_ROOT}/package.json`).json()).version
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

export function selectTargets(args: readonly string[]): TargetSelection {
  const { values } = parseArgs({
    args: [...args],
    options: {
      single: { type: 'boolean', default: false },
      target: { type: 'string', multiple: true, default: [] },
    },
    strict: true,
  })

  if (values.single) return singleTarget()

  if (values.target.length === 0) return { ok: true, targets: BUILD_TARGETS }

  const targets = values.target.map(name => ({ name, target: BuildTarget.find(name) }))
  const unknown = targets.filter(entry => !entry.target).map(entry => entry.name)

  if (unknown.length > 0) {
    return {
      ok: false,
      message: `Unknown target ${unknown.join(', ')}. Choose from: ${BUILD_TARGETS.map(target => BuildTarget.packageName(target)).join(', ')}.`,
    }
  }

  return { ok: true, targets: targets.flatMap(entry => (entry.target ? [entry.target] : [])) }
}

async function main(args: readonly string[]): Promise<number> {
  let selection: TargetSelection

  try {
    selection = selectTargets(args)
  } catch (cause) {
    console.error(`${cause instanceof Error ? cause.message : String(cause)}\n\n${USAGE}`)

    return 2
  }

  if (!selection.ok) {
    console.error(selection.message)

    return 1
  }

  const version = await readPackageVersion()

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
