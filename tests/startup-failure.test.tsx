import { afterEach, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'
import { useAppCoreState } from '../src/app/core-state'
import { getSessionCommandState } from '../src/app/derived'
import { useSessionInventory } from '../src/app/session-inventory'
import { useAppStartup, type StartupDependencies } from '../src/app/state'
import { useEffectRuntime } from '../src/app/use-effect-runtime'
import { getDefaultConfig } from '../src/config'
import type { MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError } from '../src/multiplexer/types'
import { resolveTheme, ThemeProvider } from '../src/styles/theme'
import { StartupErrorScreen } from '../src/ui/StartupErrorScreen'

const passthroughMeasure = async <T,>(_name: string, run: () => Promise<T>): Promise<T> => run()
const theme = resolveTheme('catppuccin', {}, 'dark').colors
const noMark = () => {}

function unsupported(): never {
  throw new Error('The startup fixture backend only lists')
}

const backend: MultiplexerBackend = {
  kind: 'herdr',
  capabilities: { previousWorkspace: false },
  async list() {
    return [
      {
        backend: 'herdr',
        id: 'w1',
        title: 'alpha',
        path: '/fixture/alpha',
        isActive: true,
        unitCount: 1,
      },
    ]
  },
  open: unsupported,
  openOrCreate: unsupported,
  create: unsupported,
  start: unsupported,
  rename: unsupported,
  close: unsupported,
  current: unsupported,
  directory: unsupported,
  details: unsupported,
  openEditor: unsupported,
}

const stopped = () =>
  new MultiplexerError('server-stopped', 'Herdr is configured, but its server is not running.')

interface Props {
  dependencies: StartupDependencies
  onQuit: () => void
}

function StartupHarness({ dependencies, onQuit }: Props) {
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

  const { startup, retryStartup } = useAppStartup(
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

  return (
    <ThemeProvider theme={theme}>
      {startup.kind === 'failed' || startup.kind === 'retrying' ? (
        <StartupErrorScreen startup={startup} onRetry={retryStartup} onQuit={onQuit} />
      ) : (
        <text>{`${startup.kind} sessions=${core.sessionItems.map(item => item.title).join(',')}`}</text>
      )}
    </ThemeProvider>
  )
}

let setup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  const current = setup
  setup = undefined

  if (current) act(() => current.renderer.destroy())
})

async function render(dependencies: StartupDependencies, onQuit: () => void = () => {}) {
  setup = await testRender(<StartupHarness dependencies={dependencies} onQuit={onQuit} />, {
    width: 80,
    height: 24,
    consoleMode: 'disabled',
  })

  const current = setup

  return {
    async frame() {
      await act(async () => {})
      await current.renderOnce()

      return current.captureCharFrame()
    },
    // Startup runs through async effects; wait on the wall clock, bounded, rather than a fixed
    // number of flushes, so a slower machine sees the same frame.
    async frameContaining(text: string, timeoutMs = 10_000) {
      const deadline = performance.now() + timeoutMs
      let frame = ''

      while (performance.now() < deadline) {
        await act(async () => {})
        await current.renderOnce()
        frame = current.captureCharFrame()

        if (frame.includes(text)) return frame

        await Bun.sleep(10)
      }

      return frame
    },
    async press(key: string) {
      await act(async () => current.mockInput.pressKey(key))
    },
  }
}

test('a stopped backend shows a startup screen that retries into a working picker', async () => {
  let attempts = 0

  const screen = await render({
    loadConfig: async () => getDefaultConfig('/fixture'),
    resolveBackend: async () => {
      attempts++

      if (attempts === 1) throw stopped()

      return backend
    },
  })

  const failed = await screen.frame()
  expect(failed).toContain('mux-sesh could not start')
  expect(failed).toContain('Multiplexer backend')
  expect(failed).toContain('Herdr is configured, but its server is not running.')
  expect(failed).toContain('retry r')

  await screen.press('r')

  expect(await screen.frameContaining('ready sessions=alpha')).toContain('ready sessions=alpha')
  expect(attempts).toBe(2)
})

test('a config failure is reported as configuration and no backend is probed', async () => {
  let probes = 0

  const screen = await render({
    loadConfig: async () => {
      throw new Error('Failed to parse mux-sesh config at /fixture/config.json.')
    },
    resolveBackend: async () => {
      probes++

      return backend
    },
  })

  const frame = await screen.frame()
  expect(frame).toContain('Configuration')
  expect(frame).toContain('Failed to parse mux-sesh config at /fixture/config.json.')
  expect(probes).toBe(0)
})

test('pressing retry repeatedly while a retry runs starts only one attempt', async () => {
  let attempts = 0
  const second = Promise.withResolvers<MultiplexerBackend>()

  const screen = await render({
    loadConfig: async () => getDefaultConfig('/fixture'),
    resolveBackend: async () => {
      attempts++

      return attempts === 1 ? Promise.reject(stopped()) : second.promise
    },
  })

  await screen.frame()
  await screen.press('r')
  await screen.press('r')
  await screen.press('r')

  expect(await screen.frame()).toContain('Retrying')
  second.resolve(backend)
  expect(await screen.frameContaining('ready sessions=alpha')).toContain('ready sessions=alpha')
  expect(attempts).toBe(2)
})

test('quit from the startup screen uses the quit action', async () => {
  let quits = 0

  const screen = await render(
    {
      loadConfig: async () => getDefaultConfig('/fixture'),
      resolveBackend: async () => {
        throw stopped()
      },
    },
    () => {
      quits++
    }
  )

  await screen.frame()
  await screen.press('q')

  expect(quits).toBe(1)
})
