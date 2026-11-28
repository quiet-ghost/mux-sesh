import type { Dispatch, SetStateAction } from 'react'
import {
  closeModal as resetModalState,
  openCommandsModal as showCommandsModal,
  openRenameModal as showRenameModal,
  openSettingEditor as showSettingEditor,
  openSettingOptions as showSettingOptions,
  openSettingsModal as showSettingsModal,
  type ModalState,
} from './modals'
import { ActionRefused, reasonOf } from './action-outcome'
import { PendingClose } from './pending-close'
import type { Config, Item } from '../types'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey } from '../multiplexer/items'
import { CleanupBatch, type PickerHost } from '../sessions/cleanup-batch'
import { CleanupPlan } from '../sessions/cleanup-plan'
import type { SettingsFieldId } from '../settings/settings-catalog'

interface AppControlsOptions {
  config: Config | null
  backend: MultiplexerBackend | null
  sessionItems: Item[]
  inventoryRevision: () => number
  markedItems: ReadonlyMap<string, Item>
  setMarkedItems: Dispatch<SetStateAction<ReadonlyMap<string, Item>>>
  setPendingClose: Dispatch<SetStateAction<PendingClose>>
  setRenameTarget: Dispatch<SetStateAction<Item | null>>
  setModalInputValue: Dispatch<SetStateAction<string>>
  setModalState: Dispatch<SetStateAction<ModalState>>
  setCommandsSearchQuery: Dispatch<SetStateAction<string>>
  setCommandsCursor: Dispatch<SetStateAction<number>>
  setSettingEditorError: Dispatch<SetStateAction<string>>
  setSettingsSearchQuery: Dispatch<SetStateAction<string>>
  setSettingsCursor: Dispatch<SetStateAction<number>>
  setSettingOptionsSearchQuery: Dispatch<SetStateAction<string>>
  setSettingOptionsCursor: Dispatch<SetStateAction<number>>
  setSettingEditorValue: Dispatch<SetStateAction<string>>
}

async function pickerHost(backend: MultiplexerBackend | null): Promise<PickerHost> {
  if (!backend) return { kind: 'unknown', reason: 'the backend is still loading' }

  try {
    return { kind: 'known', id: (await backend.current())?.id }
  } catch (cause) {
    return { kind: 'unknown', reason: reasonOf(cause) }
  }
}

export function createAppControls(options: AppControlsOptions) {
  // Freezes a review of exactly this target and waits on its row for a second close key; this
  // never closes anything. Callers run inside the action owner, so a refusal is shown.
  function requestKillSession(item: Item) {
    const review = CleanupPlan.review(item, options.sessionItems, options.inventoryRevision())

    if (review.kind === 'refused') throw new ActionRefused({ reason: review.reason })

    options.setPendingClose(PendingClose.arm(review.plan))
  }

  // Marks are explicit and per row; nothing is ever marked on the user's behalf.
  function toggleMark(item: Item) {
    const key = getItemKey(item)

    options.setMarkedItems(current => {
      const next = new Map(current)

      if (!next.delete(key)) next.set(key, item)

      return next
    })
  }

  function clearMarks() {
    options.setMarkedItems(new Map())
  }

  // Reviews every marked row as it is listed now; the review stores the exact set to close.
  async function requestMarkedClose() {
    const host = await pickerHost(options.backend)

    const review = CleanupBatch.review(
      [...options.markedItems.values()],
      options.sessionItems,
      options.inventoryRevision(),
      host
    )

    if (review.kind === 'refused') throw new ActionRefused({ reason: review.reason })

    options.setModalState({ type: 'close-batch-review', batch: review.batch })
  }

  function openRenameModal(item: Item) {
    showRenameModal(
      item,
      options.setRenameTarget,
      options.setModalInputValue,
      options.setModalState
    )
  }

  function openCommandsModal() {
    showCommandsModal(
      options.setCommandsSearchQuery,
      options.setCommandsCursor,
      options.setModalState
    )
  }

  function openSettingsModal() {
    showSettingsModal(
      options.config,
      options.setSettingEditorError,
      options.setSettingsSearchQuery,
      options.setSettingsCursor,
      options.setModalState
    )
  }

  function openSettingOptions(field: SettingsFieldId) {
    showSettingOptions(
      field,
      options.setSettingOptionsSearchQuery,
      options.setSettingOptionsCursor,
      options.setModalState
    )
  }

  function openSettingEditor(field: SettingsFieldId) {
    showSettingEditor(
      options.config,
      field,
      options.setSettingEditorError,
      options.setSettingEditorValue,
      options.setModalState
    )
  }

  function closeModal() {
    resetModalState({
      setModalState: options.setModalState,
      setModalInputValue: options.setModalInputValue,
      setCommandsSearchQuery: options.setCommandsSearchQuery,
      setCommandsCursor: options.setCommandsCursor,
      setSettingsSearchQuery: options.setSettingsSearchQuery,
      setSettingsCursor: options.setSettingsCursor,
      setSettingOptionsSearchQuery: options.setSettingOptionsSearchQuery,
      setSettingOptionsCursor: options.setSettingOptionsCursor,
      setSettingEditorValue: options.setSettingEditorValue,
      setSettingEditorError: options.setSettingEditorError,
      setRenameTarget: options.setRenameTarget,
    })
  }

  return {
    requestKillSession,
    toggleMark,
    clearMarks,
    requestMarkedClose,
    openRenameModal,
    openCommandsModal,
    openSettingsModal,
    openSettingOptions,
    openSettingEditor,
    closeModal,
  }
}
