import { spawn } from 'bun'
import type { InstallMethod } from '../types'

export async function detectInstallMethod(): Promise<InstallMethod> {
  const execPath = process.execPath.toLowerCase()

  const checks = [
    {
      name: 'npm' as const,
      command: () => spawn(['npm', 'list', '-g', '--depth=0']),
    },
    {
      name: 'bun' as const,
      command: () => spawn(['bun', 'pm', 'ls', '-g']),
    },
    {
      name: 'brew' as const,
      command: () => spawn(['brew', 'list', '--formula']),
    },
  ]

  checks.sort((a, b) => {
    const aMatch = execPath.includes(a.name)
    const bMatch = execPath.includes(b.name)
    if (aMatch && !bMatch) return -1
    if (!aMatch && bMatch) return 1
    return 0
  })

  for (const check of checks) {
    try {
      const proc = check.command()
      const output = await new Response(proc.stdout).text()

      if (output.includes('mux-sesh')) {
        return check.name
      }
    } catch (error) {
      continue
    }
  }
  return 'unknown'
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
      command = ['npm', 'install', '-g', `mux-sesh@${targetVersion}`]
      break
    case 'bun':
      command = ['bun', 'install', '-g', `mux-sesh@${targetVersion}`]
      break
    case 'brew':
      command = ['brew', 'upgrade', 'mux-sesh']
      break
  }
  try {
    const proc = spawn(command)
    await proc.exited
    return proc.exitCode === 0
  } catch (error) {
    console.error('Upgrade Failed:', error)
    return false
  }
}
