import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildVersion, isCompiledBinary } from '../src/update/build'
import {
  detectInstallMethod,
  getDefaultRuntimePath,
  getInstalledVersion,
} from '../src/update/installation'
import { CURRENT_VERSION } from '../src/update/version'
import packageJson from '../package.json'

let root: string | undefined

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mux-sesh-compiled-install-'))
})

afterEach(async () => {
  const current = root
  root = undefined

  if (current) await rm(current, { recursive: true, force: true })
})

async function writePackage(directory: string, name: string, version: string): Promise<void> {
  await mkdir(join(directory, 'bin'), { recursive: true })
  await Bun.write(join(directory, 'package.json'), JSON.stringify({ name, version }))
}

function fixtureRoot(): string {
  if (!root) throw new Error('The compiled install fixture directory was not created')

  return root
}

describe('compiled binary detection', () => {
  test('recognizes modules inside the embedded filesystem', () => {
    expect(isCompiledBinary('/$bunfs/root/mux-sesh')).toBe(true)
    expect(isCompiledBinary(join(import.meta.dir, '../src/index.tsx'))).toBe(false)
  })

  test('source runs fall back to the package.json version', () => {
    expect(buildVersion()).toBeUndefined()
    expect(CURRENT_VERSION).toBe(packageJson.version)
  })

  test('compiled runs locate the install from the executable', () => {
    expect(getDefaultRuntimePath(true)).toBe(process.execPath)
    expect(getDefaultRuntimePath(false)).toBe(process.argv[1] ?? import.meta.path)
  })
})

describe('compiled install method', () => {
  test.each([
    ['/usr/lib/node_modules/mux-sesh/node_modules/mux-sesh-linux-x64/bin/mux-sesh', 'npm'],
    ['/usr/local/lib/node_modules/mux-sesh-darwin-arm64/bin/mux-sesh', 'npm'],
    [
      '/home/user/.bun/install/global/node_modules/mux-sesh-linux-x64-baseline-musl/bin/mux-sesh',
      'bun',
    ],
    ['/home/user/.bun/install/global/node_modules/mux-sesh/bin/mux-sesh', 'bun'],
  ] as const)('%s is a %s install', async (path, method) => {
    expect(await detectInstallMethod(path)).toBe(method)
  })

  test('unrelated packages that share the prefix are not mux-sesh installs', async () => {
    const checkout = fixtureRoot()
    const plugin = join(checkout, 'node_modules/mux-sesh-plugin')
    await writePackage(checkout, 'mux-sesh', '2.0.0')
    await writePackage(plugin, 'mux-sesh-plugin', '0.1.0')

    expect(await detectInstallMethod(join(plugin, 'bin/mux-sesh'))).toBe('source')
  })
})

describe('compiled installed version', () => {
  test('reads the platform package next to the binary when the main package is a sibling', async () => {
    const modules = join(fixtureRoot(), '.bun/install/global/node_modules')
    await writePackage(join(modules, 'mux-sesh'), 'mux-sesh', '2.0.0')
    await writePackage(join(modules, 'mux-sesh-linux-x64'), 'mux-sesh-linux-x64', '2.0.0')

    expect(await getInstalledVersion(join(modules, 'mux-sesh-linux-x64/bin/mux-sesh'))).toBe(
      '2.0.0'
    )
  })

  test('reads a platform package nested under the main package', async () => {
    const main = join(fixtureRoot(), 'lib/node_modules/mux-sesh')
    await writePackage(main, 'mux-sesh', '2.1.0')
    await writePackage(
      join(main, 'node_modules/mux-sesh-darwin-x64'),
      'mux-sesh-darwin-x64',
      '2.1.0'
    )

    expect(
      await getInstalledVersion(join(main, 'node_modules/mux-sesh-darwin-x64/bin/mux-sesh'))
    ).toBe('2.1.0')
  })

  test('ignores packages that only share the prefix', async () => {
    const plugin = join(fixtureRoot(), 'node_modules/mux-sesh-plugin')
    await writePackage(plugin, 'mux-sesh-plugin', '0.1.0')

    expect(await getInstalledVersion(join(plugin, 'bin/mux-sesh'))).toBeNull()
  })
})
