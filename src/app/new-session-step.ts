import { useEffect, useMemo, useState } from 'react'
import { getItemKey } from '../multiplexer/items'
import { IDLE_FILE_SEARCH, settleFileStepSearch, type FileStepSearch } from '../search/file-step'
import { looksLikePathInput } from '../files/target'
import {
  editableLaunchTarget,
  NO_LAUNCH_OPTIONS,
  parseStartupOverride,
  settleLaunchPreview,
  sessionPlanOf,
  type LaunchOptions,
  type LaunchPreview,
  type LaunchRequest,
} from '../sessions/launch-plan'
import type { Config } from '../config/config-model'
import type { Item } from '../items/item'
import { getNewSessionAction } from '../ui/launch-preview'
import { clampCursorIndex } from '../ui/list-window'
import type { NewSessionStepId } from './action-catalog'
import type { NewSessionAction } from './action-footer'
import type { LauncherFiles } from './launcher-query'
import type { ShowToast } from './notifications'

// Inline states of the New screen. Every step edits its own draft in the same text field, so the
// project query and selection stay untouched until the step is left.
export type NewSessionStep =
  | { readonly kind: 'browse' }
  // `target` is the item key of the row whose planned create is being edited.
  | { readonly kind: 'edit-name'; readonly target: string; readonly draft: string }
  | { readonly kind: 'edit-startup'; readonly target: string; readonly draft: string }
  | { readonly kind: 'named-here'; readonly draft: string }
  | {
      readonly kind: 'file'
      readonly query: string
      readonly search: FileStepSearch
      readonly cursor: number
    }

export type NewSessionStepKind = NewSessionStep['kind']

const BROWSE: NewSessionStep = { kind: 'browse' }

// Applied edits belong to one row; they are dropped as soon as another row is selected.
interface AppliedOptions {
  readonly target: string
  readonly options: LaunchOptions
}

export interface NewSessionStepsInput {
  readonly active: boolean
  readonly config: Config | null
  readonly searchQuery: string
  readonly setSearchQuery: (query: string) => void
  readonly selected: Item | undefined
  readonly files: LauncherFiles
  readonly onDefect: (cause: unknown) => void
}

export interface NewSessionSteps {
  readonly step: NewSessionStep
  readonly request: LaunchRequest
  // What the New text field shows and edits in this step.
  readonly field: string
  readonly setField: (text: string) => void
  // Step keys offered right now; the footer and the key handler both read this list.
  readonly keys: readonly NewSessionStepId[]
  readonly fileItems: readonly Item[]
  readonly open: (id: NewSessionStepId, preview: LaunchPreview) => void
  readonly back: () => void
  readonly move: (delta: 1 | -1) => void
  readonly apply: (preview: LaunchPreview) => Promise<string | undefined>
}

function plannedTitle(preview: LaunchPreview): string | undefined {
  if (preview.kind === 'refused' && preview.failure._tag === 'SessionNameCollision')
    return preview.failure.name

  if (preview.kind !== 'ready') return undefined

  const plan = sessionPlanOf(preview.plan)

  return plan.kind === 'create' ? plan.input.title : plan.target.title
}

function plannedStartup(preview: LaunchPreview): string {
  if (preview.kind !== 'ready') return ''

  const plan = sessionPlanOf(preview.plan)

  return plan.kind === 'create' ? (plan.input.startupCommand ?? '') : ''
}

function fileSearchFor(query: string): FileStepSearch {
  const trimmed = query.trim()

  return trimmed && !looksLikePathInput(trimmed)
    ? { kind: 'searching', query: trimmed }
    : IDLE_FILE_SEARCH
}

function fileItemsOf(step: NewSessionStep): readonly Item[] {
  return step.kind === 'file' && step.search.kind === 'found' ? step.search.items : []
}

function withDraft(step: NewSessionStep, text: string): NewSessionStep {
  switch (step.kind) {
    case 'browse':
      return step
    case 'edit-name':
    case 'edit-startup':
    case 'named-here':
      return step.draft === text ? step : { ...step, draft: text }
    case 'file':
      return step.query === text
        ? step
        : { kind: 'file', query: text, search: fileSearchFor(text), cursor: 0 }
  }
}

function editedOptions(step: NewSessionStep, applied: LaunchOptions): LaunchOptions {
  switch (step.kind) {
    case 'edit-name':
      return { ...applied, name: step.draft }
    case 'edit-startup':
      return { ...applied, startup: parseStartupOverride(step.draft) }
    case 'browse':
    case 'named-here':
    case 'file':
      return applied
  }
}

function useFileStepSearch(
  step: NewSessionStep,
  setStep: (update: (step: NewSessionStep) => NewSessionStep) => void,
  input: NewSessionStepsInput
): void {
  const { config, files, onDefect } = input
  const pending = step.kind === 'file' && step.search.kind === 'searching' ? step.search.query : ''

  useEffect(() => {
    if (!pending || !config) return

    let current = true

    function search(query: string, loaded: Config): void {
      files.search(query, loaded).then(outcome => {
        if (!current || outcome.kind === 'disposed') return

        setStep(latest =>
          latest.kind === 'file' &&
          latest.search.kind === 'searching' &&
          latest.search.query === query
            ? { ...latest, search: settleFileStepSearch(query, outcome), cursor: 0 }
            : latest
        )
      }, onDefect)
    }

    // Each keystroke would run a synchronous native search, so typing is debounced when configured.
    const timeout =
      files.debounceMs > 0 ? setTimeout(() => search(pending, config), files.debounceMs) : undefined

    if (!timeout) search(pending, config)

    return () => {
      current = false
      clearTimeout(timeout)
    }
  }, [config, files, onDefect, pending, setStep])
}

export function useNewSessionSteps(input: NewSessionStepsInput): NewSessionSteps {
  const { active, searchQuery, setSearchQuery, selected } = input
  const [step, setStep] = useState<NewSessionStep>(BROWSE)
  const [applied, setApplied] = useState<AppliedOptions | undefined>(undefined)

  const editable = editableLaunchTarget(searchQuery, selected)
  const editableKey = editable ? getItemKey(editable) : undefined

  useEffect(() => {
    if (active) return

    setStep(BROWSE)
    setApplied(undefined)
  }, [active])

  useEffect(() => {
    setApplied(current => (current && current.target !== editableKey ? undefined : current))
  }, [editableKey])

  useFileStepSearch(step, setStep, input)

  const options = applied && applied.target === editableKey ? applied.options : NO_LAUNCH_OPTIONS

  const fileItems = fileItemsOf(step)
  const fileSelected = step.kind === 'file' ? fileItems[step.cursor] : undefined

  const request = useMemo((): LaunchRequest => {
    switch (step.kind) {
      case 'named-here':
        return { kind: 'named-here', name: step.draft }
      case 'file':
        return { kind: 'file', query: step.query, search: step.search, selected: fileSelected }
      case 'edit-name':
      case 'edit-startup':
        return {
          kind: 'browse',
          query: searchQuery,
          selected,
          options: step.target === editableKey ? editedOptions(step, options) : options,
        }
      case 'browse':
        return { kind: 'browse', query: searchQuery, selected, options }
    }
  }, [editableKey, fileSelected, options, searchQuery, selected, step])

  const keys: NewSessionStepId[] =
    step.kind !== 'browse'
      ? []
      : [
          ...(editable ? (['new-session-name', 'new-session-startup'] as const) : []),
          'new-session-here',
          'new-session-file',
        ]

  function open(id: NewSessionStepId, preview: LaunchPreview): void {
    if (step.kind !== 'browse') return

    switch (id) {
      case 'new-session-name':
        if (!editableKey || !editable) return

        setStep({
          kind: 'edit-name',
          target: editableKey,
          draft: options.name ?? plannedTitle(preview) ?? editable.title,
        })

        return
      case 'new-session-startup':
        if (!editableKey) return

        setStep({
          kind: 'edit-startup',
          target: editableKey,
          draft:
            options.startup === undefined
              ? plannedStartup(preview)
              : options.startup.kind === 'command'
                ? options.startup.command
                : '',
        })

        return
      case 'new-session-here':
        setStep({ kind: 'named-here', draft: '' })

        return
      case 'new-session-file':
        setStep({ kind: 'file', query: '', search: IDLE_FILE_SEARCH, cursor: 0 })
    }
  }

  // Applies an edit only once its plan is valid; a refusal keeps the step and its draft.
  async function apply(preview: LaunchPreview): Promise<string | undefined> {
    if (step.kind !== 'edit-name' && step.kind !== 'edit-startup') return undefined

    const settled =
      preview.kind === 'planning' ? settleLaunchPreview(await preview.prepared) : preview

    if (settled.kind === 'refused') return settled.failure.message

    if (settled.kind !== 'ready')
      return 'Nothing was changed: there is no planned session to edit. Press esc to go back.'

    const edited = step
    setApplied({ target: edited.target, options: editedOptions(edited, options) })
    setStep(current => (current === edited ? BROWSE : current))

    return undefined
  }

  return {
    step,
    request,
    field: step.kind === 'browse' ? searchQuery : step.kind === 'file' ? step.query : step.draft,
    setField: text => {
      if (step.kind === 'browse') {
        setSearchQuery(text)

        return
      }

      setStep(current => withDraft(current, text))
    },
    keys,
    fileItems,
    open,
    back: () => setStep(BROWSE),
    move: delta =>
      setStep(current =>
        current.kind === 'file'
          ? {
              ...current,
              cursor: clampCursorIndex(fileItemsOf(current).length, current.cursor + delta),
            }
          : current
      ),
    apply,
  }
}

// What the New keyboard handler drives: the steps plus the launch for the frozen preview.
export interface NewSessionStepControls {
  readonly step: NewSessionStepKind
  readonly keys: readonly NewSessionStepId[]
  readonly open: (id: NewSessionStepId) => void
  readonly back: () => void
  readonly move: (delta: 1 | -1) => void
  readonly submit: () => Promise<void>
}

function isEditStep(step: NewSessionStepKind): boolean {
  return step === 'edit-name' || step === 'edit-startup'
}

export function getNewSessionEnterAction(
  step: NewSessionStepKind,
  preview: LaunchPreview
): NewSessionAction {
  if (isEditStep(step)) return preview.kind === 'ready' ? 'apply' : 'none'

  return getNewSessionAction(preview)
}

export function getNewSessionStepControls(
  steps: NewSessionSteps,
  preview: LaunchPreview,
  launch: () => Promise<void>,
  showToast: ShowToast
): NewSessionStepControls {
  return {
    step: steps.step.kind,
    keys: steps.keys,
    open: id => steps.open(id, preview),
    back: steps.back,
    move: steps.move,
    submit: async () => {
      if (!isEditStep(steps.step.kind)) return launch()

      const refusal = await steps.apply(preview)

      if (refusal) showToast({ kind: 'warning', message: refusal })
    },
  }
}
