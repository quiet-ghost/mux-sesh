import { expect, test } from 'bun:test'
import { Effect } from 'effect'
import { createEffectRuntime, readEffect } from '../src/app/effect-runtime'
import { MultiplexerError } from '../src/multiplexer/types'

test('the UI bridge distinguishes expected failure, defect, and interruption', async () => {
  const runtime = createEffectRuntime()
  const expected = new MultiplexerError('command-failed', 'fixture server stopped')
  const defect = new Error('fixture programming error')

  try {
    expect(await runtime.run(Effect.fail(expected))).toEqual({ kind: 'failure', error: expected })
    expect(await runtime.run(Effect.die(defect))).toEqual({ kind: 'defect', cause: defect })
    expect(await runtime.run(Effect.interrupt)).toEqual({ kind: 'interrupted' })
    expect(
      await runtime.run(
        readEffect(async () => {
          throw defect
        })
      )
    ).toEqual({
      kind: 'defect',
      cause: defect,
    })
  } finally {
    await runtime.dispose()
  }
})

test('disposing the application runtime interrupts active reads', async () => {
  const runtime = createEffectRuntime()
  const pending = runtime.run(Effect.never)
  await runtime.dispose()

  expect(await pending).toEqual({ kind: 'interrupted' })
})

test('aborted refresh cannot publish a late legacy result', async () => {
  const runtime = createEffectRuntime()
  const controller = new AbortController()
  const result = Promise.withResolvers<string>()
  const started = Promise.withResolvers<void>()

  const pending = runtime.run(
    readEffect(() => {
      started.resolve()

      return result.promise
    }),
    { signal: controller.signal }
  )

  try {
    await started.promise
    controller.abort()
    expect(await pending).toEqual({ kind: 'interrupted' })
    result.resolve('stale inventory')
    expect(await pending).toEqual({ kind: 'interrupted' })
  } finally {
    result.resolve('released')
    await runtime.dispose()
  }
})
