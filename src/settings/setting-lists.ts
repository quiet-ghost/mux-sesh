import { expandHomePath } from '../config'
import type { Config, Item } from '../types'
import { matchesGlob, normalizePathForMatching } from '../util/glob'
import { toHomeRelativePath } from '../util/path-display'
import { plural } from '../util/plural'
import { DraftCheck, SettingChange } from './setting-change'
import type { ListSettingId } from './settings-catalog'

export type StringListField = ListSettingId

// What the rows are checked against: live sessions before hidden ones are filtered out, the
// discovered projects, and whether a folder exists.
export interface ListContext {
  readonly liveSessions: readonly Item[]
  readonly projects: readonly Item[]
  readonly folderExists: (path: string) => boolean
}

interface ListSpec {
  // "A folder is required", "Add folder…".
  readonly noun: string
  readonly add: string
  readonly placeholder: string
  // Shown under the open field while its text is fine.
  readonly typing: string
}

const SPECS: Record<StringListField, ListSpec> = {
  projectPaths: {
    noun: 'folder',
    add: 'Add folder…',
    placeholder: 'A folder, such as ~/dev',
    typing: '~ is your home folder; projects are found inside it',
  },
  hiddenSessions: {
    noun: 'pattern',
    add: 'Add pattern…',
    placeholder: 'A glob, such as scratch-*',
    typing: '* matches any text and ? one character, in session names',
  },
  pinnedSessions: {
    noun: 'session',
    add: 'Add session…',
    placeholder: 'A session name',
    typing: 'The session name as Sessions lists it',
  },
}

function items(config: Config, field: StringListField): readonly string[] {
  switch (field) {
    case 'projectPaths':
      return config.projectPaths
    case 'hiddenSessions':
      return config.hiddenSessions ?? []
    case 'pinnedSessions':
      return config.pinnedSessions ?? []
  }
}

function withItems(config: Config, field: StringListField, next: string[]): Config {
  switch (field) {
    case 'projectPaths':
      return { ...config, projectPaths: next }
    case 'hiddenSessions':
      return { ...config, hiddenSessions: next }
    case 'pinnedSessions':
      return { ...config, pinnedSessions: next }
  }
}

// Folders are stored expanded and shown with `~`; patterns and names as written.
function display(field: StringListField, value: string, homeDir: string): string {
  return field === 'projectPaths' ? toHomeRelativePath(value, homeDir) : value
}

// The value as stored: trimmed, and a folder with `~` expanded.
function stored(field: StringListField, draft: string, homeDir: string): string {
  const value = draft.trim()

  return field === 'projectPaths' ? expandHomePath(value, homeDir) : value
}

function sameEntry(field: StringListField, left: string, right: string): boolean {
  return field === 'projectPaths'
    ? normalizePathForMatching(left) === normalizePathForMatching(right)
    : left === right
}

// The index being edited may keep its own value.
function duplicateOf(
  config: Config,
  field: StringListField,
  value: string,
  except: number | undefined
): string | undefined {
  return items(config, field).find(
    (item, index) => index !== except && sameEntry(field, item, value)
  )
}

function required(field: StringListField): string {
  return `A ${SPECS[field].noun} is required`
}

function check(
  config: Config,
  field: StringListField,
  draft: string,
  homeDir: string,
  context: ListContext,
  except?: number
): DraftCheck {
  if (draft.trim().length === 0) return DraftCheck.empty

  const value = stored(field, draft, homeDir)
  const duplicate = duplicateOf(config, field, value, except)

  if (duplicate !== undefined) {
    return DraftCheck.invalid(`${display(field, duplicate, homeDir)} is already in the list`)
  }

  if (field === 'projectPaths' && !context.folderExists(value)) {
    return DraftCheck.warning(
      `${display(field, value, homeDir)} does not exist yet; it is scanned once it does`
    )
  }

  return DraftCheck.ok
}

function put(
  config: Config,
  field: StringListField,
  draft: string,
  homeDir: string,
  index: number | undefined
): SettingChange {
  if (draft.trim().length === 0) return SettingChange.invalid(required(field))

  const value = stored(field, draft, homeDir)
  const duplicate = duplicateOf(config, field, value, index)

  if (duplicate !== undefined) {
    return SettingChange.invalid(`${display(field, duplicate, homeDir)} is already in the list`)
  }

  const current = items(config, field)

  const next =
    index === undefined
      ? [...current, value]
      : current.map((item, position) => (position === index ? value : item))

  return SettingChange.checked(config, withItems(config, field, next), homeDir)
}

function add(config: Config, field: StringListField, draft: string, homeDir: string) {
  return put(config, field, draft, homeDir, undefined)
}

function replace(
  config: Config,
  field: StringListField,
  index: number,
  draft: string,
  homeDir: string
): SettingChange {
  return put(config, field, draft, homeDir, index)
}

function remove(
  config: Config,
  field: StringListField,
  index: number,
  homeDir: string
): SettingChange {
  const next = items(config, field).filter((_item, position) => position !== index)

  return SettingChange.checked(config, withItems(config, field, next), homeDir)
}

function move(
  config: Config,
  field: StringListField,
  index: number,
  direction: 1 | -1,
  homeDir: string
): SettingChange {
  const next = SettingChange.moved(items(config, field), index, direction)

  return next
    ? SettingChange.checked(config, withItems(config, field, next), homeDir)
    : SettingChange.unchanged
}

function hiddenBy(pattern: string, context: ListContext): readonly Item[] {
  return context.liveSessions.filter(
    item =>
      item.isSession &&
      (matchesGlob(item.title, pattern) ||
        (item.workspaceTitle !== undefined && matchesGlob(item.workspaceTitle, pattern)))
  )
}

function projectsIn(root: string, context: ListContext): number {
  const folder = normalizePathForMatching(root)

  return context.projects.filter(project => {
    const path = normalizePathForMatching(project.path)

    return path === folder || path.startsWith(`${folder}/`)
  }).length
}

function isRunning(name: string, context: ListContext): boolean {
  return context.liveSessions.some(item => item.isSession && item.title === name)
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')

  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

// The value column: what the entry does right now.
function status(field: StringListField, value: string, context: ListContext): string {
  switch (field) {
    case 'hiddenSessions':
      return `hides ${hiddenBy(value, context).length}`
    case 'projectPaths': {
      const count = projectsIn(value, context)

      if (count > 0) return plural(count, 'project')

      return context.folderExists(value) ? 'no projects' : 'missing'
    }

    case 'pinnedSessions':
      return isRunning(value, context) ? '' : 'not running'
  }
}

// The selected entry's line under the list.
function detail(field: StringListField, value: string, context: ListContext): string {
  switch (field) {
    case 'hiddenSessions': {
      const hidden = hiddenBy(value, context).map(item => item.title)

      return hidden.length > 0 ? `Hides ${joinNames(hidden)}` : 'Hides no live session'
    }

    case 'projectPaths': {
      const count = projectsIn(value, context)

      if (count > 0) return `${plural(count, 'project')} found in this folder`

      return context.folderExists(value)
        ? 'No projects found in this folder yet'
        : 'This folder does not exist; nothing is scanned there'
    }

    case 'pinnedSessions':
      return isRunning(value, context)
        ? 'Kept at the top of Sessions'
        : 'No session with this name is running; it stays pinned'
  }
}

function removePrompt(field: StringListField, value: string, homeDir: string): string {
  const shown = display(field, value, homeDir)

  switch (field) {
    case 'hiddenSessions':
      return `Stop hiding ${shown}? Matching sessions are listed again.`
    case 'projectPaths':
      return `Stop scanning ${shown}? Nothing on disk changes.`
    case 'pinnedSessions':
      return `Unpin ${shown}? The session keeps running.`
  }
}

function addLabel(field: StringListField): string {
  return SPECS[field].add
}

function placeholder(field: StringListField): string {
  return SPECS[field].placeholder
}

function typingHint(field: StringListField): string {
  return SPECS[field].typing
}

export const StringList = {
  items,
  display,
  check,
  add,
  replace,
  remove,
  move,
  status,
  detail,
  removePrompt,
  addLabel,
  placeholder,
  typingHint,
} as const
