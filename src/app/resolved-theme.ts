import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRenderer } from '@opentui/react'
import type { TerminalColors } from '@opentui/core'
import { resolveTheme, type ResolvedTheme, type ThemeResolver } from '../styles/theme'
import { SYSTEM_THEME_ID } from '../styles/theme-ids'
import { subscribeThemeFollow, type SubscribeThemeFollowOptions } from '../styles/theme-follow'
import { terminalColorsToPalette, type TerminalPalette } from '../styles/terminal-palette'
import type { ThemeColorScheme, ThemeDefinition } from '../styles/theme-model'

export interface ThemeSource {
  themeId: string | undefined
  customThemes: Record<string, ThemeDefinition> | undefined
  colorScheme: ThemeColorScheme | undefined
  homeDir: string
}

export interface ResolvedThemeOwner {
  resolvedTheme: ResolvedTheme
  refreshSystemTheme: () => void
  setTerminalPalette: (palette: TerminalPalette | null) => void
}

// System palettes come from files and the terminal, so they re-resolve only when the theme
// follower bumps the epoch or the terminal reports colors; named themes ignore both.
export function useResolvedTheme(
  source: ThemeSource,
  resolve: ThemeResolver = resolveTheme
): ResolvedThemeOwner {
  const { themeId, customThemes, colorScheme, homeDir } = source
  const [systemThemeEpoch, setSystemThemeEpoch] = useState(0)
  const [terminalPalette, setTerminalPalette] = useState<TerminalPalette | null>(null)
  const followsSystem = themeId === SYSTEM_THEME_ID
  const followedEpoch = followsSystem ? systemThemeEpoch : 0
  const followedTerminalPalette = followsSystem ? terminalPalette : null

  const resolvedTheme = useMemo(
    () =>
      resolve(themeId, customThemes, colorScheme, {
        homeDir,
        terminalPalette: followedTerminalPalette,
      }),
    [resolve, themeId, customThemes, colorScheme, homeDir, followedTerminalPalette, followedEpoch]
  )

  const refreshSystemTheme = useCallback(() => {
    setSystemThemeEpoch(current => current + 1)
  }, [])

  return { resolvedTheme, refreshSystemTheme, setTerminalPalette }
}

export interface LiveThemeOptions {
  resolve?: ThemeResolver
  follow?: SubscribeThemeFollowOptions
}

// Follows desktop and terminal palette changes for the theme on screen, including a System
// preview whose saved theme is a named one.
export function useLiveResolvedTheme(
  source: ThemeSource,
  options: LiveThemeOptions = {}
): ResolvedTheme {
  const { resolvedTheme, refreshSystemTheme, setTerminalPalette } = useResolvedTheme(
    source,
    options.resolve
  )

  useSystemThemeFollow(source.themeId, source.homeDir, refreshSystemTheme, options.follow)
  useTerminalPalette(source.themeId, setTerminalPalette)

  return resolvedTheme
}

export function useSystemThemeFollow(
  themeId: string | undefined,
  homeDir: string,
  onRefresh: () => void,
  followOptions?: SubscribeThemeFollowOptions
) {
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const followOptionsRef = useRef(followOptions)
  followOptionsRef.current = followOptions

  useEffect(() => {
    if (themeId !== SYSTEM_THEME_ID) {
      return
    }

    const subscription = subscribeThemeFollow(
      homeDir,
      {
        onRefresh: () => {
          onRefreshRef.current()
        },
      },
      followOptionsRef.current
    )

    return () => {
      subscription.stop()
    }
  }, [homeDir, themeId])
}

export function useTerminalPalette(
  themeId: string | undefined,
  onPalette: (palette: TerminalPalette | null) => void
) {
  const renderer = useRenderer()
  const onPaletteRef = useRef(onPalette)
  onPaletteRef.current = onPalette

  useEffect(() => {
    if (themeId !== SYSTEM_THEME_ID) {
      onPaletteRef.current(null)

      return
    }

    let cancelled = false

    const publish = (colors: TerminalColors): void => {
      if (!cancelled) {
        onPaletteRef.current(terminalColorsToPalette(colors))
      }
    }

    // A terminal that cannot report its palette keeps the built-in colors.
    renderer.getPalette().then(publish, () => {
      if (!cancelled) onPaletteRef.current(null)
    })

    renderer.on('palette', publish)

    return () => {
      cancelled = true
      renderer.off('palette', publish)
    }
  }, [renderer, themeId])
}
