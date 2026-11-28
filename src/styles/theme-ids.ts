import type { ThemeColorScheme } from './theme-model'

// Kept apart from the theme catalog so config loading does not import the theme data.
export const DEFAULT_THEME_ID = 'rosepine'
export const DEFAULT_COLOR_SCHEME: ThemeColorScheme = 'system'
export const SYSTEM_THEME_ID = 'system'

// 1.x theme ids that still load: `rose-pine`, and `opencode-dark`/`opencode-light`, which are
// the opencode theme (the config also takes the color scheme from the old id).
export function aliasThemeID(themeId?: string): string | undefined {
  if (themeId === 'rose-pine') {
    return 'rosepine'
  }

  if (themeId === 'opencode-dark' || themeId === 'opencode-light') {
    return 'opencode'
  }

  return themeId
}
