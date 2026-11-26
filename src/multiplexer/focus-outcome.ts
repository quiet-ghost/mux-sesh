import type { FocusOutcome, TerminalHandoff } from './types'

export function handoffOf(outcome: FocusOutcome): TerminalHandoff | undefined {
  return outcome.kind === 'handoff' ? outcome.handoff : undefined
}
