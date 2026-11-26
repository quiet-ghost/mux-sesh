import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { InstallMethod } from '../types'
import { isCompiledBinary } from './build'

const PACKAGE_NAME = 'mux-sesh'

// Compiled installs run from a platform package such as mux-sesh-linux-x64 or mux-sesh-darwin-arm64.
const PACKAGE_DIRECTORY = String.raw`${PACKAGE_NAME}(?:-(?:linux|darwin)-[a-z0-9-]+)?`

const BUN_GLOBAL_PACKAGE_PATH = new RegExp(
  String.raw`/\.bun/install/global/node_modules/${PACKAGE_DIRECTORY}/`
)

const NODE_MODULES_PACKAGE_PATH = new RegExp(String.raw`/node_modules/${PACKAGE_DIRECTORY}/`)

const isMuxSeshPackage = Schema.is(
  Schema.Struct({
    name: Schema.Union([
      Schema.Literal(PACKAGE_NAME),
      Schema.TemplateLiteral([
        `${PACKAGE_NAME}-`,
        Schema.Literals(['linux', 'darwin']),
        '-',
        Schema.String,
      ]),
    ]),
  })
)

const decodePackageVersion = Schema.decodeUnknownOption(Schema.Struct({ version: Schema.String }))

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}

// A compiled binary's modules live in its embedded filesystem; only the executable shows the install location.
export function getDefaultRuntimePath(compiled = isCompiledBinary()): string {
  return compiled ? process.execPath : (process.argv[1] ?? import.meta.path)
}

async function findPackageRoot(startPath: string): Promise<string | null> {
  let current = normalizePath(startPath)

  if (!current) {
    return null
  }

  const lastSlash = current.lastIndexOf('/')

  if (lastSlash === -1) {
    return null
  }

  current = current.slice(0, lastSlash)

  while (current) {
    const packageFile = Bun.file(`${current}/package.json`)

    if (await packageFile.exists()) {
      try {
        const packageJson: unknown = await packageFile.json()

        if (isMuxSeshPackage(packageJson)) {
          return current
        }
      } catch {
        return null
      }
    }

    const parent = current.slice(0, current.lastIndexOf('/')) || '/'

    if (parent === current) {
      return null
    }

    current = parent
  }

  return null
}

async function detectInstallMethodFromPath(runtimePath: string): Promise<InstallMethod> {
  const normalizedPath = normalizePath(runtimePath)

  if (BUN_GLOBAL_PACKAGE_PATH.test(normalizedPath)) {
    return 'bun'
  }

  if (normalizedPath.includes(`/Cellar/${PACKAGE_NAME}/`)) {
    return 'brew'
  }

  if (NODE_MODULES_PACKAGE_PATH.test(normalizedPath)) {
    return 'npm'
  }

  return (await findPackageRoot(normalizedPath)) ? 'source' : 'unknown'
}

export async function detectInstallMethod(
  runtimePath = getDefaultRuntimePath()
): Promise<InstallMethod> {
  const activeMethod = await detectInstallMethodFromPath(runtimePath)

  if (activeMethod !== 'unknown') {
    return activeMethod
  }

  const checks = [
    {
      name: 'npm' as const,
      command: () => Bun.spawn(['npm', 'list', '-g', '--depth=0'], { stderr: 'ignore' }),
    },
    {
      name: 'bun' as const,
      command: () => Bun.spawn(['bun', 'pm', 'ls', '-g'], { stderr: 'ignore' }),
    },
    {
      name: 'brew' as const,
      command: () => Bun.spawn(['brew', 'list', '--formula'], { stderr: 'ignore' }),
    },
  ]

  for (const check of checks) {
    try {
      const proc = check.command()
      const output = await new Response(proc.stdout).text()

      if (output.includes(PACKAGE_NAME)) {
        return check.name
      }
    } catch {
      continue
    }
  }

  return 'unknown'
}

export function canAutoUpdate(method: InstallMethod): boolean {
  return method === 'npm' || method === 'bun'
}

export async function getInstalledVersion(
  runtimePath = getDefaultRuntimePath()
): Promise<string | null> {
  const packageRoot = await findPackageRoot(runtimePath)

  if (!packageRoot) {
    return null
  }

  try {
    const packageJson: unknown = await Bun.file(`${packageRoot}/package.json`).json()

    return Option.getOrNull(Option.map(decodePackageVersion(packageJson), pkg => pkg.version))
  } catch (error) {
    console.error('Failed to read installed version:', error)

    return null
  }
}

export async function performUpgrade(
  method: InstallMethod,
  targetVersion: string
): Promise<boolean> {
  if (method === 'unknown' || method === 'source') {
    return false
  }

  let command: string[]

  switch (method) {
    case 'npm':
      command = ['npm', 'install', '-g', `${PACKAGE_NAME}@${targetVersion}`]
      break
    case 'bun':
      command = ['bun', 'install', '-g', `${PACKAGE_NAME}@${targetVersion}`]
      break
    case 'brew':
      command = ['brew', 'upgrade', PACKAGE_NAME]
      break
  }

  try {
    const proc = Bun.spawn(command, { stdout: 'ignore', stderr: 'ignore' })
    await proc.exited

    return proc.exitCode === 0
  } catch (error) {
    console.error('Upgrade Failed:', error)

    return false
  }
}
