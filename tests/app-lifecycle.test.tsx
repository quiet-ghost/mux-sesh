import { afterEach, describe, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { act, useState, type Dispatch, type SetStateAction } from 'react'
import { useAutoUpdateScheduler, useTerminalPalette } from '../src/app/app-hooks'
import { getDefaultConfig } from '../src/config'
import { SYSTEM_THEME_ID } from '../src/styles/theme-ids'
import type { TerminalPalette } from '../src/styles/terminal-palette'
import type { Config } from '../src/config/config-model'
import { createAutoUpdateScheduler, type AutoUpdateScheduler } from '../src/update/scheduler'

let setup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  const current = setup
  setup = undefined

  if (!current) return
  act(() => current.renderer.destroy())
})

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await Bun.sleep(ms)
  })
}

// Assigned during render, so control-flow narrowing cannot track a local binding.
interface Controls<T> {
  set?: Dispatch<SetStateAction<T>>
}

function control<T>(controls: Controls<T>): Dispatch<SetStateAction<T>> {
  if (!controls.set) throw new Error('Lifecycle probe did not render')

  return controls.set
}

describe('terminal palette', () => {
  test('a terminal that cannot report its palette falls back instead of failing the app', async () => {
    const published: (TerminalPalette | null)[] = []
    const themeControls: Controls<string> = {}

    function PaletteProbe() {
      const [themeId, setThemeId] = useState('catppuccin')
      themeControls.set = setThemeId
      useTerminalPalette(themeId, palette => published.push(palette))

      return <text>palette probe</text>
    }

    setup = await testRender(<PaletteProbe />, { width: 20, height: 4, consoleMode: 'disabled' })
    setup.renderer.getPalette = () => Promise.reject(new Error('fixture palette timeout'))
    published.length = 0

    const setThemeId = control(themeControls)
    await act(async () => setThemeId(SYSTEM_THEME_ID))
    await wait(10)

    expect(published).toEqual([null])
  })
})

describe('auto-update scheduling', () => {
  const config: Config = { ...getDefaultConfig('/fixture'), autoUpdate: true }

  function renderScheduled(scheduler: AutoUpdateScheduler) {
    const keyControls: Controls<number> = {}
    const configControls: Controls<Config | null> = {}

    function Probe({ current }: { current: Config | null }) {
      useAutoUpdateScheduler(current, scheduler)

      return <text>update probe</text>
    }

    function Root() {
      const [key, setKey] = useState(0)
      const [current, setCurrent] = useState<Config | null>(config)
      keyControls.set = setKey
      configControls.set = setCurrent

      return <Probe key={key} current={current} />
    }

    return { Root, remount: () => control(keyControls)(key => key + 1), configControls }
  }

  test('a retried app tree does not schedule a second update check', async () => {
    const checks: Config[] = []

    const scheduler = createAutoUpdateScheduler({
      delayMs: 5,
      check: checked => {
        checks.push(checked)
      },
    })

    const { Root, remount } = renderScheduled(scheduler)

    setup = await testRender(<Root />, { width: 20, height: 4, consoleMode: 'disabled' })
    await wait(20)
    await act(async () => remount())
    await wait(20)

    expect(checks).toEqual([config])
  })

  test('a tree torn down before the check starts leaves it for the next tree', async () => {
    const checks: Config[] = []

    const scheduler = createAutoUpdateScheduler({
      delayMs: 15,
      check: checked => {
        checks.push(checked)
      },
    })

    const { Root, remount, configControls } = renderScheduled(scheduler)
    const nextConfig: Config = { ...config, theme: 'tokyonight' }

    setup = await testRender(<Root />, { width: 20, height: 4, consoleMode: 'disabled' })
    await act(async () => remount())
    await act(async () => control(configControls)(nextConfig))
    await wait(40)

    expect(checks).toEqual([nextConfig])
  })
})
