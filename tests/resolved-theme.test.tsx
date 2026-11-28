import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { act } from 'react'
import type { TestRendererSetup } from '@opentui/core/testing'
import { testRender } from '@opentui/react/test-utils'
import { useResolvedTheme, type ResolvedThemeOwner } from '../src/app/resolved-theme'
import { resolveTheme, type ThemeResolver } from '../src/styles/theme'
import type { TerminalPalette } from '../src/styles/terminal-palette'

const TERMINAL_PALETTE: TerminalPalette = {
  mode: 'dark',
  background: '#0b0b0b',
  foreground: '#f2f2f2',
  palette: ['#0b0b0b', '#cc3333', '#33cc33', '#cccc33', '#3333cc', '#cc33cc', '#33cccc', '#f2f2f2'],
}

interface OwnerProbe {
  owner?: ResolvedThemeOwner
  resolutions: number
  resolve: ThemeResolver
}

let setup: TestRendererSetup | undefined
let homeDir: string | undefined

afterEach(async () => {
  const mounted = setup
  setup = undefined

  if (mounted) act(() => mounted.renderer.destroy())

  if (homeDir) await rm(homeDir, { recursive: true, force: true })
  homeDir = undefined
})

function ThemeOwner({
  themeId,
  home,
  probe,
}: {
  themeId: string
  home: string
  probe: OwnerProbe
}) {
  const owner = useResolvedTheme(
    { themeId, customThemes: undefined, colorScheme: 'dark', homeDir: home },
    probe.resolve
  )

  probe.owner = owner

  return <text>{owner.resolvedTheme.colors.background}</text>
}

async function mountOwner(themeId: string): Promise<OwnerProbe> {
  homeDir = await mkdtemp(join(tmpdir(), 'mux-sesh-resolved-theme-'))

  const probe: OwnerProbe = {
    resolutions: 0,
    resolve: (...args) => {
      probe.resolutions += 1

      return resolveTheme(...args)
    },
  }

  const home = homeDir

  await act(async () => {
    setup = await testRender(<ThemeOwner themeId={themeId} home={home} probe={probe} />, {
      width: 20,
      height: 2,
    })
  })

  return probe
}

function ownerOf(probe: OwnerProbe): ResolvedThemeOwner {
  if (!probe.owner) throw new Error('Theme owner did not render')

  return probe.owner
}

describe('useResolvedTheme', () => {
  test('a named theme ignores system refreshes and terminal palettes', async () => {
    const probe = await mountOwner('gruvbox')
    const before = probe.resolutions
    const first = ownerOf(probe).resolvedTheme

    act(() => ownerOf(probe).refreshSystemTheme())
    act(() => ownerOf(probe).setTerminalPalette(TERMINAL_PALETTE))

    expect(probe.resolutions).toBe(before)
    expect(ownerOf(probe).resolvedTheme).toBe(first)
  })

  test('the system theme re-resolves once per refresh and terminal palette', async () => {
    const probe = await mountOwner('system')
    const before = probe.resolutions
    expect(ownerOf(probe).resolvedTheme.id).toBe('rosepine')

    act(() => ownerOf(probe).setTerminalPalette(TERMINAL_PALETTE))
    expect(probe.resolutions).toBe(before + 1)
    expect(ownerOf(probe).resolvedTheme.colors.background).toBe('#0b0b0b')

    act(() => ownerOf(probe).refreshSystemTheme())
    expect(probe.resolutions).toBe(before + 2)
  })
})
