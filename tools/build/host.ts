import { existsSync, readFileSync } from 'fs'
import type { BuildArch, Host, LinuxLibc } from './targets'

function detectArch(arch: string): BuildArch | undefined {
  if (arch === 'x64' || arch === 'arm64') return arch

  return undefined
}

function commandOutput(command: string[]): string {
  try {
    const result = Bun.spawnSync(command, { stdout: 'pipe', stderr: 'pipe' })

    return `${result.stdout.toString()}${result.stderr.toString()}`
  } catch {
    return ''
  }
}

// Same checks as bin/platform.sh: Alpine marker first, then the libc named by `ldd --version`.
function detectLinuxLibc(): LinuxLibc {
  if (existsSync('/etc/alpine-release')) return 'musl'

  return commandOutput(['ldd', '--version']).toLowerCase().includes('musl') ? 'musl' : 'glibc'
}

// Unknown support counts as no AVX2, so the safe baseline build is preferred.
function detectAvx2(os: Host['os'], arch: BuildArch): boolean {
  if (arch !== 'x64') return false

  if (os === 'darwin') return commandOutput(['sysctl', '-n', 'hw.optional.avx2_0']).trim() === '1'

  try {
    return /\bavx2\b/.test(readFileSync('/proc/cpuinfo', 'utf8'))
  } catch {
    return false
  }
}

export function detectHost(): Host | undefined {
  const arch = detectArch(process.arch)

  if (!arch) return undefined

  if (process.platform === 'darwin') {
    return { os: 'darwin', arch, avx2: detectAvx2('darwin', arch) }
  }

  if (process.platform === 'linux') {
    return { os: 'linux', arch, libc: detectLinuxLibc(), avx2: detectAvx2('linux', arch) }
  }

  return undefined
}
