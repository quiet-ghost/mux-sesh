import { existsSync } from 'fs'
import { chmod, copyFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import * as Schema from 'effect/Schema'
import { selectTargets } from './build'
import { BINARY_NAME, REPO_ROOT, binaryPath } from './compile'
import { BUILD_TARGETS, BuildTarget, PACKAGE_NAME } from './targets'

export const NPM_ROOT = join(REPO_ROOT, 'dist/npm')

const LAUNCHER_FILES = ['bin/mux-sesh', 'bin/platform.sh', 'bin/postinstall'] as const

const decodeRootManifest = Schema.decodeUnknownSync(
  Schema.Struct({
    name: Schema.Literal(PACKAGE_NAME),
    version: Schema.String,
    description: Schema.String,
    keywords: Schema.Array(Schema.String),
    author: Schema.String,
    license: Schema.String,
    repository: Schema.Struct({ type: Schema.String, url: Schema.String }),
    bugs: Schema.Struct({ url: Schema.String }),
    homepage: Schema.String,
  })
)

export type RootManifest = ReturnType<typeof decodeRootManifest>

export type PackOutcome =
  | { readonly ok: true; readonly directories: readonly string[] }
  | { readonly ok: false; readonly message: string }

export function platformManifest(root: RootManifest, target: BuildTarget) {
  const fields = BuildTarget.manifestFields(target)
  const libc = fields.libc ? `, ${fields.libc.join('/')}` : ''
  const baseline = target.baseline ? ', no AVX2' : ''

  return {
    name: BuildTarget.packageName(target),
    version: root.version,
    description: `Prebuilt mux-sesh binary for ${target.os} ${target.arch}${libc}${baseline}. Install mux-sesh instead.`,
    license: root.license,
    repository: root.repository,
    homepage: root.homepage,
    ...fields,
    files: ['bin'],
  }
}

// The published package carries only the launcher; npm installs the matching platform package.
export function mainManifest(root: RootManifest) {
  return {
    name: root.name,
    version: root.version,
    description: root.description,
    keywords: root.keywords,
    author: root.author,
    license: root.license,
    repository: root.repository,
    bugs: root.bugs,
    homepage: root.homepage,
    bin: { [PACKAGE_NAME]: 'bin/mux-sesh' },
    scripts: { postinstall: 'sh ./bin/postinstall' },
    files: ['bin'],
    os: ['linux', 'darwin'],
    cpu: ['x64', 'arm64'],
    optionalDependencies: Object.fromEntries(
      BUILD_TARGETS.map(target => [BuildTarget.packageName(target), root.version])
    ),
  }
}

async function writeJson(
  path: string,
  value: ReturnType<typeof mainManifest | typeof platformManifest>
) {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

export async function readRootManifest(): Promise<RootManifest> {
  return decodeRootManifest(await Bun.file(join(REPO_ROOT, 'package.json')).json())
}

export async function pack(targets: readonly BuildTarget[]): Promise<PackOutcome> {
  const missing = targets.filter(target => !existsSync(binaryPath(target)))

  if (missing.length > 0) {
    const names = missing.map(target => BuildTarget.packageName(target))

    return {
      ok: false,
      message: [
        `Cannot pack: no binary for ${names.join(', ')}.`,
        'Build them first with `bun run build:all` (or `bun run build` for this machine), then pack again.',
      ].join('\n'),
    }
  }

  const root = await readRootManifest()
  const directories: string[] = []

  for (const target of targets) {
    const directory = join(NPM_ROOT, BuildTarget.packageName(target))
    await chmod(binaryPath(target), 0o755)
    await copyFile(join(REPO_ROOT, 'LICENSE'), join(directory, 'LICENSE'))
    await writeJson(join(directory, 'package.json'), platformManifest(root, target))
    directories.push(directory)
  }

  const main = join(NPM_ROOT, PACKAGE_NAME)
  await rm(main, { recursive: true, force: true })
  await mkdir(join(main, 'bin'), { recursive: true })

  for (const file of [...LAUNCHER_FILES, 'README.md', 'LICENSE']) {
    await copyFile(join(REPO_ROOT, file), join(main, file))
  }

  await chmod(join(main, 'bin', BINARY_NAME), 0o755)
  await writeJson(join(main, 'package.json'), mainManifest(root))
  directories.push(main)

  return { ok: true, directories }
}

async function main(args: readonly string[]): Promise<number> {
  let selection: ReturnType<typeof selectTargets>

  try {
    selection = selectTargets(args)
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause))

    return 2
  }

  if (!selection.ok) {
    console.error(selection.message)

    return 1
  }

  const outcome = await pack(selection.targets)

  if (!outcome.ok) {
    console.error(outcome.message)

    return 1
  }

  for (const directory of outcome.directories) console.log(directory)

  return 0
}

if (import.meta.main) process.exitCode = await main(Bun.argv.slice(2))
