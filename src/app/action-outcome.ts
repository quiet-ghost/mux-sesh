import * as Data from 'effect/Data'
import {
  CommandInterrupted,
  CommandOutputLimitError,
  CommandTimeoutError,
  CommandTransportError,
} from '../multiplexer/command'
import { isBackendFailure } from '../multiplexer/failure'
import { MultiplexerError, type WorkspaceRef } from '../multiplexer/types'
import type { ShowToast, ToastKind } from './notifications'

// An action the user can fix locally (nothing selected, wrong item kind); nothing was changed.
export class ActionRefused extends Data.TaggedError('ActionRefused')<{ readonly reason: string }> {
  override get message(): string {
    return this.reason
  }
}

// Expected failures are shown where they happen; anything else is a defect for crash recovery.
export function isExpectedActionFailure(cause: unknown): cause is Error {
  return (
    isBackendFailure(cause) || cause instanceof ActionRefused || cause instanceof CommandInterrupted
  )
}

// A mutation that stopped without a definite answer may still have happened. Only a spawn
// failure proves the command never ran.
export function isUncertainMutationFailure(cause: unknown): boolean {
  return (
    (cause instanceof CommandTransportError && cause.phase !== 'spawn') ||
    cause instanceof CommandTimeoutError ||
    cause instanceof CommandInterrupted ||
    cause instanceof CommandOutputLimitError ||
    (cause instanceof MultiplexerError && cause.code === 'invalid-response')
  )
}

export function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown error'
}

// A safe retry repeats only the failed follow-up, never the mutation that already happened.
export type SafeRetry =
  | { readonly kind: 'none' }
  | { readonly kind: 'open'; readonly target: WorkspaceRef }
  | { readonly kind: 'refresh' }

// Work that completed and must not be hidden: shown on the outcome screen instead of a toast.
export type OperationReport =
  | {
      readonly kind: 'partial'
      readonly title: string
      readonly completed: readonly string[]
      readonly failed: string
      readonly next: string
      readonly retry: SafeRetry
    }
  | {
      readonly kind: 'unknown'
      readonly title: string
      readonly completed: readonly string[]
      readonly attempted: string
      readonly reason: string
      readonly next: string
    }

// Completed and failed outcomes are local messages; a failed one changed nothing.
export type ActionOutcome =
  | { readonly kind: 'completed'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | OperationReport

export interface OutcomePresenter {
  showToast: ShowToast
  showOutcome: (report: OperationReport) => void
}

// A refusal is something the user can fix and changed nothing; any other expected failure is an error.
export function failureKind(cause: Error): ToastKind {
  return cause instanceof ActionRefused ? 'warning' : 'error'
}

function present(outcome: ActionOutcome, presenter: OutcomePresenter): void {
  switch (outcome.kind) {
    case 'completed':
      presenter.showToast({ kind: 'success', message: outcome.message })

      return
    case 'failed':
      presenter.showToast({ kind: 'error', message: outcome.message })

      return
    case 'partial':
    case 'unknown':
      presenter.showOutcome(outcome)
  }
}

function retryLabel(report: OperationReport): string | undefined {
  if (report.kind === 'unknown') return undefined

  switch (report.retry.kind) {
    case 'none':
      return undefined
    case 'open':
      return `open '${report.retry.target.title}'`
    case 'refresh':
      return 'refresh the list'
  }
}

// Earlier completed work (e.g. a clone) is prepended; it never turns a later failure into success.
function after(fact: string, outcome: ActionOutcome, title: string, next: string): ActionOutcome {
  switch (outcome.kind) {
    case 'completed':
      return outcome
    case 'failed':
      return {
        kind: 'partial',
        title,
        completed: [fact],
        failed: outcome.message,
        next,
        retry: { kind: 'none' },
      }
    case 'partial':
    case 'unknown':
      return { ...outcome, completed: [fact, ...outcome.completed] }
  }
}

export const ActionOutcome = { present, after } as const
export const OperationReport = { retryLabel } as const
