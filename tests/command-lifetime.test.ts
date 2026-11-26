import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createEffectRuntime } from '../src/app/effect-runtime'
import { createCommandRunner, type CommandPolicy } from '../src/multiplexer/command'

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mux-sesh-command-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

function ownedProcess(script: string): string[] {
  const pidFile = join(directory, 'pid')

  return [
    process.execPath,
    '-e',
    `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ${script}`,
  ]
}

async function ownedPid(): Promise<number> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const text = await readFile(join(directory, 'pid'), 'utf8').catch(() => '')

    if (text) return Number(text)
    await Bun.sleep(10)
  }

  throw new Error('The owned fixture process never reported its pid')
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

async function rejection(run: Promise<unknown>): Promise<Error> {
  try {
    await run
  } catch (cause) {
    if (cause instanceof Error) return cause

    throw new Error('The command rejected with a non-Error value', { cause })
  }

  throw new Error('Expected the command to reject')
}

const KEEP_ALIVE = 'setInterval(() => {}, 1000)'

test('noisy stderr cannot block stdout and is retained within its bound', async () => {
  const policy: Partial<CommandPolicy> = { maxStderrBytes: 1024 }

  const result = await createCommandRunner(policy).run([
    process.execPath,
    '-e',
    "const line = 'x'.repeat(1023) + '\\n'; for (let i = 0; i < 2048; i++) process.stderr.write(line); console.log('done')",
  ])

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toBe('done\n')
  expect(result.stderr.startsWith('x'.repeat(1023))).toBe(true)
  expect(result.stderr.endsWith('… (stderr truncated)')).toBe(true)
  expect(result.stderr.length).toBeLessThan(1024 + 32)
})

test('stdout beyond its limit stops the owned process and discards the result', async () => {
  const runner = createCommandRunner({ maxStdoutBytes: 4096 })

  const failure = await rejection(
    runner.run(ownedProcess(`process.stdout.write('y'.repeat(65536)); ${KEEP_ALIVE}`))
  )

  expect(failure).toMatchObject({ _tag: 'CommandOutputLimitError', limitBytes: 4096 })
  expect(isAlive(await ownedPid())).toBe(false)
})

test('a deadline stops the owned process and reports a timeout', async () => {
  const runner = createCommandRunner({ timeoutMs: 150 })

  const failure = await rejection(runner.run(ownedProcess(KEEP_ALIVE)))

  expect(failure).toMatchObject({ _tag: 'CommandTimeoutError', timeoutMs: 150 })
  expect(isAlive(await ownedPid())).toBe(false)
})

test('a process that ignores SIGTERM is killed after the grace period', async () => {
  const runner = createCommandRunner({ timeoutMs: 150, killGraceMs: 100 })

  const failure = await rejection(
    runner.run(ownedProcess(`process.on('SIGTERM', () => {}); ${KEEP_ALIVE}`))
  )

  expect(failure).toMatchObject({ _tag: 'CommandTimeoutError' })
  expect(isAlive(await ownedPid())).toBe(false)
})

test('cancellation stops the owned process and never publishes its output', async () => {
  const controller = new AbortController()

  const run = createCommandRunner().run(ownedProcess(`console.log('late'); ${KEEP_ALIVE}`), {
    signal: controller.signal,
  })

  const pid = await ownedPid()
  controller.abort()

  expect(await rejection(run)).toMatchObject({ _tag: 'CommandInterrupted' })
  expect(isAlive(pid)).toBe(false)
})

test('an already-cancelled command is never started', async () => {
  const controller = new AbortController()
  controller.abort()

  const failure = await rejection(
    createCommandRunner().run(ownedProcess(''), { signal: controller.signal })
  )

  expect(failure).toMatchObject({ _tag: 'CommandInterrupted' })
  expect(await readFile(join(directory, 'pid'), 'utf8').catch(() => 'not started')).toBe(
    'not started'
  )
})

test('disposing the application runtime stops in-flight owned commands', async () => {
  const effects = createEffectRuntime(createCommandRunner())
  const run = effects.runner.run(ownedProcess(KEEP_ALIVE))
  const pid = await ownedPid()

  await effects.dispose()

  expect(await rejection(run)).toMatchObject({ _tag: 'CommandInterrupted' })
  expect(isAlive(pid)).toBe(false)
})
