import { isAgentSessionItem } from '../agents/session-name'
import type { SessionSection } from '../items/order'
import type { IconConfig } from '../config/config-model'
import type { Item } from '../items/item'
import type { BackendKind } from '../multiplexer/types'
import type { ThemeColors } from '../styles/theme-model'

export interface ItemIconPresentation {
  glyph: string
  color: string
}

// No icon config means no icons: rows and headers render without a glyph column.
function getIconConfig(icons?: IconConfig): IconConfig {
  return {
    tmux: icons?.tmux ?? '',
    herdr: icons?.herdr ?? '',
    configured: icons?.configured ?? '',
    project: icons?.project ?? '',
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
      glyph: item.icon ?? '',
      color: item.linkedSessionAttached
        ? theme.active
        : item.linkedSessionName
          ? theme.inactive
          : theme.fileTree,
    }
  }

  if (item.isSession) {
    return {
      glyph:
        item.icon ??
        (isAgentSessionItem(item)
          ? resolvedIcons.opencode
          : item.itemKind === 'herdr'
            ? resolvedIcons.herdr
            : resolvedIcons.tmux),
      color: item.isAttached ? theme.active : theme.inactive,
    }
  }

  if (item.linkedSessionName) {
    return {
      glyph: item.linkedSessionBackend === 'herdr' ? resolvedIcons.herdr : resolvedIcons.tmux,
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
  icons?: IconConfig,
  backend?: BackendKind
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
      return {
        glyph: backend === 'herdr' ? resolvedIcons.herdr : resolvedIcons.tmux,
        color: theme.action,
        label: 'Live',
      }
  }
}

export function formatSectionHeader(
  theme: ThemeColors,
  section: SessionSection | 'agents',
  icons?: IconConfig,
  backend?: BackendKind
): ItemIconPresentation & { text: string } {
  const presentation = getSessionSectionPresentation(theme, section, icons, backend)
  const prefix = presentation.glyph.length > 0 ? `${presentation.glyph} ` : ''

  return {
    ...presentation,
    text: `${prefix}${presentation.label}`,
  }
}
