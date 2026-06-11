export interface VisibleWindow<T> {
  items: T[]
  startIndex: number
}

export function clampCursorIndex(length: number, cursor: number): number {
  if (length <= 0) {
    return 0
  }

  return Math.min(Math.max(cursor, 0), length - 1)
}

export function getVisibleWindow<T>(
  items: T[],
  cursor: number,
  maxItems: number
): VisibleWindow<T> {
  if (items.length === 0) {
    return {
      items: [],
      startIndex: 0,
    }
  }

  const visibleCount = Math.max(1, Math.min(maxItems, items.length))
  const maxStartIndex = Math.max(0, items.length - visibleCount)
  const safeCursor = clampCursorIndex(items.length, cursor)
  const startIndex = Math.min(Math.max(0, safeCursor - Math.floor(visibleCount / 2)), maxStartIndex)

  return {
    items: items.slice(startIndex, startIndex + visibleCount),
    startIndex,
  }
}
