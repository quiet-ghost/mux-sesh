import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  getProjectItems,
  getSessionCandidateItems,
  refreshProjectDiscovery,
} from '../src/projects/project-items'
import { applyZoxideMode, getZoxideEntries, parseZoxideOutput } from '../src/projects/zoxide'
import { filterHiddenSessions, getLastSessionTarget } from '../src/sessions/session-filters'
import { getDefaultConfig } from '../src/config'
import { annotateProjectItemsWithSessionLinks } from '../src/projects/session-links'
import type { Item } from '../src/items/item'

describe('project discovery helpers', () => {
  test('parses zoxide score output', () => {
    expect(parseZoxideOutput('12.4 /tmp/api\n8 /tmp/web\n')).toEqual([
      { score: 12.4, path: '/tmp/api' },
      { score: 8, path: '/tmp/web' },
    ])
  })

  test('ranks project items by zoxide score when enabled', () => {
    const config = {
      ...getDefaultConfig('/home/tester'),
      zoxideMode: 'rank' as const,
      projectPaths: ['/home/tester/dev'],
    }

    const items: Item[] = [
      { title: 'web', desc: '~/dev/web', path: '/home/tester/dev/web', isSession: false },
      { title: 'api', desc: '~/dev/api', path: '/home/tester/dev/api', isSession: false },
    ]

    const ranked = applyZoxideMode(
      items,
      [
        { score: 10, path: '/home/tester/dev/api' },
        { score: 2, path: '/home/tester/dev/web' },
      ],
      config
    )

    expect(ranked.map(item => item.title)).toEqual(['api', 'web'])
  })

  test('merges zoxide-only paths that sit within configured roots', () => {
    const config = {
      ...getDefaultConfig('/home/tester'),
      zoxideMode: 'merge' as const,
      projectPaths: ['/home/tester/dev'],
    }

    const items: Item[] = [
      { title: 'web', desc: '~/dev/web', path: '/home/tester/dev/web', isSession: false },
    ]

    const merged = applyZoxideMode(
      items,
      [
        { score: 20, path: '/home/tester/dev/tools/cli' },
        { score: 9, path: '/home/tester/other/place' },
      ],
      config
    )

    expect(merged.map(item => item.path)).toEqual([
      '/home/tester/dev/web',
      '/home/tester/dev/tools/cli',
    ])
  })

  test('finds real project roots and dedupes overlapping scans', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mux-sesh-projects-'))

    try {
      const sharedRoot = join(root, 'dev')
      const overlappingRoot = join(sharedRoot, 'projects')
      const projectRoot = join(overlappingRoot, 'highlight-helper')
      const nestedDir = join(projectRoot, 'app')

      await mkdir(nestedDir, { recursive: true })
      await writeFile(
        join(projectRoot, 'package.json'),
        JSON.stringify({ name: 'highlight-helper' })
      )

      const items = await getProjectItems({
        ...getDefaultConfig(root),
        projectPaths: [sharedRoot, overlappingRoot],
        zoxideMode: 'off',
      })

      expect(items.map(item => item.path)).toEqual([projectRoot])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('manual refresh shows a project added inside the cache TTL', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mux-sesh-projects-refresh-'))

    try {
      const dev = join(root, 'dev')
      const first = join(dev, 'first')
      const second = join(dev, 'second')
      const config = { ...getDefaultConfig(root), projectPaths: [dev], zoxideMode: 'off' as const }

      await mkdir(first, { recursive: true })
      await writeFile(join(first, 'package.json'), '{}')
      expect((await getProjectItems(config)).map(item => item.path)).toEqual([first])

      await mkdir(second, { recursive: true })
      await writeFile(join(second, 'package.json'), '{}')
      expect((await getProjectItems(config)).map(item => item.path)).toEqual([first])

      refreshProjectDiscovery()
      expect((await getProjectItems(config)).map(item => item.path)).toEqual([first, second])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('includes plain directories as new-session candidates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mux-sesh-session-candidates-'))

    try {
      const projectRoot = join(root, 'work', 'current', 'SalesMaker-2')

      await mkdir(projectRoot, { recursive: true })
      await writeFile(join(projectRoot, 'notes.txt'), 'hello')

      const items = await getSessionCandidateItems({
        ...getDefaultConfig(root),
        projectPaths: [join(root, 'work')],
        zoxideMode: 'off',
      })

      expect(items.some(item => item.path === projectRoot)).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('does not scan dependency and build output directories as session candidates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mux-sesh-session-candidate-prune-'))

    try {
      const workRoot = join(root, 'work')
      const dependencyProject = join(workRoot, 'node_modules', 'nested-package')
      const buildProject = join(workRoot, 'target', 'debug')

      await mkdir(dependencyProject, { recursive: true })
      await mkdir(buildProject, { recursive: true })

      const items = await getSessionCandidateItems({
        ...getDefaultConfig(root),
        projectPaths: [workRoot],
        zoxideMode: 'off',
      })

      expect(items.map(item => item.path)).not.toContain(dependencyProject)
      expect(items.map(item => item.path)).not.toContain(buildProject)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('does not list folders inside hidden, cache or virtualenv folders as session candidates', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mux-sesh-session-candidate-noise-'))

    try {
      const project = join(home, 'dev', 'tools')

      const noise = [
        join(home, '.config', 'Cursor', 'CachedProfilesData'),
        join(home, 'dev', 'repo', '.husky', '_'),
        join(home, 'dev', 'tools', '__pycache__'),
        join(home, 'dev', 'tools', 'venv', 'lib'),
        join(home, 'dev', 'tools', '.venv', 'lib'),
        join(home, 'dev', 'tools', 'venv', 'lib', 'site-packages', 'pkg'),
      ]

      for (const path of [project, ...noise]) await mkdir(path, { recursive: true })

      const paths = (
        await getSessionCandidateItems({
          ...getDefaultConfig(home),
          projectPaths: [home],
          zoxideMode: 'off',
        })
      ).map(item => item.path)

      expect(paths).toContain(project)

      for (const path of noise) expect(paths).not.toContain(path)
      expect(paths.some(path => path.includes('/.config/'))).toBe(false)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('zoxide adds no session candidates from inside hidden or cache folders', async () => {
    const zoxide = async () => ({
      exitCode: 0,
      output: [
        '9.0 /home/me/dev/tools',
        '8.0 /home/me/.config/Cursor/CachedProfilesData',
        '7.0 /home/me/dev/tools/__pycache__',
        '6.0 /home/me/dev/tools/.venv/lib',
        '5.0 /home/me/.dotfiles/hypr',
      ].join('\n'),
    })

    const fromHome = await getZoxideEntries(zoxide, ['/home/me'], false)
    expect(fromHome.map(entry => entry.path)).toEqual(['/home/me/dev/tools'])

    // Below a hidden root you listed yourself, folders are fair game.
    const fromDotfiles = await getZoxideEntries(zoxide, ['/home/me/.dotfiles'], false)
    expect(fromDotfiles.map(entry => entry.path)).toEqual(['/home/me/.dotfiles/hypr'])
  })

  test('a hidden folder listed as a root is still scanned, and a hidden repo is still a project', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mux-sesh-hidden-root-'))

    try {
      const dotfiles = join(home, '.dotfiles')
      const hypr = join(dotfiles, 'hypr')

      await mkdir(hypr, { recursive: true })
      await mkdir(join(dotfiles, '.git'), { recursive: true })

      const candidates = await getSessionCandidateItems({
        ...getDefaultConfig(home),
        projectPaths: [dotfiles],
        zoxideMode: 'off',
      })

      expect(candidates.map(item => item.path)).toContain(hypr)

      const projects = await getProjectItems({
        ...getDefaultConfig(home),
        projectPaths: [home],
        zoxideMode: 'off',
      })

      expect(projects.map(item => item.path)).toContain(dotfiles)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('annotates project items when a matching tmux session already exists', async () => {
    const config = {
      ...getDefaultConfig('/home/tester'),
      dirLength: 2,
    }

    const annotated = await annotateProjectItemsWithSessionLinks(
      [
        {
          title: 'highlight-helper',
          desc: '~/dev/projects/highlight-helper',
          path: '/home/tester/dev/projects/highlight-helper',
          isSession: false,
          itemKind: 'project',
        },
      ],
      [
        {
          title: 'projects_highlight-helper',
          desc: '',
          path: 'projects_highlight-helper',
          isSession: true,
          isAttached: true,
        },
      ],
      config
    )

    expect(annotated[0]?.linkedSessionName).toBe('projects_highlight-helper')
    expect(annotated[0]?.linkedSessionAttached).toBe(true)
  })

  test('annotates file items using file session naming', async () => {
    const config = getDefaultConfig('/home/tester')

    const annotated = await annotateProjectItemsWithSessionLinks(
      [
        {
          title: 'todo.md',
          desc: '~/notes',
          path: '/home/tester/notes/todo.md',
          isSession: false,
          itemKind: 'file',
        },
      ],
      [
        {
          title: 'notes_todo_md',
          desc: '',
          path: 'notes_todo_md',
          isSession: true,
          isAttached: false,
        },
      ],
      config
    )

    expect(annotated[0]?.linkedSessionName).toBe('notes_todo_md')
    expect(annotated[0]?.linkedSessionAttached).toBe(false)
  })

  test('links duplicate Herdr file labels by the file parent directory', async () => {
    const config = getDefaultConfig('/home/tester')

    const annotated = await annotateProjectItemsWithSessionLinks(
      [
        {
          title: 'todo.md',
          desc: '~/notes',
          path: '/home/tester/notes/todo.md',
          isSession: false,
          itemKind: 'file',
        },
      ],
      [
        {
          title: 'notes_todo_md',
          desc: '',
          path: '/home/tester/archive',
          isSession: true,
          itemKind: 'herdr',
          backend: 'herdr',
          sessionId: 'w1',
        },
        {
          title: 'notes_todo_md',
          desc: '',
          path: '/home/tester/notes',
          isSession: true,
          itemKind: 'herdr',
          backend: 'herdr',
          sessionId: 'w2',
        },
      ],
      config
    )

    expect(annotated[0]?.linkedSessionId).toBe('w2')
  })
})

describe('session workflow helpers', () => {
  test('filters hidden sessions using glob patterns', () => {
    const items: Item[] = [
      { title: 'worktree_main', desc: '', path: 'worktree_main', isSession: true },
      { title: 'scratch', desc: '', path: 'scratch', isSession: true },
      { title: 'tmp-build', desc: '', path: 'tmp-build', isSession: true },
    ]

    expect(filterHiddenSessions(items, ['scratch', 'tmp*']).map(item => item.title)).toEqual([
      'worktree_main',
    ])
  })

  test('picks the most recent non-current session for last-session', () => {
    const items: Item[] = [
      { title: 'current', desc: '', path: 'current', isSession: true, lastActivity: 50 },
      { title: 'previous', desc: '', path: 'previous', isSession: true, lastActivity: 40 },
      { title: 'older', desc: '', path: 'older', isSession: true, lastActivity: 10 },
    ]

    expect(getLastSessionTarget(items, 'current')?.title).toBe('previous')
  })
})
