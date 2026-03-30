import { colors } from '../styles/theme'
import type { IconConfig, Item } from '../types'

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

export function getItemIconPresentation(item: Item, icons?: IconConfig): ItemIconPresentation {
  const resolvedIcons = getIconConfig(icons)

  if (item.itemKind === 'configured') {
    return {
      glyph: item.icon ?? resolvedIcons.configured,
      color: colors.action,
    }
  }

  if (item.isSession) {
    return {
      glyph:
        item.icon ??
        (item.title.startsWith('opencode-') ? resolvedIcons.opencode : resolvedIcons.tmux),
      color: item.isAttached ? colors.active : colors.inactive,
    }
  }

  if (item.linkedSessionName) {
    return {
      glyph: resolvedIcons.tmux,
      color: item.linkedSessionAttached ? colors.active : colors.inactive,
    }
  }

  return {
    glyph: item.icon ?? resolvedIcons.project,
    color: colors.fileTree,
  }
}

export function getSessionSectionPresentation(
  section: 'live' | 'configured' | 'opencode',
  icons?: IconConfig
): ItemIconPresentation & { label: string } {
  const resolvedIcons = getIconConfig(icons)

  switch (section) {
    case 'configured':
      return { glyph: resolvedIcons.configured, color: colors.action, label: 'Configured Sessions' }
    case 'opencode':
      return { glyph: resolvedIcons.opencode, color: colors.action, label: 'Opencode Sessions' }
    case 'live':
      return { glyph: resolvedIcons.tmux, color: colors.inactive, label: 'Live Sessions' }
  }
}

export function formatSectionHeader(
  section: 'live' | 'configured' | 'opencode',
  icons?: IconConfig
): ItemIconPresentation & { text: string } {
  const presentation = getSessionSectionPresentation(section, icons)
  const prefix = presentation.glyph.length > 0 ? `${presentation.glyph} ` : ''

  return {
    ...presentation,
    text: `─ ${prefix}${presentation.label} ─`,
  }
}
