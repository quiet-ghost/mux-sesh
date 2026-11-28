import { expect, test } from 'bun:test'
import { handleRenameSubmitWithFeedback } from '../src/app/action-feedback'
import { getDefaultConfig } from '../src/config'
import { workspaceToItem } from '../src/multiplexer/items'
import { MultiplexerError } from '../src/multiplexer/types'
import type { BackendKind, MultiplexerBackend, WorkspaceRef } from '../src/multiplexer/types'
import type { Config, Item } from '../src/types'
import { unsupportedBackend } from './fixtures/fake-backend'

function renameBackend(
  kind: BackendKind,
  rename: MultiplexerBackend['rename']
): MultiplexerBackend {
  return unsupportedBackend({
    kind,
    capabilities: { previousWorkspace: kind === 'tmux' },
    rename,
  })
}

function session(kind: BackendKind, id: string, title: string): Item {
  return workspaceToItem({
    backend: kind,
    id,
    title,
    path: `/fixture/${title}`,
    isActive: false,
    unitCount: 1,
  })
}

function harness(backend: MultiplexerBackend, config: Config, sessionItems: Item[]) {
  const messages: string[] = []
  const saved: Config[] = []
  let closed = 0
  let refreshes = 0

  return {
    messages,
    saved,
    closedCount: () => closed,
    refreshCount: () => refreshes,
    submit: (target: Item, name: string) =>
      handleRenameSubmitWithFeedback(
        target,
        name,
        () => {
          closed++
        },
        {
          backend,
          config,
          sessionItems,
          showToast: toast => {
            messages.push(`${toast.kind}: ${toast.message}`)
          },
          refreshItems: async () => {
            refreshes++
          },
          saveConfig: async next => {
            saved.push(next)
          },
          setConfig: () => {},
        }
      ),
  }
}

test('the message names the backend-normalized session name', async () => {
  const target = session('tmux', '$3', 'alpha')
  const backend = renameBackend('tmux', async (ref: WorkspaceRef) => ({ ...ref, title: 'my_app' }))
  const run = harness(backend, getDefaultConfig('/fixture'), [target])

  await run.submit(target, 'my.app')

  expect(run.messages).toEqual(["success: Session renamed to 'my_app'"])
  expect(run.closedCount()).toBe(1)
  expect(run.refreshCount()).toBe(1)
})

test('a failed rename keeps the draft open and says the name is unchanged', async () => {
  const target = session('tmux', '$3', 'alpha')

  const backend = renameBackend('tmux', async () => {
    throw new MultiplexerError('command-failed', 'duplicate session: beta')
  })

  const run = harness(backend, getDefaultConfig('/fixture'), [target])

  await run.submit(target, 'beta')

  expect(run.messages).toEqual([
    "error: Could not rename session 'alpha': duplicate session: beta The name is unchanged.",
  ])
  expect(run.closedCount()).toBe(0)
  expect(run.refreshCount()).toBe(0)
})

test('a pin on the renamed session follows it when the old name was unambiguous', async () => {
  const target = session('tmux', '$3', 'alpha')
  const config = { ...getDefaultConfig('/fixture'), pinnedSessions: ['alpha', 'other'] }
  const backend = renameBackend('tmux', async (ref: WorkspaceRef) => ({ ...ref, title: 'beta' }))
  const run = harness(backend, config, [target, session('tmux', '$4', 'other')])

  await run.submit(target, 'beta')

  expect(run.saved.map(saved => saved.pinnedSessions)).toEqual([['beta', 'other']])
})

test('a pin shared by duplicate labels is left alone and explained', async () => {
  const target = session('herdr', 'w1', 'api')
  const config = { ...getDefaultConfig('/fixture'), pinnedSessions: ['api'] }

  const backend = renameBackend('herdr', async (ref: WorkspaceRef) => ({
    ...ref,
    title: 'api-old',
  }))

  const run = harness(backend, config, [target, session('herdr', 'w2', 'api')])

  await run.submit(target, 'api-old')

  expect(run.saved).toEqual([])
  expect(run.messages).toEqual([
    "warning: Workspace renamed to 'api-old'. The pin on 'api' was kept because another workspace still uses that name.",
  ])
})
