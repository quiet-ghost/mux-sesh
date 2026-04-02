import { stripAnsi } from '../util/ansi'

export function formatPanePreview(output: string): string[] {
  return stripAnsi(output)
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)
    .slice(-8)
}

export function sanitizeTmuxSessionName(name: string): string {
  return name.replace(/\./g, '_').replace(/ /g, '_')
}

export async function readTmuxValue(args: string[], errorMessage: string): Promise<string> {
  const proc = Bun.spawn(args)
  const output = await new Response(proc.stdout).text()
  await proc.exited

  if (proc.exitCode !== 0) {
    throw new Error(errorMessage)
  }

  const value = output.trim()
  if (!value) {
    throw new Error(errorMessage)
  }

  return value
}

export function formatWindowCommand(currentCommand: string): string {
  return ['bash', 'zsh', 'fish'].includes(currentCommand) ? '' : currentCommand
}
