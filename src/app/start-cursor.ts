import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { useKeyboard } from '@opentui/react'
import type { MultiplexerBackend, WorkspaceRef } from '../multiplexer'
import { getItemKey, isLiveSessionItem } from '../multiplexer/items'
import { AppMode, ViewMode, type Item } from '../types'

// The start cursor waits for the current session, lands on it once, and is then settled for good.
type StartCursor =
  | { readonly kind: 'reading' }
  | { readonly kind: 'known'; readonly ref: WorkspaceRef }
  | { readonly kind: 'settled' }

const SETTLED: StartCursor = { kind: 'settled' }

// The session's own row; agent rows inside the same Herdr workspace are never the start.
export function findCurrentSessionIndex(rows: readonly Item[], ref: WorkspaceRef): number {
  return rows.findIndex(
    item =>
      isLiveSessionItem(item) &&
      item.target === undefined &&
      item.backend === ref.backend &&
      item.sessionId === ref.id
  )
}

export interface StartOnCurrentSessionOptions {
  readonly backend: MultiplexerBackend | null
  readonly appMode: AppMode
  readonly viewMode: ViewMode
  readonly searchQuery: string
  // The rows the session cursor indexes in the current mode.
  readonly regularSessions: Item[]
  readonly cursor: number
  readonly lastSessionSelectionRef: MutableRefObject<string | null>
  readonly setCursor: Dispatch<SetStateAction<number>>
}

// Places the cursor once the current session is known, if the user is still browsing an untouched
// list. Keeps waiting only while the first list has not landed.
function placeStartCursor(start: StartCursor, options: StartOnCurrentSessionOptions): StartCursor {
  if (start.kind !== 'known') return start

  const { appMode, viewMode, searchQuery, regularSessions } = options

  const browsing =
    viewMode === ViewMode.Sessions &&
    !searchQuery.trim() &&
    (appMode === AppMode.Normal || appMode === AppMode.Search)

  if (!browsing) return SETTLED

  // The startup view is Sessions until the first list lands.
  if (regularSessions.length === 0) return start

  const index = findCurrentSessionIndex(regularSessions, start.ref)
  const row = regularSessions[index]

  if (row) {
    options.lastSessionSelectionRef.current = getItemKey(row)

    if (index !== options.cursor) options.setCursor(index)
  }

  return SETTLED
}

// Reads the current session beside the first list load, never before the first frame. The cursor
// moves only while the user has not pressed a key or typed a query; anything else stays at the top.
// Held in a ref so a resolved read costs no render unless the cursor actually moves.
export function useStartOnCurrentSession(options: StartOnCurrentSessionOptions): void {
  const start = useRef<StartCursor>({ kind: 'reading' })
  const latest = useRef(options)
  latest.current = options
  const { backend, appMode, viewMode, searchQuery, regularSessions } = options

  useKeyboard(() => {
    start.current = SETTLED
  })

  useEffect(() => {
    if (!backend) return

    let cancelled = false

    // An unknown or unreadable current session just keeps the top row; it is not worth a notice.
    Promise.resolve()
      .then(() => backend.current())
      .then(
        ref => {
          if (cancelled || start.current.kind !== 'reading') return

          start.current = ref ? placeStartCursor({ kind: 'known', ref }, latest.current) : SETTLED
        },
        () => {
          if (!cancelled) start.current = SETTLED
        }
      )

    return () => {
      cancelled = true
    }
  }, [backend])

  useEffect(() => {
    start.current = placeStartCursor(start.current, latest.current)
  }, [appMode, regularSessions, searchQuery, viewMode])
}
