import * as Data from 'effect/Data'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as SchemaAST from 'effect/SchemaAST'
import * as SchemaIssue from 'effect/SchemaIssue'

// Validates the JSON document as written. The normalizer maps aliases and applies defaults, reading
// each field with the schemas below; this guarantees that every supplied field is usable, instead
// of silently dropping it.

const Text = Schema.String.annotate({ description: 'text' })

export const NonEmptyText = Schema.String.check(Schema.isMinLength(1)).annotate({
  description: 'a non-empty string',
})

const TextList = Schema.Array(NonEmptyText).annotate({ description: 'a list of non-empty strings' })
export const Flag = Schema.Boolean.annotate({ description: 'true or false' })

export const PositiveInteger = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0)
).annotate({
  description: 'a whole number of at least 1',
})

function oneOf<const L extends readonly [string, ...string[]]>(literals: L) {
  return Schema.Literals(literals).annotate({
    description: literals.map(literal => `"${literal}"`).join(' or '),
  })
}

export const BackendChoice = oneOf(['tmux', 'herdr'])
export const KeybindChoice = oneOf(['vim', 'standard'])
export const ZoxideChoice = oneOf(['off', 'rank', 'merge'])

export const SortChoice = oneOf(['live-first', 'configured-first', 'zoxide-first', 'alphabetical'])

export const ColorSchemeChoice = oneOf(['light', 'dark', 'system'])

function aliased<S extends Schema.Top>(snake: string, camel: string, schema: S) {
  return { [snake]: Schema.optionalKey(schema), [camel]: Schema.optionalKey(schema) }
}

const Palette = Schema.Struct({
  neutral: NonEmptyText,
  ink: NonEmptyText,
  primary: NonEmptyText,
  success: NonEmptyText,
  warning: NonEmptyText,
  error: NonEmptyText,
  info: NonEmptyText,
  accent: Schema.optionalKey(NonEmptyText),
  interactive: Schema.optionalKey(NonEmptyText),
  diffAdd: Schema.optionalKey(NonEmptyText),
  diffDelete: Schema.optionalKey(NonEmptyText),
}).annotate({ description: 'a palette object' })

const ThemeVariant = Schema.Struct({
  palette: Palette,
  overrides: Schema.optionalKey(Schema.Record(Schema.String, Text)),
}).annotate({ description: 'a theme variant object' })

const ThemeDefinition = Schema.Struct({
  name: Schema.optionalKey(Text),
  light: ThemeVariant,
  dark: ThemeVariant,
}).annotate({ description: 'a theme object with light and dark variants' })

const SessionCommands = {
  ...aliased('session_name', 'sessionName', Text),
  ...aliased('startup_command', 'startupCommand', Text),
  ...aliased('preview_command', 'previewCommand', Text),
}

const ProjectProfile = Schema.Struct({
  path: NonEmptyText,
  ...SessionCommands,
  listed: Schema.optionalKey(Flag),
  icon: Schema.optionalKey(Text),
}).annotate({ description: 'a project object' })

const ProjectWildcard = Schema.Struct({ pattern: NonEmptyText, ...SessionCommands }).annotate({
  description: 'a wildcard object',
})

const Icons = Schema.Struct({
  tmux: Schema.optionalKey(Text),
  herdr: Schema.optionalKey(Text),
  configured: Schema.optionalKey(Text),
  config: Schema.optionalKey(Text),
  project: Schema.optionalKey(Text),
  opencode: Schema.optionalKey(Text),
}).annotate({ description: 'an icons object' })

const SessionDefaults = Schema.Struct({
  ...aliased('startup_command', 'startupCommand', Text),
  ...aliased('preview_command', 'previewCommand', Text),
}).annotate({ description: 'a default session object' })

export const ConfigDocument = Schema.Struct({
  backend: Schema.optionalKey(BackendChoice),
  ...aliased('project_paths', 'projectPaths', TextList),
  ...aliased('repos_path', 'reposPath', Text),
  editor: Schema.optionalKey(Text),
  ...aliased('editor_cmd', 'editorCmd', Text),
  ...aliased('keybind_mode', 'keybindMode', KeybindChoice),
  ...aliased('prefix_key', 'prefixKey', Text),
  ...aliased('zoxide_mode', 'zoxideMode', ZoxideChoice),
  ...aliased('sort_order', 'sortOrder', SortChoice),
  theme: Schema.optionalKey(Text),
  ...aliased('color_scheme', 'colorScheme', ColorSchemeChoice),
  themes: Schema.optionalKey(Schema.Record(Schema.String, ThemeDefinition)),
  ...aliased('auto_update', 'autoUpdate', Flag),
  ...aliased('search_history', 'searchHistory', Flag),
  ...aliased('dir_length', 'dirLength', PositiveInteger),
  ...aliased('hidden_sessions', 'hiddenSessions', TextList),
  ...aliased('pinned_sessions', 'pinnedSessions', TextList),
  icons: Schema.optionalKey(Icons),
  ...aliased('default_session', 'defaultSession', SessionDefaults),
  projects: Schema.optionalKey(
    Schema.Array(ProjectProfile).annotate({ description: 'a list of project objects' })
  ),
  wildcards: Schema.optionalKey(
    Schema.Array(ProjectWildcard).annotate({ description: 'a list of wildcard objects' })
  ),
}).annotate({ description: 'a JSON object' })

// Every key the writer owns, in both spellings, so a save can keep the user's other keys.
export const CONFIG_DOCUMENT_KEYS: ReadonlySet<string> = new Set(Object.keys(ConfigDocument.fields))

export interface ConfigIssue {
  readonly path: string
  readonly expected: string
}

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .map((key, index) =>
      Number.isInteger(key) || /^\d+$/.test(String(key))
        ? `[${String(key)}]`
        : `${index === 0 ? '' : '.'}${String(key)}`
    )
    .join('')
}

function collectIssues(issue: SchemaIssue.Issue, path: ReadonlyArray<PropertyKey>): ConfigIssue[] {
  switch (issue._tag) {
    case 'Pointer':
      return collectIssues(issue.issue, [...path, ...issue.path])
    case 'MissingKey':
      return [{ path: formatPath(path), expected: 'required' }]
    case 'Composite':
    case 'AnyOf': {
      const expected = SchemaAST.resolveDescription(issue.ast)

      // Children at deeper paths name the exact bad field; otherwise this field itself failed.
      const ownFailure =
        issue._tag === 'AnyOf' || issue.issues.every(child => child._tag !== 'Pointer')

      if (expected && ownFailure)
        return [{ path: formatPath(path), expected: `expected ${expected}` }]

      return issue.issues.flatMap(child => collectIssues(child, path))
    }

    case 'Encoding':
    case 'Filter':
      return collectIssues(issue.issue, path)
    case 'InvalidType':
    case 'InvalidValue':
    case 'Forbidden':
    case 'OneOf':
    case 'UnexpectedKey': {
      const expected = 'ast' in issue ? SchemaAST.resolveDescription(issue.ast) : undefined

      return [{ path: formatPath(path), expected: expected ? `expected ${expected}` : 'invalid' }]
    }
  }
}

export function checkConfigDocument(document: Schema.Json): readonly ConfigIssue[] {
  const decoded = Schema.decodeUnknownResult(ConfigDocument)(document, { errors: 'all' })

  return Result.isSuccess(decoded) ? [] : collectIssues(decoded.failure.issue, [])
}

const LISTED_ISSUES = 6

export class ConfigInvalid extends Data.TaggedError('ConfigInvalid')<{
  readonly configPath: string
  readonly issues: readonly ConfigIssue[]
}> {
  override get message(): string {
    const listed = this.issues
      .slice(0, LISTED_ISSUES)
      .map(issue =>
        issue.path ? `${issue.path} (${issue.expected})` : `the file (${issue.expected})`
      )

    const more =
      this.issues.length > LISTED_ISSUES ? `; and ${this.issues.length - LISTED_ISSUES} more` : ''

    return `The mux-sesh config at ${this.configPath} has invalid settings: ${listed.join('; ')}${more}. Fix or remove them, then retry. The file was not changed.`
  }
}
