import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDefaultConfig } from '../src/config'
import {
  CommandInterrupted,
  CommandTimeoutError,
  createCommandRunner,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from '../src/multiplexer/command'
import { getProjectPreview } from '../src/preview/project'
import type { Config } from '../src/types'

let projectPath = ''

beforeAll(async () => {
  projectPath = await mkdtemp(join(tmpdir(), 'mux-sesh-preview-'))
  await writeFile(join(projectPath, 'README.md'), 'fixture\n')
})

afterAll(async () => {
  await rm(projectPath, { recursive: true, force: true })
})

function configWithPreview(previewCommand: string): Config {
  return {
    ...getDefaultConfig('/fixture'),
    projectPaths: [],
    defaultSession: { previewCommand },
  }
}

interface RecordedRun {
  readonly command: readonly string[]
  readonly options: CommandOptions | undefined
}

function recordingRunner(reply: (command: readonly string[]) => Promise<CommandResult>) {
  const runs: RecordedRun[] = []

  const runner: CommandRunner = {
    async run(command, options) {
      runs.push({ command, options })

      return reply(command)
    },
  }

  return { runner, runs }
}

function previewOnly(stdout: string) {
  return recordingRunner(async command =>
    command[0] === 'git'
      ? { exitCode: 128, stdout: '', stderr: 'not a git repository' }
      : { exitCode: 0, stdout, stderr: '' }
  )
}

describe('configured project previews', () => {
  test('a changed preview rule shows its own output on the next read', async () => {
    const services = { runner: createCommandRunner() }
    const firstRule = configWithPreview('echo first-rule')
    const secondRule = configWithPreview('echo second-rule')

    const first = await getProjectPreview(projectPath, firstRule, undefined, services)
    const second = await getProjectPreview(projectPath, secondRule, undefined, services)

    expect(first.previewLines).toEqual(['first-rule'])
    expect(second.previewLines).toEqual(['second-rule'])
  })

  test('runs the preview and git reads through the owned runner with the caller signal', async () => {
    const { runner, runs } = previewOnly('one\ntwo\n')
    const controller = new AbortController()

    const preview = await getProjectPreview(projectPath, configWithPreview('ls {}'), undefined, {
      runner,
      signal: controller.signal,
    })

    expect(preview.previewKind).toBe('command')
    expect(preview.previewLines).toEqual(['one', 'two'])

    const commandRun = runs.find(run => run.command[0] === 'sh')
    expect(commandRun?.command.at(-1)).toContain(projectPath)
    expect(commandRun?.options?.cwd).toBe(projectPath)

    for (const run of runs) {
      expect(run.options?.signal?.aborted).toBe(false)
    }

    controller.abort()

    for (const run of runs) {
      expect(run.options?.signal?.aborted).toBe(true)
    }
  })

  test('a preview past its deadline falls back to the directory listing', async () => {
    const { runner } = recordingRunner(async command => {
      if (command[0] === 'git') return { exitCode: 128, stdout: '', stderr: '' }

      throw new CommandTimeoutError({ executable: 'sh', timeoutMs: 1500 })
    })

    const preview = await getProjectPreview(projectPath, configWithPreview('sleep 9'), undefined, {
      runner,
    })

    expect(preview.previewKind).toBe('directory')
    expect(preview.previewLines).toContain('README.md')
    expect(preview.previewNotice).toBe(
      'Preview command timed out; showing directory listing instead.'
    )
  })

  test('cancellation is not reported as a preview failure', async () => {
    const { runner } = recordingRunner(async () => {
      throw new CommandInterrupted({ executable: 'sh' })
    })

    const outcome = await getProjectPreview(projectPath, configWithPreview('sleep 9'), undefined, {
      runner,
    }).catch((cause: unknown) => cause)

    expect(outcome).toBeInstanceOf(CommandInterrupted)
  })
})
