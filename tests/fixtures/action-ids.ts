import type { ActionId, CommandId } from '../../src/app/action-catalog'

export const COMMAND_IDS = [
  'search',
  'new-session',
  'open-settings',
  'open-themes',
  'view-projects',
  'view-sessions',
  'rename-session',
  'kill-session',
  'mark-target',
  'toggle-pin-session',
  'last-session',
  'root-session',
  'edit-target',
  'open-agents',
  'refresh',
  'toggle-details',
  'back',
] as const satisfies readonly CommandId[]

export const ACTION_IDS = [
  ...COMMAND_IDS,
  'select',
  'open-commands',
  'new-session-name',
  'new-session-startup',
  'new-session-here',
  'new-session-file',
] as const satisfies readonly ActionId[]

type UnlistedActionId = Exclude<ActionId, (typeof ACTION_IDS)[number]>

type UnlistedCommandId = Exclude<CommandId, (typeof COMMAND_IDS)[number]>

// Fails to compile when an action id is added to the catalog but not listed here.
export const EVERY_ACTION_LISTED: [UnlistedActionId, UnlistedCommandId] extends [never, never]
  ? true
  : never = true
