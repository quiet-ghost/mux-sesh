import { describe, expect, test } from 'bun:test'
import { getDefaultConfig, normalizeConfig } from '../src/config'
import { getListedSessionItems, mergeSessionItems } from '../src/config/listed-sessions'
import { resolveProjectSession } from '../src/config/session-rules'

describe('config normalization', () => {
  test('maps snake_case fields and keeps explicit false values', () => {
    const config = normalizeConfig(
      {
        project_paths: ['~/dev', '~/work'],
        repos_path: '~/src/repos',
        editor: 'helix',
        editor_cmd: 'hx .',
        keybind_mode: 'standard',
        prefix_key: 'space',
        color_scheme: 'dark',
        theme: 'opencode-dark',
        themes: {
          midnight: {
            name: 'Midnight',
            light: {
              palette: {
                neutral: '#ffffff',
                ink: '#111111',
                primary: '#222222',
                success: '#00aa00',
                warning: '#ffaa00',
                error: '#ff0000',
                info: '#0000ff',
              },
            },
            dark: {
              palette: {
                neutral: '#000000',
                ink: '#eeeeee',
                primary: '#ffffff',
                success: '#00aa00',
                warning: '#ffaa00',
                error: '#ff0000',
                info: '#0000ff',
              },
              overrides: {
                'markdown-heading': '#c4a7e7',
              },
            },
          },
        },
        sort_order: 'configured-first',
        zoxide_mode: 'merge',
        auto_update: false,
        dir_length: 3,
        hidden_sessions: ['scratch', 'tmp*'],
        icons: {
          tmux: 'T',
          configured: 'C',
          project: 'P',
          opencode: 'O',
        },
        default_session: {
          startup_command: 'bun run dev',
          preview_command: 'git status --short',
        },
        projects: [
          {
            path: '~/dev/projects/mux-sesh',
            session_name: 'mux_core',
            startup_command: 'bun run dev',
            listed: true,
            icon: '',
          },
        ],
        wildcards: [
          {
            pattern: '~/work/**',
            startup_command: 'pnpm dev',
          },
        ],
      },
      '/home/tester'
    )

    expect(config.projectPaths).toEqual(['/home/tester/dev', '/home/tester/work'])
    expect(config.reposPath).toBe('/home/tester/src/repos')
    expect(config.editor).toBe('helix')
    expect(config.editorCmd).toBe('hx .')
    expect(config.keybindMode).toBe('standard')
    expect(config.prefixKey).toBe('space')
    expect(config.colorScheme).toBe('dark')
    expect(config.theme).toBe('opencode')
    expect(config.themes).toEqual({
      midnight: {
        name: 'Midnight',
        light: {
          palette: {
            neutral: '#ffffff',
            ink: '#111111',
            primary: '#222222',
            success: '#00aa00',
            warning: '#ffaa00',
            error: '#ff0000',
            info: '#0000ff',
          },
          overrides: undefined,
        },
        dark: {
          palette: {
            neutral: '#000000',
            ink: '#eeeeee',
            primary: '#ffffff',
            success: '#00aa00',
            warning: '#ffaa00',
            error: '#ff0000',
            info: '#0000ff',
          },
          overrides: {
            'markdown-heading': '#c4a7e7',
          },
        },
      },
    })
    expect(config.sortOrder).toBe('configured-first')
    expect(config.zoxideMode).toBe('merge')
    expect(config.autoUpdate).toBe(false)
    expect(config.dirLength).toBe(3)
    expect(config.hiddenSessions).toEqual(['scratch', 'tmp*'])
    expect(config.icons).toEqual({
      tmux: 'T',
      configured: 'C',
      project: 'P',
      opencode: 'O',
    })
    expect(config.defaultSession).toEqual({
      startupCommand: 'bun run dev',
      previewCommand: 'git status --short',
    })
    expect(config.projects).toEqual([
      {
        path: '/home/tester/dev/projects/mux-sesh',
        sessionName: 'mux_core',
        startupCommand: 'bun run dev',
        previewCommand: undefined,
        listed: true,
        icon: '',
      },
    ])
    expect(config.wildcards).toEqual([
      {
        pattern: '/home/tester/work/**',
        sessionName: undefined,
        startupCommand: 'pnpm dev',
        previewCommand: undefined,
      },
    ])
  })

  test('defaults session startup to editor command when not provided', () => {
    const config = normalizeConfig(
      {
        editor_cmd: 'hx .',
      },
      '/home/tester'
    )

    expect(config.defaultSession?.startupCommand).toBe('hx .')
  })

  test('defaults to rose pine theme and filters invalid custom theme entries', () => {
    const config = normalizeConfig(
      {
        themes: {
          valid: {
            light: {
              palette: {
                neutral: '#faf4ed',
                ink: '#575279',
                primary: '#31748f',
                success: '#286983',
                warning: '#ea9d34',
                error: '#b4637a',
                info: '#56949f',
              },
            },
            dark: {
              palette: {
                neutral: '#191724',
                ink: '#e0def4',
                primary: '#9ccfd8',
                success: '#31748f',
                warning: '#f6c177',
                error: '#eb6f92',
                info: '#9ccfd8',
              },
              overrides: {
                'markdown-heading': '#c4a7e7',
              },
            },
          },
          invalid: 'nope',
        },
      },
      '/home/tester'
    )

    expect(config.theme).toBe('rosepine')
    expect(config.colorScheme).toBe('system')
    expect(config.prefixKey).toBe('ctrl+x')
    expect(config.themes).toEqual({
      valid: {
        name: 'valid',
        light: {
          palette: {
            neutral: '#faf4ed',
            ink: '#575279',
            primary: '#31748f',
            success: '#286983',
            warning: '#ea9d34',
            error: '#b4637a',
            info: '#56949f',
          },
          overrides: undefined,
        },
        dark: {
          palette: {
            neutral: '#191724',
            ink: '#e0def4',
            primary: '#9ccfd8',
            success: '#31748f',
            warning: '#f6c177',
            error: '#eb6f92',
            info: '#9ccfd8',
          },
          overrides: {
            'markdown-heading': '#c4a7e7',
          },
        },
      },
    })
  })

  test('returns defaults for invalid config values', () => {
    const defaults = getDefaultConfig('/home/tester')
    const config = normalizeConfig(
      {
        keybind_mode: 'invalid',
        sort_order: 'invalid',
        zoxide_mode: 'invalid',
        auto_update: 'nope',
        dir_length: 0,
        projects: [{ session_name: 'missing_path' }],
      },
      '/home/tester'
    )

    expect(config.keybindMode).toBe(defaults.keybindMode)
    expect(config.prefixKey).toBe(defaults.prefixKey)
    expect(config.theme).toBe(defaults.theme)
    expect(config.sortOrder).toBe(defaults.sortOrder)
    expect(config.zoxideMode).toBe(defaults.zoxideMode)
    expect(config.autoUpdate).toBe(defaults.autoUpdate)
    expect(config.dirLength).toBe(defaults.dirLength)
    expect(config.projects).toEqual([])
  })
})

describe('project session resolution', () => {
  test('prefers explicit project profiles over wildcard rules', async () => {
    const config = normalizeConfig(
      {
        editor_cmd: 'hx .',
        projects: [
          {
            path: '~/dev/projects/mux-sesh',
            session_name: 'mux_core',
            startup_command: 'bun run dev',
          },
        ],
        wildcards: [
          {
            pattern: '~/dev/**',
            startup_command: 'pnpm dev',
          },
        ],
      },
      '/home/tester'
    )

    const resolved = await resolveProjectSession('/home/tester/dev/projects/mux-sesh', config, {
      getGitRoot: async () => '/home/tester/dev/projects/mux-sesh',
    })

    expect(resolved).toEqual({
      sessionName: 'mux_core',
      startupCommand: 'bun run dev',
      previewCommand: undefined,
      source: 'project',
    })
  })

  test('uses wildcard startup and selected-path dir-length naming', async () => {
    const config = normalizeConfig(
      {
        dir_length: 2,
        default_session: {
          startup_command: 'hx .',
        },
        wildcards: [
          {
            pattern: '~/work/**',
            startup_command: 'bun run dev',
          },
        ],
      },
      '/home/tester'
    )

    const resolved = await resolveProjectSession('/home/tester/work/client/apps/web', config, {
      getGitRoot: async () => '/home/tester/work/client',
    })

    expect(resolved).toEqual({
      sessionName: 'apps_web',
      startupCommand: 'bun run dev',
      previewCommand: undefined,
      source: 'wildcard',
    })
  })

  test('falls back to default session config when no rule matches', async () => {
    const config = normalizeConfig(
      {
        dir_length: 2,
        default_session: {
          startup_command: 'hx .',
          preview_command: 'git status --short',
        },
      },
      '/home/tester'
    )

    const resolved = await resolveProjectSession('/home/tester/sandbox/demo', config, {
      getGitRoot: async () => null,
    })

    expect(resolved).toEqual({
      sessionName: 'sandbox_demo',
      startupCommand: 'hx .',
      previewCommand: 'git status --short',
      source: 'default',
    })
  })

  test('builds listed config sessions and lets live sessions win by title', async () => {
    const config = normalizeConfig(
      {
        projects: [
          {
            path: '~/dotfiles/.config/hypr',
            session_name: 'hyprland',
            listed: true,
            icon: '',
          },
        ],
      },
      '/home/tester'
    )

    const listedItems = await getListedSessionItems(config)
    expect(listedItems).toEqual([
      {
        title: 'hyprland',
        desc: '.config',
        path: '/home/tester/dotfiles/.config/hypr',
        isSession: false,
        itemKind: 'configured',
        icon: '',
      },
    ])

    const merged = mergeSessionItems(
      [
        {
          title: 'hyprland',
          desc: '',
          path: 'hyprland',
          isSession: true,
          itemKind: 'tmux',
        },
      ],
      listedItems
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.isSession).toBe(true)
  })
})
