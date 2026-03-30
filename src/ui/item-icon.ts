import type { IconConfig, Item, ThemeColors } from '../types'

export interface ItemIconPresentation {
  glyph: string
  color: string
}

function getIconConfig(icons?: IconConfig): IconConfig {
  return {
    tmux: icons?.tmux ?? '',
    configured: icons?.configured ?? '',
    project: icons?.project ?? '',
    opencode: icons?.opencode ?? '',
  }
}

export function getItemIconPresentation(theme: ThemeColors, item: Item, icons?: IconConfig): ItemIconPresentation {
  const resolvedIcons = getIconConfig(icons)

  if (item.itemKind === 'configured') {
    return {
      glyph: item.icon ?? resolvedIcons.configured,
      color: theme.action,
    }
  }

  if (item.isSession) {
    return {
      glyph:
        item.icon ??
        (item.title.startsWith('opencode-') ? resolvedIcons.opencode : resolvedIcons.tmux),
      color: item.isAttached ? theme.active : theme.inactive,
    }
  }

  if (item.linkedSessionName) {
    return {
      glyph: resolvedIcons.tmux,
      color: item.linkedSessionAttached ? theme.active : theme.inactive,
    }
  }

  return {
    glyph: item.icon ?? resolvedIcons.project,
    color: theme.fileTree,
  }
}

export function getSessionSectionPresentation(
  theme: ThemeColors,
  section: 'live' | 'configured' | 'opencode',
  icons?: IconConfig
): ItemIconPresentation & { label: string } {
  const resolvedIcons = getIconConfig(icons)

  switch (section) {
    case 'configured':
      return { glyph: resolvedIcons.configured, color: theme.action, label: 'Configured Sessions' }
    case 'opencode':
      return { glyph: resolvedIcons.opencode, color: theme.action, label: 'Opencode Sessions' }
    case 'live':
      return { glyph: resolvedIcons.tmux, color: theme.inactive, label: 'Live Sessions' }
  }
}

export function formatSectionHeader(
  theme: ThemeColors,
  section: 'live' | 'configured' | 'opencode',
  icons?: IconConfig
): ItemIconPresentation & { text: string } {
  const presentation = getSessionSectionPresentation(theme, section, icons)
  const prefix = presentation.glyph.length > 0 ? `${presentation.glyph} ` : ''

  return {
    ...presentation,
    text: `─ ${prefix}${presentation.label} ─`,
  }
}
