export const PACKAGE_NAME = 'mux-sesh'

export type BuildArch = 'x64' | 'arm64'

export type LinuxLibc = 'glibc' | 'musl'

// Baseline builds run on x64 CPUs without AVX2, where Bun's default x64 runtime crashes with SIGILL.
export type BuildTarget =
  | {
      readonly os: 'linux'
      readonly arch: BuildArch
      readonly libc: LinuxLibc
      readonly baseline: boolean
    }
  | { readonly os: 'darwin'; readonly arch: BuildArch; readonly baseline: boolean }

export type Host =
  | {
      readonly os: 'linux'
      readonly arch: BuildArch
      readonly libc: LinuxLibc
      readonly avx2: boolean
    }
  | { readonly os: 'darwin'; readonly arch: BuildArch; readonly avx2: boolean }

export interface PlatformManifestFields {
  readonly os: readonly string[]
  readonly cpu: readonly string[]
  readonly libc?: readonly string[]
}

export const BUILD_TARGETS = [
  { os: 'linux', arch: 'x64', libc: 'glibc', baseline: false },
  { os: 'linux', arch: 'x64', libc: 'glibc', baseline: true },
  { os: 'linux', arch: 'arm64', libc: 'glibc', baseline: false },
  { os: 'linux', arch: 'x64', libc: 'musl', baseline: false },
  { os: 'linux', arch: 'x64', libc: 'musl', baseline: true },
  { os: 'linux', arch: 'arm64', libc: 'musl', baseline: false },
  { os: 'darwin', arch: 'x64', baseline: false },
  { os: 'darwin', arch: 'x64', baseline: true },
  { os: 'darwin', arch: 'arm64', baseline: false },
] as const satisfies readonly BuildTarget[]

function suffix(target: BuildTarget): string {
  const baseline = target.baseline ? '-baseline' : ''

  return target.os === 'linux' && target.libc === 'musl' ? `${baseline}-musl` : baseline
}

function variants(host: Host): readonly boolean[] {
  if (host.arch === 'arm64') return [false]

  return host.avx2 ? [false, true] : [true, false]
}

export const BuildTarget = {
  packageName(target: BuildTarget): string {
    return `${PACKAGE_NAME}-${target.os}-${target.arch}${suffix(target)}`
  },

  bunTarget(target: BuildTarget): Bun.Build.CompileTarget {
    const baseline = target.baseline ? '-baseline' : ''

    if (target.os === 'darwin') return `bun-darwin-${target.arch}${baseline}`

    return target.libc === 'musl'
      ? `bun-linux-${target.arch}${baseline}-musl`
      : `bun-linux-${target.arch}${baseline}`
  },

  manifestFields(target: BuildTarget): PlatformManifestFields {
    if (target.os === 'darwin') return { os: ['darwin'], cpu: [target.arch] }

    return { os: ['linux'], cpu: [target.arch], libc: [target.libc] }
  },

  find(packageName: string): BuildTarget | undefined {
    return BUILD_TARGETS.find(target => BuildTarget.packageName(target) === packageName)
  },
} as const

export const Host = {
  // Keep in sync with mux_sesh_platform_candidates in bin/platform.sh; tests compare both.
  candidates(host: Host): readonly BuildTarget[] {
    const libcs: readonly (LinuxLibc | undefined)[] =
      host.os === 'linux' ? [host.libc, host.libc === 'musl' ? 'glibc' : 'musl'] : [undefined]

    return libcs.flatMap(libc =>
      variants(host).flatMap(baseline => {
        const target = BUILD_TARGETS.find(
          candidate =>
            candidate.os === host.os &&
            candidate.arch === host.arch &&
            candidate.baseline === baseline &&
            (candidate.os === 'darwin' || candidate.libc === libc)
        )

        return target ? [target] : []
      })
    )
  },
} as const
