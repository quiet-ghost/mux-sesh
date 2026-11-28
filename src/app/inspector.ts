import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { isFileItem } from '../files/target'
import { createCommandRunner, type CommandRunner } from '../multiplexer/command'
import { getSessionKey, getWorkspaceRef, isLiveSessionItem } from '../multiplexer/items'
import {
  MultiplexerError,
  type MultiplexerBackend,
  type WorkspaceDetails,
  type WorkspaceRef,
} from '../multiplexer/types'
import {
  getFilePreview,
  getProjectPreview,
  PREVIEW_COMMAND_POLICY,
  type PreviewServices,
  type ProjectPreview,
} from '../preview/project'
import type { Config, Item } from '../types'
import { requestFatalShutdown } from '../util/shutdown'
import { readEffect, type AppEffectRuntime } from './effect-runtime'

// Routine navigation shows compact inventory context only. Detail, pane, and configured-preview
// reads run while the user has asked to inspect and the details panel is on screen.
export type InspectorMode = 'compact' | 'inspecting'

export type DetailsContent =
  | { readonly kind: 'session'; readonly details: WorkspaceDetails }
  | { readonly kind: 'project'; readonly preview: ProjectPreview }

// `refreshing` and `stale` keep the same target's earlier content while saying it is not current.
export type DetailsView =
  | { readonly kind: 'closed' }
  | { readonly kind: 'loading'; readonly key: string }
  | { readonly kind: 'refreshing'; readonly key: string; readonly content: DetailsContent }
  | { readonly kind: 'ready'; readonly key: string; readonly content: DetailsContent }
  | { readonly kind: 'failed'; readonly key: string; readonly message: string }
  | {
      readonly kind: 'stale'
      readonly key: string
      readonly content: DetailsContent
      readonly message: string
    }

export interface DetailsRequest {
  readonly key: string
  readonly item: Item
  readonly config: Config
  readonly backend: MultiplexerBackend | null
  // Inventory revision: explicit refreshes and mutations re-read the inspected target.
  readonly revision: number
}

export interface DetailsInspectorOptions {
  readonly effects: Pick<AppEffectRuntime, 'run'>
  readonly load: (request: DetailsRequest, signal: AbortSignal) => Promise<DetailsContent>
  readonly publish: (view: DetailsView) => void
  readonly onDefect: (cause: unknown) => void
}

export interface DetailsInspector {
  show(request: DetailsRequest): void
  close(): void
  dispose(): void
}

const CLOSED: DetailsView = { kind: 'closed' }

export function getInspectionKey(item: Item): string {
  return isLiveSessionItem(item) ? getSessionKey(item) : `${item.itemKind ?? 'item'}:${item.path}`
}

export function getDetailsContent(view: DetailsView, key: string): DetailsContent | undefined {
  switch (view.kind) {
    case 'refreshing':
    case 'ready':
    case 'stale':
      return view.key === key ? view.content : undefined
    case 'closed':
    case 'loading':
    case 'failed':
      return undefined
  }
}

// A changed config object is a changed rule revision: startup and preview rules live there.
function sameRequest(left: DetailsRequest, right: DetailsRequest): boolean {
  return (
    left.key === right.key &&
    left.item === right.item &&
    left.config === right.config &&
    left.backend === right.backend &&
    left.revision === right.revision
  )
}

// Owns the one read for the latest request: a newer request or close aborts the older read, and
// only the read that is still current may publish.
export function createDetailsInspector(options: DetailsInspectorOptions): DetailsInspector {
  const lifetime = new AbortController()
  let current: { readonly request: DetailsRequest; readonly scope: AbortController } | undefined
  let view: DetailsView = CLOSED

  function publish(next: DetailsView): void {
    view = next
    options.publish(next)
  }

  function show(request: DetailsRequest): void {
    if (lifetime.signal.aborted) return

    if (current && sameRequest(current.request, request)) return

    current?.scope.abort()
    const scope = new AbortController()
    const read = { request, scope }
    current = read
    const signal = AbortSignal.any([lifetime.signal, scope.signal])
    const previous = getDetailsContent(view, request.key)

    publish(
      previous
        ? { kind: 'refreshing', key: request.key, content: previous }
        : { kind: 'loading', key: request.key }
    )

    options.effects
      .run(
        readEffect(fiber => options.load(request, AbortSignal.any([fiber, signal]))),
        { signal }
      )
      .then(outcome => {
        if (current !== read) return

        switch (outcome.kind) {
          case 'interrupted':
            return
          case 'defect':
            options.onDefect(outcome.cause)

            return
          case 'success':
            publish({ kind: 'ready', key: request.key, content: outcome.value })

            return
          case 'failure': {
            const { message } = outcome.error

            publish(
              previous
                ? { kind: 'stale', key: request.key, content: previous, message }
                : { kind: 'failed', key: request.key, message }
            )
          }
        }
      }, options.onDefect)
  }

  function close(): void {
    current?.scope.abort()
    current = undefined

    if (view.kind !== 'closed') publish(CLOSED)
  }

  function dispose(): void {
    lifetime.abort()
    current = undefined
  }

  return { show, close, dispose }
}

function linkedWorkspaceOf(item: Item): WorkspaceRef | undefined {
  if (!item.linkedSessionId || !item.linkedSessionBackend) return undefined

  return {
    backend: item.linkedSessionBackend,
    id: item.linkedSessionId,
    title: item.linkedSessionName ?? item.linkedSessionId,
  }
}

async function loadDetails(
  request: DetailsRequest,
  previewRunner: CommandRunner,
  signal: AbortSignal
): Promise<DetailsContent> {
  const { item, config, backend } = request

  if (isLiveSessionItem(item)) {
    if (!backend) {
      throw new MultiplexerError(
        'unavailable',
        'The multiplexer backend is still loading; details will load once it is ready.'
      )
    }

    return { kind: 'session', details: await backend.details(getWorkspaceRef(item), { signal }) }
  }

  const services: PreviewServices = {
    runner: previewRunner,
    signal,
    loadWorkspaceDetails: backend ? workspace => backend.details(workspace, { signal }) : undefined,
  }

  const linked = linkedWorkspaceOf(item)

  const preview = isFileItem(item)
    ? await getFilePreview(item.path, config, linked, services)
    : await getProjectPreview(item.path, config, linked, services)

  return { kind: 'project', preview }
}

export interface InventoryRevision {
  readonly subscribe: (listener: () => void) => () => void
  readonly revision: () => number
}

export interface DetailsInspectorInput {
  readonly effects: AppEffectRuntime
  readonly inventory: InventoryRevision
  // False while the details panel is off screen; nothing is read then.
  readonly visible: boolean
  readonly item: Item | undefined
  readonly config: Config | null
  readonly backend: MultiplexerBackend | null
}

export interface DetailsInspectorState {
  readonly mode: InspectorMode
  readonly view: DetailsView
  readonly toggle: () => void
}

export function useDetailsInspector(input: DetailsInspectorInput): DetailsInspectorState {
  const { effects, inventory, visible, item, config, backend } = input
  const [mode, setMode] = useState<InspectorMode>('compact')
  const [view, setView] = useState<DetailsView>(CLOSED)
  const revision = useSyncExternalStore(inventory.subscribe, inventory.revision)

  const [inspector] = useState(() => {
    const previewRunner = createCommandRunner(PREVIEW_COMMAND_POLICY)

    return createDetailsInspector({
      effects,
      load: (request, signal) => loadDetails(request, previewRunner, signal),
      publish: setView,
      onDefect: requestFatalShutdown,
    })
  })

  useEffect(() => () => inspector.dispose(), [inspector])

  useEffect(() => {
    if (mode === 'compact' || !visible || !item || !config) {
      inspector.close()

      return
    }

    inspector.show({ key: getInspectionKey(item), item, config, backend, revision })
  }, [backend, config, inspector, item, mode, revision, visible])

  const toggle = useCallback(() => {
    setMode(current => (current === 'compact' ? 'inspecting' : 'compact'))
  }, [])

  return { mode, view, toggle }
}
