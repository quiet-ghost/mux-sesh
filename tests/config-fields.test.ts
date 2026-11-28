import { describe, expect, test } from 'bun:test'
import type * as Schema from 'effect/Schema'
import { getDefaultConfig, normalizeConfig } from '../src/config'
import { CONFIG_DOCUMENT_KEYS, checkConfigDocument } from '../src/config/config-document'
import type { Config, ThemeColorScheme } from '../src/types'

// What a case reads back: a top-level config value, or one nested text or flag.
type FieldValue = Config[keyof Config]

type DocumentFields = Readonly<Record<string, Schema.Json>>

const HOME = '/home/tester'
const DEFAULTS = getDefaultConfig(HOME)
const NO_ICONS = { tmux: '', herdr: '', configured: '', project: '', opencode: '' }

const PALETTE = {
  neutral: '#000000',
  ink: '#111111',
  primary: '#222222',
  success: '#333333',
  warning: '#444444',
  error: '#555555',
  info: '#666666',
}

// One config field as written in the document. `snake` is the canonical key; `camel` is the
// documented alias (camelCase, or `config` for `icons.configured`), when the field has one. `wrap` places the field inside its parent object.
interface FieldCase {
  readonly snake: string
  readonly camel?: string
  readonly wrap?: (fields: DocumentFields) => Schema.JsonObject
  readonly read: (config: Config) => FieldValue
  readonly a: Schema.Json
  readonly aOut: FieldValue
  readonly b: Schema.Json
  readonly bOut: FieldValue
  readonly invalid: Schema.Json
  readonly empty: Schema.Json
  readonly emptyIsValid: boolean
  readonly fallback: FieldValue
}

const inProject = (fields: DocumentFields): Schema.JsonObject => ({
  projects: [{ path: '/p', ...fields }],
})

const inWildcard = (fields: DocumentFields): Schema.JsonObject => ({
  wildcards: [{ pattern: '/w/**', ...fields }],
})

const inDefaultSession = (fields: DocumentFields): Schema.JsonObject => ({
  default_session: fields,
})

const inIcons = (fields: DocumentFields): Schema.JsonObject => ({ icons: fields })

function text(
  snake: string,
  camel: string | undefined,
  read: FieldCase['read'],
  fallback: FieldValue
): FieldCase {
  return {
    snake,
    camel,
    read,
    a: 'alpha',
    aOut: 'alpha',
    b: 'beta',
    bOut: 'beta',
    invalid: 3,
    empty: '',
    emptyIsValid: true,
    fallback,
  }
}

function sessionText(
  snake: string,
  camel: string,
  wrap: FieldCase['wrap'],
  read: FieldCase['read'],
  fallback: FieldValue
): FieldCase {
  return { ...text(snake, camel, read, fallback), wrap }
}

function literal(
  snake: string,
  camel: string | undefined,
  read: FieldCase['read'],
  a: string,
  b: string,
  fallback: FieldValue
): FieldCase {
  return {
    snake,
    camel,
    read,
    a,
    aOut: a,
    b,
    bOut: b,
    invalid: 'nope',
    empty: '',
    emptyIsValid: false,
    fallback,
  }
}

function flag(
  snake: string,
  camel: string,
  read: FieldCase['read'],
  set: boolean,
  fallback: FieldValue
): FieldCase {
  return {
    snake,
    camel,
    read,
    a: set,
    aOut: set,
    b: set,
    bOut: set,
    invalid: 'nope',
    empty: '',
    emptyIsValid: false,
    fallback,
  }
}

const VALID_THEME = { light: { palette: PALETTE }, dark: { palette: PALETTE } }

const NORMALIZED_THEME = {
  name: 'mine',
  light: { palette: PALETTE, overrides: undefined },
  dark: { palette: PALETTE, overrides: undefined },
}

const CASES: readonly FieldCase[] = [
  literal('backend', undefined, config => config.backend, 'herdr', 'tmux', undefined),
  {
    snake: 'project_paths',
    camel: 'projectPaths',
    read: config => config.projectPaths,
    a: ['~/a', '/abs'],
    aOut: [`${HOME}/a`, '/abs'],
    b: ['~/b'],
    bOut: [`${HOME}/b`],
    invalid: 'nope',
    empty: [],
    emptyIsValid: true,
    fallback: DEFAULTS.projectPaths,
  },
  {
    snake: 'repos_path',
    camel: 'reposPath',
    read: config => config.reposPath,
    a: '~/repos-a',
    aOut: `${HOME}/repos-a`,
    b: '/repos-b',
    bOut: '/repos-b',
    invalid: 3,
    empty: '',
    emptyIsValid: true,
    fallback: DEFAULTS.reposPath,
  },
  text('editor', undefined, config => config.editor, DEFAULTS.editor),
  text('editor_cmd', 'editorCmd', config => config.editorCmd, DEFAULTS.editorCmd),
  literal(
    'keybind_mode',
    'keybindMode',
    config => config.keybindMode,
    'standard',
    'vim',
    DEFAULTS.keybindMode
  ),
  text('prefix_key', 'prefixKey', config => config.prefixKey, DEFAULTS.prefixKey),
  literal(
    'zoxide_mode',
    'zoxideMode',
    config => config.zoxideMode,
    'merge',
    'rank',
    DEFAULTS.zoxideMode
  ),
  literal(
    'sort_order',
    'sortOrder',
    config => config.sortOrder,
    'alphabetical',
    'zoxide-first',
    DEFAULTS.sortOrder
  ),
  text('theme', undefined, config => config.theme, DEFAULTS.theme),
  literal(
    'color_scheme',
    'colorScheme',
    config => config.colorScheme,
    'dark',
    'light',
    DEFAULTS.colorScheme
  ),
  {
    snake: 'themes',
    read: config => config.themes,
    a: { mine: VALID_THEME },
    aOut: { mine: NORMALIZED_THEME },
    b: { mine: VALID_THEME },
    bOut: { mine: NORMALIZED_THEME },
    invalid: 'nope',
    empty: {},
    emptyIsValid: true,
    fallback: DEFAULTS.themes,
  },
  flag('auto_update', 'autoUpdate', config => config.autoUpdate, false, DEFAULTS.autoUpdate),
  flag(
    'search_history',
    'searchHistory',
    config => config.searchHistory,
    false,
    DEFAULTS.searchHistory
  ),
  {
    snake: 'dir_length',
    camel: 'dirLength',
    read: config => config.dirLength,
    a: 3,
    aOut: 3,
    b: 2,
    bOut: 2,
    invalid: 0,
    empty: '',
    emptyIsValid: false,
    fallback: DEFAULTS.dirLength,
  },
  {
    snake: 'hidden_sessions',
    camel: 'hiddenSessions',
    read: config => config.hiddenSessions,
    a: ['scratch', 'tmp*'],
    aOut: ['scratch', 'tmp*'],
    b: ['other'],
    bOut: ['other'],
    invalid: 'nope',
    empty: [],
    emptyIsValid: true,
    fallback: DEFAULTS.hiddenSessions,
  },
  {
    snake: 'pinned_sessions',
    camel: 'pinnedSessions',
    read: config => config.pinnedSessions,
    a: ['main', 'main', 'work'],
    aOut: ['main', 'work'],
    b: ['other'],
    bOut: ['other'],
    invalid: 'nope',
    empty: [],
    emptyIsValid: true,
    fallback: DEFAULTS.pinnedSessions,
  },
  {
    snake: 'icons',
    read: config => config.icons,
    a: { tmux: 'T' },
    aOut: { ...NO_ICONS, tmux: 'T' },
    b: { herdr: 'H' },
    bOut: { ...NO_ICONS, herdr: 'H' },
    invalid: 'nope',
    empty: {},
    emptyIsValid: true,
    fallback: DEFAULTS.icons,
  },
  {
    ...text('configured', 'config', config => config.icons?.configured, ''),
    wrap: inIcons,
  },
  {
    snake: 'default_session',
    camel: 'defaultSession',
    read: config => config.defaultSession,
    a: { startup_command: 'start-a' },
    aOut: { startupCommand: 'start-a', previewCommand: undefined },
    b: { preview_command: 'preview-b' },
    bOut: { startupCommand: DEFAULTS.editorCmd, previewCommand: 'preview-b' },
    invalid: 'nope',
    empty: {},
    emptyIsValid: true,
    fallback: { startupCommand: DEFAULTS.editorCmd, previewCommand: undefined },
  },
  sessionText(
    'startup_command',
    'startupCommand',
    inDefaultSession,
    config => config.defaultSession?.startupCommand,
    DEFAULTS.editorCmd
  ),
  sessionText(
    'preview_command',
    'previewCommand',
    inDefaultSession,
    config => config.defaultSession?.previewCommand,
    undefined
  ),
  {
    snake: 'projects',
    read: config => config.projects,
    a: [{ path: '~/p' }],
    aOut: [
      {
        path: `${HOME}/p`,
        sessionName: undefined,
        startupCommand: undefined,
        previewCommand: undefined,
        listed: undefined,
        icon: undefined,
      },
    ],
    b: [{ path: '/q', listed: true }],
    bOut: [
      {
        path: '/q',
        sessionName: undefined,
        startupCommand: undefined,
        previewCommand: undefined,
        listed: true,
        icon: undefined,
      },
    ],
    invalid: 'nope',
    empty: [],
    emptyIsValid: true,
    fallback: DEFAULTS.projects,
  },
  sessionText(
    'session_name',
    'sessionName',
    inProject,
    config => config.projects?.[0]?.sessionName,
    undefined
  ),
  sessionText(
    'startup_command',
    'startupCommand',
    inProject,
    config => config.projects?.[0]?.startupCommand,
    undefined
  ),
  sessionText(
    'preview_command',
    'previewCommand',
    inProject,
    config => config.projects?.[0]?.previewCommand,
    undefined
  ),
  {
    ...flag('listed', 'listed', config => config.projects?.[0]?.listed, true, undefined),
    camel: undefined,
    wrap: inProject,
  },
  { ...text('icon', undefined, config => config.projects?.[0]?.icon, undefined), wrap: inProject },
  {
    snake: 'wildcards',
    read: config => config.wildcards,
    a: [{ pattern: '~/w/**' }],
    aOut: [
      {
        pattern: `${HOME}/w/**`,
        sessionName: undefined,
        startupCommand: undefined,
        previewCommand: undefined,
      },
    ],
    b: [{ pattern: '/x/*', startup_command: 'go' }],
    bOut: [
      { pattern: '/x/*', sessionName: undefined, startupCommand: 'go', previewCommand: undefined },
    ],
    invalid: 'nope',
    empty: [],
    emptyIsValid: true,
    fallback: DEFAULTS.wildcards,
  },
  sessionText(
    'session_name',
    'sessionName',
    inWildcard,
    config => config.wildcards?.[0]?.sessionName,
    undefined
  ),
  sessionText(
    'startup_command',
    'startupCommand',
    inWildcard,
    config => config.wildcards?.[0]?.startupCommand,
    undefined
  ),
  sessionText(
    'preview_command',
    'previewCommand',
    inWildcard,
    config => config.wildcards?.[0]?.previewCommand,
    undefined
  ),
]

function label(field: FieldCase): string {
  const where = field.wrap ? JSON.stringify(field.wrap({})) : ''

  return `${where} ${field.snake}${field.camel ? ` / ${field.camel}` : ''}`.trim()
}

function documentOf(field: FieldCase, fields: DocumentFields): Schema.JsonObject {
  return field.wrap ? field.wrap(fields) : fields
}

function read(field: FieldCase, fields: DocumentFields): FieldValue {
  return field.read(normalizeConfig(documentOf(field, fields), HOME))
}

function issuesOf(field: FieldCase, fields: DocumentFields): readonly string[] {
  return checkConfigDocument(documentOf(field, fields)).map(issue => issue.path)
}

describe('config fields: validation and normalization agree on every spelling', () => {
  test('every document key has a case', () => {
    const covered = CASES.filter(field => !field.wrap).flatMap(field => [
      field.snake,
      field.camel ?? field.snake,
    ])

    expect(new Set(covered)).toEqual(new Set(CONFIG_DOCUMENT_KEYS))
  })

  for (const field of CASES) {
    describe(label(field), () => {
      test('absent reads the default', () => {
        expect(read(field, {})).toEqual(field.fallback)
      })

      test('snake_case is read and valid', () => {
        expect(read(field, { [field.snake]: field.a })).toEqual(field.aOut)
        expect(issuesOf(field, { [field.snake]: field.a })).toEqual([])
      })

      test('an invalid value is reported and reads the default', () => {
        expect(read(field, { [field.snake]: field.invalid })).toEqual(field.fallback)
        expect(
          issuesOf(field, { [field.snake]: field.invalid }).some(path => path.endsWith(field.snake))
        ).toBe(true)
      })

      test(`an empty value ${field.emptyIsValid ? 'is accepted' : 'is reported'} and reads the default`, () => {
        expect(read(field, { [field.snake]: field.empty })).toEqual(field.fallback)
        expect(issuesOf(field, { [field.snake]: field.empty }).length === 0).toBe(
          field.emptyIsValid
        )
      })

      const camel = field.camel

      if (camel === undefined) return

      test('camelCase is read and valid', () => {
        expect(read(field, { [camel]: field.b })).toEqual(field.bOut)
        expect(issuesOf(field, { [camel]: field.b })).toEqual([])
      })

      test('snake_case wins when both are set', () => {
        expect(read(field, { [field.snake]: field.a, [camel]: field.b })).toEqual(field.aOut)
        expect(issuesOf(field, { [field.snake]: field.a, [camel]: field.b })).toEqual([])
      })

      test('an invalid snake_case value falls back to camelCase', () => {
        expect(read(field, { [field.snake]: field.invalid, [camel]: field.b })).toEqual(field.bOut)
      })

      test('an empty snake_case value falls back to camelCase', () => {
        expect(read(field, { [field.snake]: field.empty, [camel]: field.b })).toEqual(field.bOut)
      })

      test('invalid in both spellings reads the default', () => {
        expect(read(field, { [field.snake]: field.invalid, [camel]: field.invalid })).toEqual(
          field.fallback
        )
      })
    })
  }
})

const THEME_IDS: ReadonlyArray<readonly [string, string, ThemeColorScheme | undefined]> = [
  ['rose-pine', 'rosepine', DEFAULTS.colorScheme],
  ['opencode-dark', 'opencode', 'dark'],
  ['opencode-light', 'opencode', 'light'],
  ['system', 'system', DEFAULTS.colorScheme],
]

describe('config theme ids', () => {
  test.each(THEME_IDS)('theme %p reads as %p with color scheme %p', (theme, id, colorScheme) => {
    const config = normalizeConfig({ theme }, HOME)

    expect(config.theme).toBe(id)
    expect(config.colorScheme).toBe(colorScheme)
  })

  test('an explicit color scheme wins over the one a legacy theme id implies', () => {
    expect(
      normalizeConfig({ theme: 'opencode-light', color_scheme: 'dark' }, HOME).colorScheme
    ).toBe('dark')
    expect(
      normalizeConfig({ theme: 'opencode-light', colorScheme: 'dark' }, HOME).colorScheme
    ).toBe('dark')
  })
})

describe('config nested values', () => {
  test('list entries that are empty or not text are dropped', () => {
    const config = normalizeConfig(
      { hidden_sessions: ['a', '', 3, 'b'], project_paths: ['', 7] },
      HOME
    )

    expect(config.hiddenSessions).toEqual(['a', 'b'])
    expect(config.projectPaths).toEqual(DEFAULTS.projectPaths)
  })

  test('a theme keeps usable optional colors and overrides, and names itself by id', () => {
    const config = normalizeConfig(
      {
        themes: {
          mine: {
            name: '',
            light: {
              palette: { ...PALETTE, accent: '#777777', info: '#888888' },
              overrides: { x: '', y: 3 },
            },
            dark: { palette: { ...PALETTE, interactive: '' }, overrides: { z: '#999999' } },
          },
          broken: { light: { palette: { ...PALETTE, ink: '' } }, dark: { palette: PALETTE } },
        },
      },
      HOME
    )

    expect(config.themes).toEqual({
      mine: {
        name: 'mine',
        light: {
          palette: { ...PALETTE, accent: '#777777', info: '#888888' },
          overrides: undefined,
        },
        dark: { palette: PALETTE, overrides: { z: '#999999' } },
      },
    })
  })

  test('project and wildcard entries without a path or pattern are dropped', () => {
    const config = normalizeConfig(
      {
        projects: [
          { session_name: 'no-path' },
          'nope',
          { path: '', listed: 'yes' },
          { path: '/p', listed: 'yes' },
        ],
        wildcards: [{ session_name: 'no-pattern' }, { pattern: '/w/*', session_name: '' }],
      },
      HOME
    )

    expect(config.projects?.map(project => [project.path, project.listed])).toEqual([
      ['/p', undefined],
    ])
    expect(config.wildcards?.map(wildcard => [wildcard.pattern, wildcard.sessionName])).toEqual([
      ['/w/*', undefined],
    ])
  })

  test('a non-object document reads as the defaults', () => {
    expect(normalizeConfig([], HOME)).toEqual(DEFAULTS)
    expect(normalizeConfig('nope', HOME)).toEqual(DEFAULTS)
  })
})
