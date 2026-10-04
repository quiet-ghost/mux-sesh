import { writeSync } from 'fs'
import { testRender } from '@opentui/react/test-utils'
import { act, isValidElement } from 'react'
import { App } from '@/app'
import { handleNewSessionSubmitWithSearch } from '@/app/handlers'
import { captureInvocationCwd } from '@/cli/invocation-cwd'
import { getDefaultConfig } from '@/config'
import type { MultiplexerBackend, OpenWorkspaceInput } from '@/multiplexer'
import { initializeShutdown } from '@/util/shutdown'

const invocationCwd = captureInvocationCwd()
const created: OpenWorkspaceInput[] = []
function unexpectedBackendCall(): never {
  throw new Error('The wrapper probe must only record session creation')
}
const backend: MultiplexerBackend = {
  kind: 'herdr',
  capabilities: { previousWorkspace: false },
  async openOrCreate(input) {
    created.push(input)
  },
  list: unexpectedBackendCall,
  open: unexpectedBackendCall,
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
  if (process.argv[2] === 'launch') {
    const input = process.argv[3]
    if (!input) throw new Error('The wrapper launch probe requires an input')
    await act(async () => {
      await handleNewSessionSubmitWithSearch(input, {
        invocationCwd,
        backend,
        config: getDefaultConfig(),
        items: [],
        sessionItems: [],
        cursor: 0,
        showMessage: message => {
          throw new Error(message)
        },
        refreshItems: unexpectedBackendCall,
      })
    })
    throw new Error('The wrapper launch probe returned without a successful session handoff')
  }
} finally {
  act(() => setup.renderer.destroy())
}
