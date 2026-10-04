import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, cp, mkdir, mkdtemp, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join, relative } from 'path'

const repoRoot = join(import.meta.dir, '..')

interface WrapperFixture {
  root: string
  packageRoot: string
  caller: string
  bin: string
  wrapper: string
  linkedWrapper: string
}

let fixture: WrapperFixture | undefined

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'mux-sesh-wrapper-'))
  const packageRoot = join(root, 'installed mux-sesh')
  const bin = join(root, 'bin')
  fixture = {
    root,
    packageRoot,
    caller: join(root, "caller's project"),
    bin,
    wrapper: join(packageRoot, 'bin/mux-sesh'),
    linkedWrapper: join(bin, 'launcher'),
  }
  await Promise.all([
    mkdir(join(fixture.caller, 'notes'), { recursive: true }),
    mkdir(bin),
    cp(join(repoRoot, 'src'), join(packageRoot, 'src'), { recursive: true }),
    cp(join(repoRoot, 'bin'), join(packageRoot, 'bin'), { recursive: true }),
  ])
  await Promise.all([
    Bun.write(join(fixture.caller, 'notes/todo.md'), 'fixture note'),
    Bun.write(join(packageRoot, 'package.json'), Bun.file(join(repoRoot, 'package.json'))),
    Bun.write(join(packageRoot, 'tsconfig.json'), Bun.file(join(repoRoot, 'tsconfig.json'))),
    Bun.write(
      join(packageRoot, 'src/index.tsx'),
      Bun.file(join(import.meta.dir, 'fixtures/cli-wrapper-probe.tsx'))
    ),
    symlink(join(repoRoot, 'node_modules'), join(packageRoot, 'node_modules'), 'dir'),
    symlink(process.execPath, join(bin, 'bun')),
    symlink(relative(bin, fixture.wrapper), join(bin, 'mux-sesh')),
    symlink(join(bin, 'mux-sesh'), fixture.linkedWrapper),
    Bun.write(
      join(fixture.caller, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          jsx: 'react',
          jsxFactory: 'callerJsxFactory',
          baseUrl: '.',
          paths: { '@/*': ['wrong-source/*'] },
        },
      })
    ),
  ])
  await chmod(fixture.wrapper, 0o755)
})

afterEach(async () => {
  const current = fixture
  fixture = undefined
  if (current) await rm(current.root, { recursive: true, force: true })
})

type Installation = 'direct' | 'symlink' | 'source'

async function runWrapperProbe(
  current: WrapperFixture,
  installation: Installation,
  args: string[]
): Promise<unknown> {
  const command =
    installation === 'source'
      ? [process.execPath, join(current.packageRoot, 'src/index.tsx')]
      : [installation === 'direct' ? current.wrapper : current.linkedWrapper]
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${current.bin}:${process.env.PATH ?? ''}`,
    MUX_SESH_INVOCATION_CWD: '/stale-parent-directory',
  }
  if (installation === 'source') delete env.MUX_SESH_INVOCATION_CWD
  const proc = Bun.spawn([...command, ...args], {
    cwd: installation === 'source' ? current.packageRoot : current.caller,
    env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
    killSignal: 'SIGKILL',
  })

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    expect(stderr).toBe('')
    expect(exitCode).toBe(0)
    const report: unknown = JSON.parse(stdout)
    return report
  } finally {
    if (proc.exitCode === null) proc.kill('SIGKILL')
    await proc.exited
  }
}

describe('packaged CLI wrapper', () => {
  test.each(['direct', 'symlink', 'source'] as const)(
    'preserves caller cwd and source bootstrap via %s installation',
    async installation => {
      if (!fixture) throw new Error('Wrapper fixture was not created')
      const args = ['argument with spaces', '--literal-argument']
      const report = await runWrapperProbe(fixture, installation, args)
      expect(report).toEqual({
        invocationCwd: installation === 'source' ? fixture.packageRoot : fixture.caller,
        args,
        sourceReady: true,
        handoffPresent: false,
        created: [],
      })
    }
  )

  test.each([
    { input: './notes/todo.md', title: 'notes_todo_md', directory: 'notes' },
    { input: './notes', title: 'notes', directory: 'notes' },
    { input: 'scratch', title: 'scratch', directory: '' },
  ])(
    'launches $input against the captured caller directory',
    async ({ input, title, directory }) => {
      if (!fixture) throw new Error('Wrapper fixture was not created')
      const report = await runWrapperProbe(fixture, 'symlink', ['launch', input])
      expect(report).toMatchObject({
        invocationCwd: fixture.caller,
        sourceReady: true,
        handoffPresent: false,
        created: [{ title, path: join(fixture.caller, directory) }],
      })
    }
  )
})
