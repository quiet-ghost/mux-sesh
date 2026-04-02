export interface VisibleWindow<T> {
  items: T[]
  startIndex: number
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
  const startIndex = Math.min(Math.max(0, cursor - Math.floor(visibleCount / 2)), maxStartIndex)

  return {
    items: items.slice(startIndex, startIndex + visibleCount),
    startIndex,
  }
}
