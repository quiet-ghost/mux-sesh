import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  applyZoxideMode,
  getProjectItems,
  getSessionCandidateItems,
  parseZoxideOutput,
} from '../src/tmux/projects'
import { filterHiddenSessions, getLastSessionTarget } from '../src/tmux/workflows'
import { getDefaultConfig } from '../src/config'
import { annotateProjectItemsWithSessionLinks } from '../src/projects/session-links'
import type { Item } from '../src/types'

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
