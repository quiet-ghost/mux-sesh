import type { Item } from '../items/item'
import { FileSearchUnavailableError, type FileSearchOutcome } from './fff'

// Results of the explicit "open file" step. Unlike the project list, an unavailable native search
// is a state of its own: there are no project rows to fall back to.
export type FileStepSearch =
  | { readonly kind: 'idle' }
  | { readonly kind: 'searching'; readonly query: string }
  | { readonly kind: 'found'; readonly query: string; readonly items: readonly Item[] }
  | { readonly kind: 'unavailable'; readonly query: string; readonly reason: string }

export const IDLE_FILE_SEARCH: FileStepSearch = { kind: 'idle' }

function describeFailure(failure: Error): string {
  return failure instanceof FileSearchUnavailableError
    ? `File search is unavailable: ${failure.message}.`
    : `File search failed: ${failure.message}.`
}

// Only files are offered; directory matches belong to the project list.
export function settleFileStepSearch(
  query: string,
  outcome: Exclude<FileSearchOutcome, { kind: 'disposed' }>
): FileStepSearch {
  switch (outcome.kind) {
    case 'found':
      return { kind: 'found', query, items: outcome.items.filter(item => item.itemKind === 'file') }
    case 'disabled':
      return {
        kind: 'unavailable',
        query,
        reason: 'File search is turned off (MUX_SESH_DISABLE_FFF).',
      }
    case 'failed':
      return { kind: 'unavailable', query, reason: describeFailure(outcome.failure) }
  }
}
