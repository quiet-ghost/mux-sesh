import { expect, test } from 'bun:test'
import { createEffectRuntime, type AppEffectRuntime } from '../src/app/effect-runtime'
import { createSessionInventory, type InventorySnapshot } from '../src/app/session-inventory'
import { getDefaultConfig } from '../src/config'
import { createHerdrBackend } from '../src/herdr/backend'
import { CommandTransportError } from '../src/multiplexer/command'
import type { MultiplexerBackend } from '../src/multiplexer/types'
import { ViewMode, type Config } from '../src/types'

const poll = { kind: 'agents-poll' } as const

// Agents polls go through the inventory owner, scoped to the Sessions view it refreshes.
function pollingInventory(effects: AppEffectRuntime, config: Config, backend: MultiplexerBackend) {
  const published: InventorySnapshot[] = []
  const defects: unknown[] = []

  const inventory = createSessionInventory({
    effects,
    measure: async (_name, run) => run(),
    publish: snapshot => published.push(snapshot),
    report: () => {},
    onDefect: cause => defects.push(cause),
  })

  inventory.observe({ viewMode: ViewMode.Sessions, config, backend })

  return { inventory, published, defects, context: { config, backend } }
}

test('Herdr refresh preserves inventory when a recording transport fails, then recovers', async () => {
  const calls: string[] = []
  let fail = true

  const effects = createEffectRuntime({
    async run(command) {
      calls.push(command.join(' '))

      if (fail) {
        throw new CommandTransportError({
          executable: 'herdr',
          phase: 'spawn',
          cause: new Error('fixture unavailable'),
        })
      }

      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          result: {
            type: 'session_snapshot',
            snapshot: {
              workspaces: [
                {
                  workspace_id: 'w1',
                  label: 'recovered',
                  tab_count: 1,
                  focused: false,
                  active_tab_id: 'w1:t1',
                },
              ],
              tabs: [],
              panes: [],
              layouts: [],
              agents: [],
            },
          },
        }),
      }
    },
  })

  const backend = createHerdrBackend({ runner: effects.runner, insideHerdr: true })

  const { inventory, published, defects, context } = pollingInventory(
    effects,
    getDefaultConfig('/fixture'),
    backend
  )

  try {
    const failed = await inventory.refresh(poll, context)
    expect(failed).toMatchObject({ kind: 'failed', failure: { _tag: 'CommandTransportError' } })
    expect(published).toEqual([])
    expect(inventory.status().kind).toBe('stale')
    fail = false
    const recovered = await inventory.refresh(poll, context)
    expect(recovered).toMatchObject({
      kind: 'published',
      snapshot: { sessionItems: [{ title: 'recovered', sessionId: 'w1' }] },
    })
    expect(inventory.status().kind).toBe('fresh')
    expect(calls).toEqual(['herdr api snapshot', 'herdr api snapshot'])
    expect(defects).toEqual([])
  } finally {
    inventory.dispose()
    await effects.dispose()
  }
})

test.each([
  { exitCode: 1, stdout: '', stderr: 'fixture server stopped', code: 'command-failed' },
  { exitCode: 0, stdout: '{invalid JSON', stderr: '', code: 'invalid-response' },
])('Herdr read failure $code stays in the expected error channel', async ({ code, ...result }) => {
  const effects = createEffectRuntime({ run: async () => result })
  const backend = createHerdrBackend({ runner: effects.runner, insideHerdr: true })
  const { inventory, context } = pollingInventory(effects, getDefaultConfig('/fixture'), backend)

  try {
    expect(await inventory.refresh(poll, context)).toMatchObject({
      kind: 'failed',
      failure: { code },
    })
  } finally {
    inventory.dispose()
    await effects.dispose()
  }
})
