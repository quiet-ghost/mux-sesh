import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDefaultConfig } from '../src/config'
import { createCommandRunner, type CommandRunner } from '../src/multiplexer/command'
import {
  createProjectDiscovery,
  describeDiscoveryFailures,
  type DiscoveryFailure,
} from '../src/tmux/project-discovery-service'
import type { Config } from '../src/types'

const realRunner = createCommandRunner()

let root = ''
const lockedPaths: string[] = []

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mux-sesh-discovery-'))
})

afterEach(async () => {
  for (const path of lockedPaths.splice(0)) {
    await chmod(path, 0o755)
  }

  await rm(root, { recursive: true, force: true })
})

async function makeProject(path: string): Promise<string> {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'package.json'), '{}')

  return path
}

function configFor(projectPaths: string[]): Config {
  return { ...getDefaultConfig(root), projectPaths, zoxideMode: 'off' }
}

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function deferred(): Deferred {
  let resolve = () => {}

  const promise = new Promise<void>(done => {
    resolve = done
  })

  return { promise, resolve }
}

interface FindRecorder {
  runner: CommandRunner
  findRoots: string[]
}

function recordFinds(gates: Map<string, Deferred> = new Map()): FindRecorder {
  const findRoots: string[] = []

  return {
    findRoots,
    runner: {
      async run(command, options) {
        if (command[0] === 'find') {
          const findRoot = command[1] ?? ''
          findRoots.push(findRoot)
          await gates.get(findRoot)?.promise
        }

        return realRunner.run(command, options)
      },
    },
  }
}

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500 && !condition(); attempt += 1) {
    await Bun.sleep(2)
  }

  expect(condition()).toBe(true)
}

function paths(result: { items: { path: string }[] }): string[] {
  return result.items.map(item => item.path).toSorted()
}

describe('project discovery refresh', () => {
  test('refresh invalidates the TTL cache so a newly added project appears', async () => {
    const dev = join(root, 'dev')
    const first = await makeProject(join(dev, 'first'))
    const discovery = createProjectDiscovery({ runner: realRunner, ttlMs: 60_000 })
    const config = configFor([dev])

    expect(paths(await discovery.load(config, 'projects'))).toEqual([first])

    const second = await makeProject(join(dev, 'second'))
    expect(paths(await discovery.load(config, 'projects'))).toEqual([first])

    discovery.refresh()
    expect(paths(await discovery.load(config, 'projects'))).toEqual([first, second])
  })

  test('overlapping requests for one revision share a single run', async () => {
    const dev = join(root, 'dev')
    const project = await makeProject(join(dev, 'api'))
    const gate = deferred()
    const recorder = recordFinds(new Map([[dev, gate]]))
    const discovery = createProjectDiscovery({ runner: recorder.runner, ttlMs: 60_000 })
    const config = configFor([dev])

    const firstLoad = discovery.load(config, 'projects')
    const secondLoad = discovery.load({ ...config }, 'projects')
    gate.resolve()
    const [first, second] = await Promise.all([firstLoad, secondLoad])

    expect(paths(first)).toEqual([project])
    expect(second).toBe(first)
    expect(recorder.findRoots).toEqual([dev])
  })

  test('a run that started before refresh cannot publish its stale result', async () => {
    const dev = join(root, 'dev')
    const first = await makeProject(join(dev, 'first'))
    const gates = new Map([[dev, deferred()]])
    const recorder = recordFinds(gates)
    const discovery = createProjectDiscovery({ runner: recorder.runner, ttlMs: 60_000 })
    const config = configFor([dev])

    const staleLoad = discovery.load(config, 'projects')
    await waitUntil(() => recorder.findRoots.length === 1)
    const staleGate = gates.get(dev)
    gates.delete(dev)
    discovery.refresh()
    const second = await makeProject(join(dev, 'second'))
    const freshLoad = discovery.load(config, 'projects')

    expect(paths(await freshLoad)).toEqual([first, second])
    staleGate?.resolve()
    await staleLoad

    expect(paths(await discovery.load(config, 'projects'))).toEqual([first, second])
    expect(recorder.findRoots).toEqual([dev, dev])
  })

  test('a run for an obsolete config revision cannot populate the cache', async () => {
    const oldRoot = join(root, 'old')
    const newRoot = join(root, 'new')
    const oldProject = await makeProject(join(oldRoot, 'legacy'))
    const newProject = await makeProject(join(newRoot, 'current'))
    const oldGate = deferred()
    const recorder = recordFinds(new Map([[oldRoot, oldGate]]))
    const discovery = createProjectDiscovery({ runner: recorder.runner, ttlMs: 60_000 })

    const oldLoad = discovery.load(configFor([oldRoot]), 'projects')
    // The obsolete run must be parked inside its scan before the newer revision loads.
    await waitUntil(() => recorder.findRoots.includes(oldRoot))
    expect(paths(await discovery.load(configFor([newRoot]), 'projects'))).toEqual([newProject])

    oldGate.resolve()
    expect(paths(await oldLoad)).toEqual([oldProject])

    expect(paths(await discovery.load(configFor([newRoot]), 'projects'))).toEqual([newProject])
    expect(recorder.findRoots).toEqual([oldRoot, newRoot])

    expect(paths(await discovery.load(configFor([oldRoot]), 'projects'))).toEqual([oldProject])
    expect(recorder.findRoots).toEqual([oldRoot, newRoot, oldRoot])
  })
})

describe('project discovery failures', () => {
  // Root ignores directory permissions, so the unreadable-root fixture cannot be built there.
  test.skipIf(process.getuid?.() === 0)(
    'missing and unreadable roots fail while a healthy sibling still lists projects',
    async () => {
      const healthy = join(root, 'healthy')
      const project = await makeProject(join(healthy, 'api'))
      const missing = join(root, 'missing')
      const locked = join(root, 'locked')
      await makeProject(join(locked, 'secret'))
      await chmod(locked, 0o000)
      lockedPaths.push(locked)
      const discovery = createProjectDiscovery({ runner: realRunner, ttlMs: 60_000 })

      const result = await discovery.load(configFor([healthy, missing, locked]), 'projects')

      expect(paths(result)).toEqual([project])
      expect(result.failures).toEqual([
        { root: missing, reason: { kind: 'missing' } },
        { root: locked, reason: { kind: 'inaccessible', code: 'EACCES' } },
      ])
    }
  )

  test('a nonzero find exit is reported with its exit status and stderr', async () => {
    const dev = join(root, 'dev')
    await makeProject(join(dev, 'api'))

    const runner: CommandRunner = {
      run: async command =>
        command[0] === 'find'
          ? { exitCode: 1, stdout: '', stderr: 'find: boom\n' }
          : realRunner.run(command),
    }

    const discovery = createProjectDiscovery({ runner, ttlMs: 60_000 })

    const result = await discovery.load(configFor([dev]), 'session-candidates')

    expect(result.items).toEqual([])
    expect(result.failures).toEqual([
      { root: dev, reason: { kind: 'find-exit', exitCode: 1, stderr: 'find: boom' } },
    ])
  })

  test('a find timeout is classified instead of returning an empty success', async () => {
    const dev = join(root, 'dev')
    await makeProject(join(dev, 'api'))
    const slowRunner = createCommandRunner({ timeoutMs: 50, killGraceMs: 50 })

    const runner: CommandRunner = {
      run: async command =>
        command[0] === 'find'
          ? slowRunner.run([process.execPath, '-e', 'setTimeout(() => {}, 5000)'])
          : realRunner.run(command),
    }

    const discovery = createProjectDiscovery({ runner, ttlMs: 60_000 })

    const result = await discovery.load(configFor([dev]), 'projects')

    expect(result.items).toEqual([])
    expect(result.failures).toEqual([{ root: dev, reason: { kind: 'timeout', timeoutMs: 50 } }])
  })

  test('a find output-limit hit is classified', async () => {
    const dev = join(root, 'dev')
    await makeProject(join(dev, 'api'))
    await makeProject(join(dev, 'web'))

    const discovery = createProjectDiscovery({
      runner: createCommandRunner({ maxStdoutBytes: 8 }),
      ttlMs: 60_000,
    })

    const result = await discovery.load(configFor([dev]), 'projects')

    expect(result.items).toEqual([])
    expect(result.failures).toEqual([
      { root: dev, reason: { kind: 'output-limit', limitBytes: 8 } },
    ])
  })

  test('a find exit that still listed projects keeps them and its classified failure', async () => {
    const dev = join(root, 'dev')
    const project = await makeProject(join(dev, 'api'))

    const runner: CommandRunner = {
      run: async command =>
        command[0] === 'find'
          ? { exitCode: 1, stdout: `${project}\n`, stderr: "find: 'x': Permission denied\n" }
          : realRunner.run(command),
    }

    const discovery = createProjectDiscovery({ runner, ttlMs: 60_000 })

    const result = await discovery.load(configFor([dev]), 'projects')

    expect(paths(result)).toEqual([project])
    expect(result.failures).toEqual([
      {
        root: dev,
        reason: { kind: 'find-exit', exitCode: 1, stderr: "find: 'x': Permission denied" },
      },
    ])
  })
})

describe('project discovery failure messages', () => {
  function subscribe(discovery: ReturnType<typeof createProjectDiscovery>): DiscoveryFailure[][] {
    const reports: DiscoveryFailure[][] = []

    discovery.subscribeFailures(failures => {
      reports.push([...failures])
    })

    return reports
  }

  test('a missing root is classified but produces no message', async () => {
    const missing = join(root, 'missing')
    const discovery = createProjectDiscovery({ runner: realRunner, ttlMs: 60_000 })
    const reports = subscribe(discovery)

    const result = await discovery.load(configFor([missing]), 'projects')

    expect(result.failures).toEqual([{ root: missing, reason: { kind: 'missing' } }])
    expect(reports).toEqual([])
  })

  test('a partial find result produces no message', async () => {
    const dev = join(root, 'dev')
    const project = await makeProject(join(dev, 'api'))

    const runner: CommandRunner = {
      run: async command =>
        command[0] === 'find'
          ? { exitCode: 1, stdout: `${project}\n`, stderr: 'find: denied\n' }
          : realRunner.run(command),
    }

    const discovery = createProjectDiscovery({ runner, ttlMs: 60_000 })
    const reports = subscribe(discovery)

    const result = await discovery.load(configFor([dev]), 'projects')

    expect(result.failures).toHaveLength(1)
    expect(reports).toEqual([])
  })

  // Root ignores directory permissions, so the unreadable-root fixture cannot be built there.
  test.skipIf(process.getuid?.() === 0)(
    'an inaccessible root is reported once per run without its missing sibling',
    async () => {
      const healthy = join(root, 'healthy')
      await makeProject(join(healthy, 'api'))
      const missing = join(root, 'missing')
      const locked = join(root, 'locked')
      await mkdir(locked)
      await chmod(locked, 0o000)
      lockedPaths.push(locked)
      const discovery = createProjectDiscovery({ runner: realRunner, ttlMs: 60_000 })
      const reports = subscribe(discovery)
      const config = configFor([healthy, missing, locked])

      await discovery.load(config, 'projects')
      await discovery.load(config, 'projects')

      expect(reports).toEqual([
        [{ root: locked, reason: { kind: 'inaccessible', code: 'EACCES' } }],
      ])
    }
  )

  test('a nonzero find exit that listed nothing is reported', async () => {
    const dev = join(root, 'dev')
    await mkdir(dev)

    const runner: CommandRunner = {
      run: async command =>
        command[0] === 'find'
          ? { exitCode: 1, stdout: '', stderr: 'find: boom\n' }
          : realRunner.run(command),
    }

    const discovery = createProjectDiscovery({ runner, ttlMs: 60_000 })
    const reports = subscribe(discovery)

    await discovery.load(configFor([dev]), 'projects')

    expect(reports).toEqual([
      [{ root: dev, reason: { kind: 'find-exit', exitCode: 1, stderr: 'find: boom' } }],
    ])
  })

  test('the combined message names each root, its reason, and the next step', () => {
    const message = describeDiscoveryFailures([
      { root: '/srv/dev', reason: { kind: 'not-directory' } },
      { root: '/srv/work', reason: { kind: 'timeout', timeoutMs: 10_000 } },
    ])

    expect(message).toContain('/srv/dev (is not a directory)')
    expect(message).toContain('/srv/work (find timed out after 10 s)')
    expect(message).toContain('permissions')
    expect(message).toContain('project_paths')
  })
})
