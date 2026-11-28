import type { ModalState } from './modals'
import { AppMode } from './app-mode'

type OpenModal = NonNullable<ModalState>

// Exactly one owner receives each keypress. While a text field owns focus, shortcuts may act only
// on the keys they consume, and those keys never reach the field.
export type FocusOwner =
  | { readonly kind: 'shortcuts' }
  | { readonly kind: 'search-field' }
  | { readonly kind: 'modal'; readonly modal: OpenModal['type'] }

interface FocusInputs {
  appMode: AppMode
  modalState: ModalState
  prefixActive: boolean
}

function of({ appMode, modalState, prefixActive }: FocusInputs): FocusOwner {
  if (modalState) return { kind: 'modal', modal: modalState.type }

  // A pending prefix sends the next key to shortcuts, not to the search text.
  if (prefixActive) return { kind: 'shortcuts' }

  if (appMode === AppMode.Search || appMode === AppMode.NewSession) return { kind: 'search-field' }

  return { kind: 'shortcuts' }
}

export const FocusOwner = { of } as const
