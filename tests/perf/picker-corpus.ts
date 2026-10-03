import { createHerdrBackend } from '../../src/herdr/backend'
import type { MultiplexerBackend } from '../../src/multiplexer'
import { filterAndSortItems } from '../../src/search'
import type { Item } from '../../src/types'

export const PICKER_CORPUS_SIZE = { sessions: 200, projects: 5000 } as const
export const PICKER_QUERIES = [
  'project-00042',
  'project-00123',
  'project-01234',
  'project-02500',
  'project-04999',
] as const

export interface PickerWork {
  navigation: number
  inventory: number
  search: number
  preview: number
  statistics: number
  subprocess: number
}

interface PickerCorpus {
  backend: MultiplexerBackend
  projects: Item[]
  work: PickerWork
  filterSamples: number[]
  previewSamples: number[]
  filterItems: typeof filterAndSortItems
  loadStatistics(): Promise<null>
}

export function createPickerCorpus(): PickerCorpus {
  const sessions = Array.from({ length: PICKER_CORPUS_SIZE.sessions }, (_, index) => ({
    id: `w${index}`,
    title: `session-${String(index).padStart(3, '0')}`,
    path: `/fixture/sessions/session-${String(index).padStart(3, '0')}`,
    focused: index === 0,
  }))
  const snapshot = JSON.stringify({
    result: {
      type: 'session_snapshot',
      snapshot: {
        focused_workspace_id: 'w0',
        focused_tab_id: 'w0:t1',
        focused_pane_id: 'w0:p1',
        workspaces: sessions.map(session => ({
          workspace_id: session.id,
          label: session.title,
          focused: session.focused,
          tab_count: 1,
          active_tab_id: `${session.id}:t1`,
        })),
        tabs: sessions.map(session => ({
          tab_id: `${session.id}:t1`,
          workspace_id: session.id,
          number: 1,
          label: 'shell',
        })),
        panes: sessions.map(session => ({
          pane_id: `${session.id}:p1`,
          workspace_id: session.id,
          tab_id: `${session.id}:t1`,
          focused: session.focused,
          cwd: session.path,
        })),
        layouts: sessions.map(session => ({
          workspace_id: session.id,
          tab_id: `${session.id}:t1`,
          focused_pane_id: `${session.id}:p1`,
        })),
        agents: [],
      },
    },
  })
  const work: PickerWork = {
    navigation: 0,
    inventory: 0,
    search: 0,
    preview: 0,
    statistics: 0,
    subprocess: 0,
  }
  const filterSamples: number[] = []
  const previewSamples: number[] = []
  const adapter = createHerdrBackend({
    insideHerdr: true,
    runner: {
      async run(command) {
        work.subprocess++
        if (command.join(' ') === 'herdr api snapshot') {
          return { exitCode: 0, stdout: snapshot, stderr: '' }
        }
        if (command[0] === 'herdr' && command[1] === 'pane' && command[2] === 'read') {
          return { exitCode: 0, stdout: 'fixture shell ready\n', stderr: '' }
        }
        throw new Error(`Unexpected baseline command: ${command.join(' ')}`)
      },
    },
  })

  return {
    work,
    filterSamples,
    previewSamples,
    projects: Array.from({ length: PICKER_CORPUS_SIZE.projects }, (_, index) => {
      const title = `project-${String(index).padStart(5, '0')}`
      return {
        title,
        desc: 'fixture',
        path: `/fixture/projects/${title}`,
        isSession: false,
        itemKind: 'project',
      }
    }),
    backend: {
      ...adapter,
      async list() {
        work.inventory++
        return adapter.list()
      },
      async details(workspace) {
        work.preview++
        const start = performance.now()
        try {
          return await adapter.details(workspace)
        } finally {
          previewSamples.push(performance.now() - start)
        }
      },
    },
    filterItems(items, query) {
      work.search++
      const start = performance.now()
      try {
        return filterAndSortItems(items, query)
      } finally {
        filterSamples.push(performance.now() - start)
      }
    },
    async loadStatistics() {
      work.statistics++
      return null
    },
  }
}
