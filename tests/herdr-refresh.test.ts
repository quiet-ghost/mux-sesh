import { expect, test } from 'bun:test'
import { createEffectRuntime } from '../src/app/effect-runtime'
import { refreshHerdrInventory } from '../src/app/herdr-refresh'
import { getDefaultConfig } from '../src/config'
import { createHerdrBackend } from '../src/herdr/backend'
import { CommandTransportError } from '../src/multiplexer/command'

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
  const config = getDefaultConfig('/fixture')
  const measure = async <A>(_name: string, run: () => Promise<A>) => run()

  try {
    const failed = await refreshHerdrInventory(effects, config, backend, measure)
    expect(failed).toMatchObject({ kind: 'failure', error: { _tag: 'CommandTransportError' } })
    fail = false
    const recovered = await refreshHerdrInventory(effects, config, backend, measure)
    expect(recovered).toMatchObject({
      kind: 'success',
      value: { sessionItems: [{ title: 'recovered', sessionId: 'w1' }] },
    })
    expect(calls).toEqual(['herdr api snapshot', 'herdr api snapshot'])
  } finally {
    await effects.dispose()
  }
})

test.each([
  { exitCode: 1, stdout: '', stderr: 'fixture server stopped', code: 'command-failed' },
  { exitCode: 0, stdout: '{invalid JSON', stderr: '', code: 'invalid-response' },
])('Herdr read failure $code stays in the expected error channel', async ({ code, ...result }) => {
  const effects = createEffectRuntime({ run: async () => result })
  const backend = createHerdrBackend({ runner: effects.runner, insideHerdr: true })

  try {
    expect(
      await refreshHerdrInventory(
        effects,
        getDefaultConfig('/fixture'),
        backend,
        async (_name, run) => run()
      )
    ).toMatchObject({ kind: 'failure', error: { code } })
  } finally {
    await effects.dispose()
  }
})
