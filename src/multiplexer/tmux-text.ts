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

export function formatWindowCommand(currentCommand: string): string {
  return ['bash', 'zsh', 'fish'].includes(currentCommand) ? '' : currentCommand
}
