import { useCallback, useMemo, useState } from 'react'
import { useSystemThemeFollow, useTerminalPalette } from './app-hooks'
import { resolveTheme, type ResolvedTheme, type ThemeResolver } from '../styles/theme'
import { SYSTEM_THEME_ID } from '../styles/theme-ids'
import type { SubscribeThemeFollowOptions } from '../styles/theme-follow'
import type { TerminalPalette } from '../styles/terminal-palette'
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
