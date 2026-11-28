import { existsSync, readFileSync, writeSync } from 'fs'
import { act } from 'react'
import type { LiveWorkspace, MultiplexerBackend } from '../../src/multiplexer'
import type { FocusOutcome } from '../../src/multiplexer/types'
import { OPEN_HISTORY } from '../../src/search/frecency-store'
import { initializeShutdown } from '../../src/lifecycle/shutdown'
import { renderSessionScreen } from './session-screen'

// Usage: open-history-handoff.tsx <select|launch|off> <project dir> <history file>
// Drives the production screen with the production history. Teardown is the first step of a
// handoff, so the file as it stands when the renderer is destroyed shows what was written first.
const [mode = 'select', projectPath = '', historyPath = ''] = process.argv.slice(2)

if (!['select', 'launch', 'off'].includes(mode) || !projectPath || !historyPath) {
  throw new Error(
    'open-history-handoff.tsx requires <select|launch|off> <project dir> <history file>'
  )
}

const script = `process.stdout.write('handoff ran\\n')`

const handoff: FocusOutcome = {
  kind: 'handoff',
  handoff: { command: [process.execPath, '-e', script], description: 'attach to the fixture' },
}

const workspaces: LiveWorkspace[] = [
  {
    backend: 'herdr',
    id: 'w1',
    title: 'alpha',
    path: '/fixture/alpha',
    isActive: true,
    unitCount: 1,
  },
  {
    backend: 'herdr',
    id: 'w2',
    title: 'beta',
    path: '/fixture/beta',
    isActive: false,
    unitCount: 1,
  },
]

function unsupported(): never {
  throw new Error('The open-history handoff fixture does not implement that operation')
}

const backend: MultiplexerBackend = {
  kind: 'herdr',
  capabilities: { previousWorkspace: false },
  list: async () => workspaces,
  details: async workspace => ({
    workspace,
    isActive: false,
    unitLabel: 'Tabs',
    units: [],
    agents: [],
  }),
  open: async () => handoff,
  create: async input => ({
    workspace: { backend: 'herdr', id: 'w9', title: input.title },
    rootPaneId: 'w9:p1',
  }),
  start: async () => {},
  openOrCreate: unsupported,
  rename: unsupported,
  close: unsupported,
  current: unsupported,
  directory: unsupported,
  openEditor: unsupported,
}

const screen = await renderSessionScreen(
  { width: 100, height: 24 },
  {
    backend,
    openHistory: OPEN_HISTORY,
    config: { searchHistory: mode !== 'off', defaultSession: { startupCommand: 'true' } },
    projects: [
      {
        title: 'gamma',
        desc: projectPath,
        path: projectPath,
        isSession: false,
        itemKind: 'project',
      },
    ],
  }
)

initializeShutdown(screen.renderer)

screen.renderer.once('destroy', () => {
  const recorded = existsSync(historyPath) ? readFileSync(historyPath, 'utf8') : 'nothing\n'
  writeSync(1, `at teardown: ${recorded}`)
})

process.once('exit', code => {
  writeSync(1, `exit code=${code}\n`)
})

try {
  await screen.settle()

  if (mode === 'launch') {
    await screen.pressKey('n')
    await screen.settle()
  } else {
    await screen.pressKey('ARROW_DOWN')
  }

  // The open, its record and the handoff run past the key press, so the wait stays inside act().
  await act(async () => {
    await screen.pressKey('RETURN')
    // The handoff exits the process; reaching the end of this wait means it never ran.
    await Bun.sleep(5000)
  })
  throw new Error(`The ${mode} open did not hand the terminal over`)
} finally {
  screen.destroy()
}
