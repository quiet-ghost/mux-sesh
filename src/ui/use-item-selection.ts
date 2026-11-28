import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

interface RememberedSelection {
  keys: readonly string[]
  key: string | undefined
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index])
}

export function getSelectionIndex(keys: readonly string[], key: string | undefined): number {
  const index = key === undefined ? -1 : keys.indexOf(key)

  return Math.max(0, index)
}

export function useItemSelection<T>(
  items: readonly T[],
  cursor: number,
  setCursor: Dispatch<SetStateAction<number>>,
  getKey: (item: T) => string
): void {
  const remembered = useRef<RememberedSelection | null>(null)

  useEffect(() => {
    const keys = items.map(getKey)
    const previous = remembered.current

    // A list that had nothing selected (closed or empty) keeps the cursor it was opened with.
    if (previous?.key !== undefined && !sameKeys(previous.keys, keys)) {
      const next = getSelectionIndex(keys, previous.key)
      remembered.current = { keys, key: keys[next] }

      if (next !== cursor) setCursor(next)

      return
    }

    remembered.current = { keys, key: keys[cursor] }
  }, [cursor, getKey, items, setCursor])
}
