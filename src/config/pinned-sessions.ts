import { getItemKey } from '../multiplexer/items'
import type { Item } from '../items/item'

export type PinAfterRename =
  | { readonly kind: 'none' }
  | { readonly kind: 'moved'; readonly pinnedSessions: readonly string[] }
  // Another live session still has the old name, so the title-based pin may be meant for it.
  | { readonly kind: 'ambiguous' }

export function movePinAfterRename(
  pinnedSessions: readonly string[],
  renamed: Item,
  newTitle: string,
  liveSessions: readonly Item[]
): PinAfterRename {
  if (!pinnedSessions.includes(renamed.title) || renamed.title === newTitle) return { kind: 'none' }

  const renamedKey = getItemKey(renamed)

  const shared = liveSessions.some(
    session =>
      session.isSession && session.title === renamed.title && getItemKey(session) !== renamedKey
  )

  if (shared) return { kind: 'ambiguous' }

  const moved = pinnedSessions.map(title => (title === renamed.title ? newTitle : title))

  return { kind: 'moved', pinnedSessions: [...new Set(moved)] }
}
