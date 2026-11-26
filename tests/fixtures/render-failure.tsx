import { writeSync } from 'fs'
import { testRender } from '@opentui/react/test-utils'
import { act, useState } from 'react'
import { AppRecoveryBoundary } from '../../src/app'
import { initializeShutdown } from '../../src/util/shutdown'

// Usage: render-failure.tsx <repeat|error-view>. Both modes must end in a fatal shutdown.
const mode = process.argv[2]

function persistentFailure(): never {
  throw new Error('fixture persistent render failure token=fixture-render-secret')
}

// Fails only once triggered, so the fault lands after shutdown ownership is installed.
interface FailureTrigger {
  fail?: () => void
}

const trigger: FailureTrigger = {}

function FailingApp() {
  const [failing, setFailing] = useState(false)
  trigger.fail = () => setFailing(true)

  if (failing) throw new Error('fixture app failure token=fixture-render-secret')

  return <text>app</text>
}

function ThrowingErrorView(): never {
  throw new Error('fixture error view failure token=fixture-render-secret')
}

const tree =
  mode === 'repeat' ? (
    <>
      <box renderBefore={persistentFailure} />
      <AppRecoveryBoundary>{() => <text>app</text>}</AppRecoveryBoundary>
    </>
  ) : (
    <AppRecoveryBoundary ErrorView={ThrowingErrorView}>{() => <FailingApp />}</AppRecoveryBoundary>
  )

const setup = await testRender(tree, { width: 40, height: 10, consoleMode: 'disabled' })

initializeShutdown(setup.renderer)

process.once('exit', code => {
  writeSync(1, `exit code=${code} destroyed=${setup.renderer.isDestroyed}\n`)
})

await act(async () => trigger.fail?.())

for (let pass = 0; pass < 5; pass++) {
  await act(async () => {
    await setup.renderOnce()
    await Bun.sleep(5)
  })
}

throw new Error('Render-failure fixture did not shut down')
