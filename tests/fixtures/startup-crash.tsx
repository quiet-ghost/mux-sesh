import { writeSync } from 'fs'
import { testRender } from '@opentui/react/test-utils'
import { act, useState } from 'react'
import { AppRecoveryBoundary } from '../../src/app'
import { useAppCoreState } from '../../src/app/core-state'
import { getSessionCommandState } from '../../src/app/derived'
import { useSessionInventory } from '../../src/app/session-inventory'
import { useAppStartup, type StartupDependencies } from '../../src/app/state'
import { useEffectRuntime } from '../../src/app/use-effect-runtime'
import { getDefaultConfig } from '../../src/config'
import type { MultiplexerBackend } from '../../src/multiplexer'
import { initializeShutdown } from '../../src/lifecycle/shutdown'

// A render crash while startup still waits on its backend probe, as when Herdr is slow to answer
// `herdr status`. Unmounting the crashed tree interrupts the probe; once that interruption has
// settled the fixture prints the frames as JSON, or the process ends in a fatal shutdown.
const passthroughMeasure = async <T,>(_name: string, run: () => Promise<T>): Promise<T> => run()
const noMark = () => {}

const firstProbe = Promise.withResolvers<void>()
const firstProbeEnded = Promise.withResolvers<void>()
const neverResolves = new Promise<MultiplexerBackend>(() => {})
let probes = 0

const dependencies: StartupDependencies = {
  loadConfig: async () => getDefaultConfig('/fixture'),
  resolveBackend: async (_config, runner) => {
    probes++

    if (probes > 1) return neverResolves

    firstProbe.resolve()

    try {
      await runner.run([process.execPath, '-e', 'setTimeout(() => {}, 5000)'])
    } finally {
      firstProbeEnded.resolve()
    }

    throw new Error('The startup-crash fixture probe finished instead of being interrupted')
  },
}

interface CrashTrigger {
  crash?: () => void
}

const trigger: CrashTrigger = {}

function StartingApp() {
  const [crashed, setCrashed] = useState(false)
  trigger.crash = () => setCrashed(true)

  const effects = useEffectRuntime()
  const core = useAppCoreState()

  const derived = getSessionCommandState(
    core.appMode,
    core.viewMode,
    core.items,
    core.cursor,
    core.agentCursor,
    core.config,
    ''
  )

  const inventory = useSessionInventory(effects, passthroughMeasure, {
    ...core,
    ...derived,
    setMessage: core.setInventoryStatus,
  })

  const { startup } = useAppStartup(
    effects,
    passthroughMeasure,
    inventory,
    noMark,
    core.setConfig,
    core.setBackend,
    core.setAppMode,
    core.setProjectSourceItems,
    dependencies
  )

  if (crashed) throw new Error('fixture crash during startup')

  return <text>{`startup ${startup.kind}`}</text>
}

const setup = await testRender(
  <AppRecoveryBoundary>{retryKey => <StartingApp key={retryKey} />}</AppRecoveryBoundary>,
  { width: 80, height: 24, consoleMode: 'disabled' }
)

initializeShutdown(setup.renderer)

async function frame(): Promise<string> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Bun.sleep(10)
  })
  await act(async () => setup.renderOnce())

  return setup.captureCharFrame()
}

await firstProbe.promise

await act(async () => trigger.crash?.())

await firstProbeEnded.promise

const crashed = await frame()

await act(async () => setup.mockInput.pressKey('r'))

const retried = await frame()

writeSync(1, JSON.stringify({ crashed, retried, probes }))

process.exit(0)
