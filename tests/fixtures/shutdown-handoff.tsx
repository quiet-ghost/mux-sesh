import { writeSync } from 'fs'
import { testRender } from '@opentui/react/test-utils'
import { act, useEffect } from 'react'
import { initializeShutdown, requestShutdown } from '../../src/util/shutdown'

// Usage: shutdown-handoff.tsx <ok|fail|missing>. Records teardown → handoff → exit order on stdout.
const mode = process.argv[2] ?? 'ok'

function HandoffProbe() {
  useEffect(
    () => () => {
      writeSync(1, `unmounted listeners=${process.stdin.listenerCount('data')}\n`)
    },
    []
  )

  return <text>Handoff probe</text>
}

const setup = await testRender(<HandoffProbe />, { width: 20, height: 4, consoleMode: 'disabled' })

initializeShutdown(setup.renderer)

process.once('exit', code => {
  writeSync(1, `exit code=${code} destroyed=${setup.renderer.isDestroyed}\n`)
})

const script =
  mode === 'fail'
    ? 'process.stdout.write("handoff\\n"); process.exit(3)'
    : 'process.stdout.write("handoff\\n")'

await act(async () => {
  await requestShutdown(0, {
    command:
      mode === 'missing' ? ['/mux-sesh-fixture/missing-attach'] : [process.execPath, '-e', script],
    description: "attach to tmux session 'fixture'",
  })
})
