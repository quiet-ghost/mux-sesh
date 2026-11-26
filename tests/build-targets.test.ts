import { describe, expect, test } from 'bun:test'
import { BUILD_TARGETS, BuildTarget, Host } from '../tools/build/targets'

const names = (targets: readonly BuildTarget[]) =>
  targets.map(target => BuildTarget.packageName(target))

describe('build targets', () => {
  test('ship every supported tmux/Herdr platform under unique package names', () => {
    expect(names(BUILD_TARGETS)).toEqual([
      'mux-sesh-linux-x64',
      'mux-sesh-linux-x64-baseline',
      'mux-sesh-linux-arm64',
      'mux-sesh-linux-x64-musl',
      'mux-sesh-linux-x64-baseline-musl',
      'mux-sesh-linux-arm64-musl',
      'mux-sesh-darwin-x64',
      'mux-sesh-darwin-x64-baseline',
      'mux-sesh-darwin-arm64',
    ])
  })

  test('map to Bun compile targets', () => {
    expect(BUILD_TARGETS.map(target => BuildTarget.bunTarget(target))).toEqual([
      'bun-linux-x64',
      'bun-linux-x64-baseline',
      'bun-linux-arm64',
      'bun-linux-x64-musl',
      'bun-linux-x64-baseline-musl',
      'bun-linux-arm64-musl',
      'bun-darwin-x64',
      'bun-darwin-x64-baseline',
      'bun-darwin-arm64',
    ])
  })

  test('constrain npm installs by os, cpu, and Linux libc', () => {
    expect(
      BuildTarget.manifestFields({ os: 'linux', arch: 'arm64', libc: 'musl', baseline: false })
    ).toEqual({
      os: ['linux'],
      cpu: ['arm64'],
      libc: ['musl'],
    })
    expect(BuildTarget.manifestFields({ os: 'darwin', arch: 'x64', baseline: true })).toEqual({
      os: ['darwin'],
      cpu: ['x64'],
    })
  })

  test('find targets by package name', () => {
    expect(BuildTarget.find('mux-sesh-linux-x64-baseline-musl')).toEqual({
      os: 'linux',
      arch: 'x64',
      libc: 'musl',
      baseline: true,
    })
    expect(BuildTarget.find('mux-sesh-win32-x64')).toBeUndefined()
  })
})

describe('host candidates', () => {
  test('glibc x64 with AVX2 prefers the default build, then baseline, then musl builds', () => {
    expect(names(Host.candidates({ os: 'linux', arch: 'x64', libc: 'glibc', avx2: true }))).toEqual(
      [
        'mux-sesh-linux-x64',
        'mux-sesh-linux-x64-baseline',
        'mux-sesh-linux-x64-musl',
        'mux-sesh-linux-x64-baseline-musl',
      ]
    )
  })

  test('x64 without AVX2 prefers baseline builds', () => {
    expect(names(Host.candidates({ os: 'linux', arch: 'x64', libc: 'musl', avx2: false }))).toEqual(
      [
        'mux-sesh-linux-x64-baseline-musl',
        'mux-sesh-linux-x64-musl',
        'mux-sesh-linux-x64-baseline',
        'mux-sesh-linux-x64',
      ]
    )
    expect(names(Host.candidates({ os: 'darwin', arch: 'x64', avx2: false }))).toEqual([
      'mux-sesh-darwin-x64-baseline',
      'mux-sesh-darwin-x64',
    ])
  })

  test('arm64 has no baseline variant', () => {
    expect(names(Host.candidates({ os: 'darwin', arch: 'arm64', avx2: false }))).toEqual([
      'mux-sesh-darwin-arm64',
    ])
    expect(
      names(Host.candidates({ os: 'linux', arch: 'arm64', libc: 'musl', avx2: false }))
    ).toEqual(['mux-sesh-linux-arm64-musl', 'mux-sesh-linux-arm64'])
  })
})
