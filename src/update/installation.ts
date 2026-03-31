import type { InstallMethod } from '../types'

const PACKAGE_NAME = 'mux-sesh'

export async function detectInstallMethod(): Promise<InstallMethod> {
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
    } catch (error) {
      continue
    }
  }
  return 'unknown'
}

export function canAutoUpdate(method: InstallMethod): boolean {
  return method === 'npm' || method === 'bun'
}

export async function performUpgrade(
  method: InstallMethod,
  targetVersion: string
): Promise<boolean> {
  if (method === 'unknown') {
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
