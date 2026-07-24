import { isAgentSessionItem } from '../agents/session-name'
import type { SessionSection } from '../items/order'
import type { IconConfig, Item, ThemeColors } from '../types'

export interface ItemIconPresentation {
  glyph: string
  color: string
}

const FILE_ITEM_GLYPH = '  '

function getIconConfig(icons?: IconConfig): IconConfig {
  return {
    tmux: icons?.tmux ?? '',
    configured: icons?.configured ?? '',
    project: icons?.project ?? '',
    opencode: icons?.opencode ?? '',
  }
}

export function getItemIconPresentation(
  theme: ThemeColors,
  item: Item,
  icons?: IconConfig
): ItemIconPresentation {
  const resolvedIcons = getIconConfig(icons)

  if (item.itemKind === 'configured') {
    return {
      glyph: item.icon ?? resolvedIcons.configured,
      color: theme.action,
    }
  }

  if (item.itemKind === 'file') {
    return {
      glyph: item.icon ?? FILE_ITEM_GLYPH,
      color: item.linkedSessionAttached
        ? theme.active
        : item.linkedSessionName
          ? theme.inactive
          : theme.fileTree,
    }
  }

  if (item.isSession) {
    return {
      glyph: item.icon ?? (isAgentSessionItem(item) ? resolvedIcons.opencode : resolvedIcons.tmux),
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
  section: SessionSection | 'agents',
  icons?: IconConfig
): ItemIconPresentation & { label: string } {
  const resolvedIcons = getIconConfig(icons)

  switch (section) {
    case 'pinned':
      return { glyph: '', color: theme.accent, label: 'Pinned' }
    case 'configured':
      return { glyph: resolvedIcons.configured, color: theme.action, label: 'Configured' }
    case 'agents':
      return { glyph: resolvedIcons.opencode, color: theme.action, label: 'Agents' }
    case 'live':
      return { glyph: resolvedIcons.tmux, color: theme.action, label: 'Live' }
  }
}

export function formatSectionHeader(
  theme: ThemeColors,
  section: SessionSection | 'agents',
  icons?: IconConfig
): ItemIconPresentation & { text: string } {
  const presentation = getSessionSectionPresentation(theme, section, icons)
  const prefix = presentation.glyph.length > 0 ? `${presentation.glyph} ` : ''

  return {
    ...presentation,
    text: `${prefix}${presentation.label}`,
  }
}
