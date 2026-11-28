import type { ActionId, CommandId, DialogActionId } from '../../src/app/action-catalog'

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

export const DIALOG_ACTION_IDS = [
  'settings-move',
  'settings-change',
  'settings-toggle',
  'settings-open',
  'settings-reset',
  'settings-clear',
  'settings-close',
  'option-move',
  'option-apply',
  'option-back',
  'editor-apply',
  'editor-back',
  'list-move',
  'list-edit',
  'list-open',
  'list-add',
  'list-remove',
  'list-reorder',
  'list-back',
  'confirm-remove',
  'confirm-keep',
  'field-apply',
  'field-add',
  'field-cancel',
  'rule-move',
  'rule-toggle',
  'rule-edit',
  'rule-reset',
  'rule-back',
] as const satisfies readonly DialogActionId[]

type UnlistedDialogActionId = Exclude<DialogActionId, (typeof DIALOG_ACTION_IDS)[number]>

// Fails to compile when a dialog action is added to the catalog but not listed here.
export const EVERY_DIALOG_ACTION_LISTED: [UnlistedDialogActionId] extends [never] ? true : never =
  true

type UnlistedActionId = Exclude<ActionId, (typeof ACTION_IDS)[number]>

type UnlistedCommandId = Exclude<CommandId, (typeof COMMAND_IDS)[number]>

// Fails to compile when an action id is added to the catalog but not listed here.
export const EVERY_ACTION_LISTED: [UnlistedActionId, UnlistedCommandId] extends [never, never]
  ? true
  : never = true
