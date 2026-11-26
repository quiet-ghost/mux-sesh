import { afterEach, describe, expect, test } from 'bun:test'
import { copyFile, mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { act } from 'react'
import { RGBA, TextareaRenderable } from '@opentui/core'
import { getOmarchyColorsPath, parseOmarchyColorsToml } from '../src/styles/omarchy'
import { resolveTheme, type ThemeResolver } from '../src/styles/theme'
import type { ThemeColors } from '../src/types'
import type { SubscribeThemeFollowOptions } from '../src/styles/theme-follow'
import { renderSessionScreen } from './fixtures/session-screen'

const omarchyFixtureDir = join(import.meta.dir, 'fixtures', 'omarchy')

let screen: Awaited<ReturnType<typeof renderSessionScreen>> | undefined
let homeDir: string | undefined

afterEach(async () => {
  const fixture = screen
  screen = undefined

  if (fixture) {
    fixture.destroy()
    expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
  }

  if (homeDir) await rm(homeDir, { recursive: true, force: true })
  homeDir = undefined
})

interface ThemeFollowProbe {
  options: SubscribeThemeFollowOptions
  signals: Array<() => void>
}

function createThemeFollowProbe(): ThemeFollowProbe {
  const signals: Array<() => void> = []

  return {
    signals,
    options: {
      debounceMs: 0,
      watch: () => ({ close: () => {} }),
      onSignal: (_signal, listener) => {
        signals.push(listener)

        return () => {
          signals.splice(signals.indexOf(listener), 1)
        }
      },
    },
  }
}

interface ResolutionCounter {
  resolve: ThemeResolver
  count: () => number
}

function countResolutions(): ResolutionCounter {
  let count = 0

  return {
    count: () => count,
    resolve: (...args) => {
      count += 1

      return resolveTheme(...args)
    },
  }
}

async function writeOmarchyColors(home: string, fixtureName: string): Promise<void> {
  const colorsPath = getOmarchyColorsPath(home)
  await mkdir(dirname(colorsPath), { recursive: true })
  await copyFile(join(omarchyFixtureDir, fixtureName), colorsPath)
}

async function omarchyColors(fixtureName: string): Promise<ThemeColors> {
  const palette = parseOmarchyColorsToml(
    await Bun.file(join(omarchyFixtureDir, fixtureName)).text()
  )

  if (!palette) throw new Error(`Omarchy fixture ${fixtureName} did not parse`)

  return resolveTheme('system', {}, 'dark', { omarchyPalette: palette }).colors
}

interface PaintedColors {
  fg: number[]
  bg: number[]
}

function titleColors(fixture: NonNullable<typeof screen>): PaintedColors {
  const title = fixture
    .captureSpans()
    .lines.flatMap(line => line.spans)
    .find(span => span.text.includes('mux-sesh'))

  if (!title) throw new Error('Session screen title was not rendered')

  return { fg: title.fg.toInts(), bg: title.bg.toInts() }
}

function expectPainted(fixture: NonNullable<typeof screen>, colors: ThemeColors): void {
  expect(titleColors(fixture)).toEqual({
    fg: RGBA.fromHex(colors.text).toInts(),
    bg: RGBA.fromHex(colors.surface).toInts(),
  })
}

describe('live theme palette', () => {
  test('selection and query changes do not re-resolve the system theme', async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'mux-sesh-theme-palette-'))
    await writeOmarchyColors(homeDir, 'rose-pine-dark.toml')
    const resolutions = countResolutions()
    const follow = createThemeFollowProbe()
    screen = await renderSessionScreen(
      { width: 80, height: 24 },
      { theme: 'system', homeDir, resolveTheme: resolutions.resolve, themeFollow: follow.options }
    )
    expectPainted(screen, await omarchyColors('rose-pine-dark.toml'))
    const mounted = resolutions.count()

    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('ARROW_UP')
    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('i')
    await screen.typeText('a')
    await screen.pressKey('ARROW_DOWN')

    expect(await screen.frame()).toMatch(/› .*beta/)
    expect(resolutions.count()).toBe(mounted)
  })

  test('a system theme refresh repaints once and keeps selection and query', async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'mux-sesh-theme-palette-'))
    await writeOmarchyColors(homeDir, 'rose-pine-dark.toml')
    const resolutions = countResolutions()
    const follow = createThemeFollowProbe()
    screen = await renderSessionScreen(
      { width: 80, height: 24 },
      { theme: 'system', homeDir, resolveTheme: resolutions.resolve, themeFollow: follow.options }
    )
    await screen.pressKey('i')
    await screen.typeText('a')
    await screen.pressKey('ARROW_DOWN')
    expect(await screen.frame()).toMatch(/› .*beta/)
    const beforeRefresh = resolutions.count()

    await writeOmarchyColors(homeDir, 'catppuccin.toml')
    expect(follow.signals).toHaveLength(1)
    await act(async () => {
      for (const signal of follow.signals) signal()
      await Bun.sleep(10)
    })

    const input = screen.renderer.currentFocusedRenderable

    if (!(input instanceof TextareaRenderable)) throw new Error('Search textarea lost focus')
    expect(await screen.frame()).toMatch(/› .*beta/)
    expect(input.plainText).toBe('a')
    expect(resolutions.count()).toBe(beforeRefresh + 1)
    expectPainted(screen, await omarchyColors('catppuccin.toml'))
    expect(screen.lifecycle).toEqual(['mounted'])
  })

  test('a named theme neither follows nor re-resolves during navigation', async () => {
    const resolutions = countResolutions()
    const follow = createThemeFollowProbe()
    screen = await renderSessionScreen(
      { width: 80, height: 24 },
      { theme: 'gruvbox', resolveTheme: resolutions.resolve, themeFollow: follow.options }
    )
    const mounted = resolutions.count()

    await screen.pressKey('ARROW_DOWN')
    await screen.pressKey('ARROW_UP')

    expect(follow.signals).toHaveLength(0)
    expect(resolutions.count()).toBe(mounted)
    expectPainted(screen, resolveTheme('gruvbox', {}, 'dark').colors)
  })
})
