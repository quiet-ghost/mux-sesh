import { existsSync } from 'fs'
import { mkdir, readdir, rm } from 'fs/promises'
import { dirname, join } from 'path'
import { BuildTarget } from './targets'

export const REPO_ROOT = join(import.meta.dir, '../..')

export const APP_ENTRYPOINT = join(REPO_ROOT, 'src/index.tsx')

export const BINARY_NAME = 'mux-sesh'

export const INSTALL_ALL_PLATFORMS = "bun install --frozen-lockfile --os='*' --cpu='*' --libc='*'"

export interface CompileRequest {
  readonly entrypoint: string
  readonly target: BuildTarget
  readonly version: string
  readonly outfile: string
}

export type CompileOutcome =
  | { readonly ok: true; readonly outfile: string; readonly bytes: number }
  | { readonly ok: false; readonly message: string }

interface NativeLibrary {
  readonly packageName: string
  readonly file: string
}

export function binaryPath(target: BuildTarget): string {
  return join(REPO_ROOT, 'dist/npm', BuildTarget.packageName(target), 'bin', BINARY_NAME)
}

// The libraries OpenTUI and FFF load through FFI; Bun embeds the one each import names for the target.
function nativeLibraries(target: BuildTarget): readonly NativeLibrary[] {
  const extension = target.os === 'darwin' ? 'dylib' : 'so'
  const musl = target.os === 'linux' && target.libc === 'musl'
  const fffLibc = target.os === 'linux' ? (musl ? '-musl' : '-gnu') : ''

  return [
    {
      packageName: `@opentui/core-${target.os}-${target.arch}${musl ? '-musl' : ''}`,
      file: `libopentui.${extension}`,
    },
    {
      packageName: `@ff-labs/fff-bin-${target.os}-${target.arch}${fffLibc}`,
      file: `libfff_c.${extension}`,
    },
  ]
}

function libraryPath(library: NativeLibrary): string {
  return join(REPO_ROOT, 'node_modules', library.packageName, library.file)
}

function defines(target: BuildTarget, version: string) {
  const shared = { MUX_SESH_VERSION: JSON.stringify(version) }

  if (target.os === 'darwin') return shared

  // Fixing libc at build time leaves exactly one OpenTUI and one FFF library for Bun to embed.
  return {
    ...shared,
    FFF_LIBC: JSON.stringify(target.libc === 'musl' ? 'musl' : 'gnu'),
    'process.env.OPENTUI_LIBC': JSON.stringify(target.libc),
  }
}

// A slice from the middle of each library must appear in the binary, proving that exact file is embedded.
async function missingEmbeddedLibraries(outfile: string, target: BuildTarget): Promise<string[]> {
  const binary = Buffer.from(await Bun.file(outfile).bytes())
  const missing: string[] = []

  for (const library of nativeLibraries(target)) {
    const bytes = await Bun.file(libraryPath(library)).bytes()
    const middle = Math.floor(bytes.length / 2)

    if (binary.indexOf(bytes.subarray(middle, middle + 256)) === -1) {
      missing.push(`${library.packageName}/${library.file}`)
    }
  }

  return missing
}

export async function compileBinary(request: CompileRequest): Promise<CompileOutcome> {
  const name = BuildTarget.packageName(request.target)

  const absent = nativeLibraries(request.target).filter(
    library => !existsSync(libraryPath(library))
  )

  if (absent.length > 0) {
    return {
      ok: false,
      message: [
        `Cannot build ${name}: ${absent.map(library => library.packageName).join(', ')} is not installed.`,
        'Its native library must be embedded in the binary, and bun installs only this machine’s by default.',
        `Run \`${INSTALL_ALL_PLATFORMS}\`, then build again.`,
      ].join('\n'),
    }
  }

  await rm(dirname(request.outfile), { recursive: true, force: true })
  await mkdir(dirname(request.outfile), { recursive: true })

  const result = await Bun.build({
    entrypoints: [request.entrypoint],
    format: 'esm',
    minify: true,
    bytecode: true,
    splitting: true,
    sourcemap: 'linked',
    define: defines(request.target, request.version),
    compile: {
      target: BuildTarget.bunTarget(request.target),
      outfile: request.outfile,
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: false,
      autoloadPackageJson: false,
    },
  })

  if (!result.success) {
    return {
      ok: false,
      message: [
        `Bun could not compile ${name} (${BuildTarget.bunTarget(request.target)}).`,
        ...result.logs.map(log => log.message),
        'Fix the reported errors, then build again; no binary was written.',
      ].join('\n'),
    }
  }

  // The sourcemap is embedded in the binary; Bun still writes copies beside it that nothing reads.
  for (const entry of await readdir(dirname(request.outfile))) {
    if (entry.endsWith('.map')) await rm(join(dirname(request.outfile), entry))
  }

  const missing = await missingEmbeddedLibraries(request.outfile, request.target)

  if (missing.length > 0) {
    await rm(dirname(request.outfile), { recursive: true, force: true })

    return {
      ok: false,
      message: [
        `${name} was compiled without ${missing.join(', ')}; the binary was removed.`,
        'The native library import for this target was not embedded, so the binary would fail at startup.',
        'Check that the target’s libc defines match the installed platform packages, then build again.',
      ].join('\n'),
    }
  }

  return { ok: true, outfile: request.outfile, bytes: Bun.file(request.outfile).size }
}
