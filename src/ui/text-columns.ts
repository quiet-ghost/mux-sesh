import type { Item } from '../types'

const MIN_COLUMN_GAP = 2

export function getMutedLabelColumnWidth(items: Item[]): number {
  return items.reduce((maxWidth, item) => {
    if (!item.isSession || !item.desc) {
      return maxWidth
    }

    return Math.max(maxWidth, item.title.length)
  }, 0)
}

export function getMutedLabelSpacer(title: string, columnWidth: number): string {
  return ' '.repeat(Math.max(MIN_COLUMN_GAP, columnWidth - title.length + MIN_COLUMN_GAP))
}
