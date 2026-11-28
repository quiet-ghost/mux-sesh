import { expect, test } from 'bun:test'
import { CommandTransportError, createCommandRunner } from '../src/multiplexer/command'
import { probeBackendAvailability, probeHerdrAvailability } from '../src/multiplexer/resolve'

test('missing executables reject instead of fabricating exit 127', async () => {
  const runner = createCommandRunner()
  expect.assertions(1)

  try {
    await runner.run(['/mux-sesh-fixture/missing-command'])
  } catch (cause) {
    expect(cause).toMatchObject({
      _tag: 'CommandTransportError',
      phase: 'spawn',
      executable: '/mux-sesh-fixture/missing-command',
    })
  }
})

test('env adds variables over the parent environment without replacing it', async () => {
  const result = await createCommandRunner().run(
    [
      process.execPath,
      '-e',
      'console.log(process.env.MUX_SESH_FIXTURE_VAR, Boolean(process.env.PATH))',
    ],
    { env: { MUX_SESH_FIXTURE_VAR: 'set-by-caller' } }
  )

  expect(result.stdout).toBe('set-by-caller true\n')
})

test('a process that actually exits 127 remains ordinary command data', async () => {
  const result = await createCommandRunner().run([
    process.execPath,
    '-e',
    'console.log("fixture stdout"); console.error("fixture stderr"); process.exit(127)',
  ])

  expect(result).toEqual({
    exitCode: 127,
    stdout: 'fixture stdout\n',
    stderr: 'fixture stderr\n',
  })
})

test('availability probes recognize missing executables without a synthetic exit code', async () => {
  const runner = createCommandRunner()

  const missing = {
    run: () => runner.run(['/mux-sesh-fixture/missing-command']),
  }

  expect(await probeBackendAvailability(missing)).toEqual({
    tmux: { installed: false, running: false },
    herdr: { installed: false, running: false },
  })
})

test('an actual Herdr exit 127 means the executable ran, not that spawn failed', async () => {
  expect(
    await probeHerdrAvailability({
      run: async () => ({ exitCode: 127, stdout: '', stderr: 'fixture exit' }),
    })
  ).toEqual({ installed: true, running: false })
})

test('availability probes propagate transport failures other than missing executables', async () => {
  const failure = new CommandTransportError({
    executable: 'herdr',
    phase: 'spawn',
    cause: { code: 'EACCES' },
  })

  expect.assertions(1)

  try {
    await probeHerdrAvailability({
      run: async () => {
        throw failure
      },
    })
  } catch (cause) {
    expect(cause).toBe(failure)
  }
})
