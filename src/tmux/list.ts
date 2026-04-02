import { spawn } from 'bun'
import type { Item } from '../types'
import { getLiveSessionGroupLabel } from '../util/path-display'

export async function listTmuxSessions(): Promise<Item[]> {
  const proc = spawn([
    'tmux',
    'list-sessions',
    '-F',
    '#{session_name}\t#{session_attached}\t#{session_windows}\t#{session_created}\t#{session_activity}\t#{session_path}',
  ])

  const output = await new Response(proc.stdout).text()
  const lines = output.trim().split('\n').filter(Boolean)

  return lines.map(line => {
    const [name, attached, windows, created, activity, sessionPath = ''] = line.split('\t')

    return {
      title: name,
      path: sessionPath,
      desc: getLiveSessionGroupLabel(sessionPath),
      isSession: true,
      itemKind: 'tmux' as const,
      isAttached: attached === '1',
      windowCount: windows,
      createdAt: parseInt(created, 10),
      lastActivity: parseInt(activity, 10),
    }
  })
}
