import { writeSync } from 'fs'
import { join } from 'path'
import { testRender } from '@opentui/react/test-utils'
import { act, isValidElement } from 'react'
import { App } from '@/app'
import { handleNewSessionSubmitWithPreview } from '@/app/action-feedback'
import { captureInvocationCwd } from '@/cli/invocation-cwd'
import { getDefaultConfig } from '@/config'
import type { MultiplexerBackend, OpenWorkspaceInput } from '@/multiplexer'
import type { CloneServices } from '@/sessions/clone-plan'
import { previewLaunch } from '@/sessions/launch-plan'
import { initializeShutdown } from '@/lifecycle/shutdown'

const invocationCwd = captureInvocationCwd()
const created: OpenWorkspaceInput[] = []

function unexpectedBackendCall(): never {
  throw new Error('The wrapper probe must only record session creation')
}

// The probe is copied alone into an install directory, so it carries its own git refusal.
const NO_GIT: CloneServices = {
  inspect: { run: unexpectedBackendCall },
  clone: { run: unexpectedBackendCall },
}

const backend: MultiplexerBackend = {
  kind: 'herdr',
  capabilities: { previousWorkspace: false },
  async openOrCreate(input) {
    created.push(input)

    return { kind: 'focused' }
  },
  async create(input) {
    created.push(input)

    return {
      workspace: { backend: 'herdr', id: 'w-probe', title: input.title },
      rootPaneId: 'w-probe:p1',
    }
  },
  async start() {},
  async open() {
    return { kind: 'focused' }
  },
  list: unexpectedBackendCall,
  rename: unexpectedBackendCall,
  close: unexpectedBackendCall,
  current: unexpectedBackendCall,
  directory: unexpectedBackendCall,
  details: unexpectedBackendCall,
  openEditor: unexpectedBackendCall,
}

const app = <App invocationCwd={invocationCwd} />

const setup = await testRender(
  <text>{isValidElement(app) && app.type === App ? 'source ready' : 'wrong source'}</text>,
  {
    width: 30,
    height: 4,
    consoleMode: 'disabled',
  }
)

try {
  await setup.renderOnce()
  const sourceReady = setup.captureCharFrame().includes('source ready')
  initializeShutdown(setup.renderer)
  process.once('exit', () => {
    writeSync(
      1,
      JSON.stringify({
        invocationCwd,
        args: process.argv.slice(2),
        sourceReady,
        handoffPresent: process.env.MUX_SESH_INVOCATION_CWD !== undefined,
        created,
      })
    )
  })

  if (process.argv[2] === 'launch' || process.argv[2] === 'launch-selected') {
    const input = process.argv[3]

    if (!input) throw new Error('The wrapper launch probe requires an input')

    // launch-selected: empty query with one highlighted project row at the given directory.
    const selected = process.argv[2] === 'launch-selected'

    const items = selected
      ? [
          {
            title: input,
            desc: '',
            path: join(invocationCwd, input),
            isSession: false,
            itemKind: 'project' as const,
          },
        ]
      : []

    const config = getDefaultConfig()

    const preview = previewLaunch(selected ? '' : input, items[0], {
      config,
      backend: backend.kind,
      invocationCwd,
      liveSessions: [],
      clone: NO_GIT,
    })

    await act(async () => {
      await handleNewSessionSubmitWithPreview(preview, {
        clone: NO_GIT,
        launchGuard: { active: false },
        backend,
        showToast: toast => {
          throw new Error(toast.message)
        },
        showOutcome: report => {
          throw new Error(report.title)
        },
        refreshItems: unexpectedBackendCall,
      })
    })
    throw new Error('The wrapper launch probe returned without a successful session handoff')
  }
} finally {
  act(() => setup.renderer.destroy())
}
