import { colors } from '../styles/theme'
import type { Item } from '../types'

interface ItemIconPresentation {
  glyph: string
  color: string
}

export function getItemIconPresentation(item: Item): ItemIconPresentation {
  if (item.itemKind === 'configured') {
    return {
      glyph: item.icon ?? '',
      color: colors.action,
    }
  }

  if (item.isSession) {
    return {
      glyph: item.icon ?? '',
      color: item.isAttached ? colors.active : colors.inactive,
    }
  }

  if (item.linkedSessionName) {
    return {
      glyph: '',
      color: item.linkedSessionAttached ? colors.active : colors.inactive,
    }
  }

  return {
    glyph: item.icon ?? '',
    color: colors.fileTree,
  }
}
