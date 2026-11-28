import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { parseBuildArgs, readPackageVersion, resolveVersion } from '../tools/build/build'
import { binaryPath } from '../tools/build/compile'
import { pack } from '../tools/build/pack'
import { BuildTarget } from '../tools/build/targets'

const TEST_VERSION = '2.0.0-upgradecheck.0'
const TARGET = { os: 'linux', arch: 'x64', libc: 'glibc', baseline: false } as const

describe('build version option', () => {
  test('--version overrides the package.json version for the selected targets', () => {
    expect(parseBuildArgs(['--target', 'mux-sesh-linux-x64', '--version', TEST_VERSION])).toEqual({
      ok: true,
      targets: [TARGET],
      version: TEST_VERSION,
    })
  })

  test('without --version the package.json version is used', async () => {
    const parsed = parseBuildArgs(['--target', 'mux-sesh-linux-x64'])

    expect(parsed).toEqual({ ok: true, targets: [TARGET], version: undefined })
    expect(await resolveVersion(undefined)).toBe(await readPackageVersion())
    expect(await resolveVersion(TEST_VERSION)).toBe(TEST_VERSION)
  })

  test('rejects versions npm would not accept', () => {
    for (const version of ['2.0', 'v2.0.0', '2.0.0-', 'latest']) {
      const parsed = parseBuildArgs(['--version', version])

      expect(parsed.ok).toBe(false)
      expect(parsed.ok ? '' : parsed.message).toContain(version)
    }
  })
})

describe('pack version option', () => {
  let npmRoot: string

  beforeEach(async () => {
    npmRoot = await mkdtemp(join(tmpdir(), 'mux-sesh-pack-version-'))
  })

  afterEach(async () => {
    await rm(npmRoot, { recursive: true, force: true })
  })

  test('stamps the requested version on the main and platform packages', async () => {
    const binary = binaryPath(TARGET, npmRoot)
    await mkdir(dirname(binary), { recursive: true })
    await Bun.write(binary, '#!/bin/sh\n')

    const outcome = await pack([TARGET], { version: TEST_VERSION, npmRoot })

    expect(outcome).toEqual({
      ok: true,
      directories: [join(npmRoot, BuildTarget.packageName(TARGET)), join(npmRoot, 'mux-sesh')],
    })

    const platform: unknown = await Bun.file(
      join(npmRoot, 'mux-sesh-linux-x64/package.json')
    ).json()

    const main: unknown = await Bun.file(join(npmRoot, 'mux-sesh/package.json')).json()

    expect(platform).toMatchObject({ name: 'mux-sesh-linux-x64', version: TEST_VERSION })
    expect(main).toMatchObject({
      name: 'mux-sesh',
      version: TEST_VERSION,
      optionalDependencies: { 'mux-sesh-linux-x64': TEST_VERSION },
    })
  })
})
