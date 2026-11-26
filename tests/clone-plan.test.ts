import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { lstat, mkdir, readdir, symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { Result } from 'effect'
import { CommandTimeoutError } from '../src/multiplexer/command'
import {
  checkCloneDestination,
  CloneDestinationRefused,
  executeCheckout,
  type ClonePlan,
} from '../src/sessions/clone-plan'
import { parseGitHubURL, type GitHubRepository } from '../src/util/github'
import { createLocalGitHub, type LocalGitHub } from './fixtures/local-github'

let github: LocalGitHub

beforeEach(async () => {
  github = await createLocalGitHub()
  await mkdir(github.reposPath)
})

afterEach(async () => {
  await github.remove()
})

function repository(input: string): GitHubRepository {
  const parsed = parseGitHubURL(input)

  if (parsed.kind !== 'repository') throw new Error(`Expected a GitHub repository: ${input}`)

  return parsed.repository
}

const widget = repository('https://github.com/acme/widget')

function check(repo: GitHubRepository = widget) {
  return checkCloneDestination(repo, github.reposPath, github.services.inspect)
}

function refusalOf(destination: Awaited<ReturnType<typeof check>>) {
  if (destination.kind !== 'refused') throw new Error(`Expected a refusal, got ${destination.kind}`)

  return destination.refusal
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false
  )
}

describe('clone destination check', () => {
  test('a missing destination is absent', async () => {
    expect(await check()).toEqual({ kind: 'absent' })
  })

  test('a complete checkout of the same repository, by either transport, is reusable', async () => {
    await github.checkout(join(github.reposPath, 'widget'), 'git@github.com:ACME/widget.git', true)

    expect(await check()).toEqual({ kind: 'reusable' })
  })

  test('another owner’s repository with the same basename is a collision, not a reuse', async () => {
    await github.checkout(
      join(github.reposPath, 'widget'),
      'https://github.com/other/widget.git',
      true
    )

    const refusal = refusalOf(await check())
    expect(refusal).toEqual({ kind: 'other-repository', origin: 'other/widget' })

    const message = new CloneDestinationRefused({
      repository: widget,
      destination: join(github.reposPath, 'widget'),
      refusal,
    }).message

    expect(message).toContain('already holds other/widget, not acme/widget')
    expect(message).toContain('Nothing was cloned or created')
  })

  test('an unrelated directory, a file, and a checkout without origin are refused', async () => {
    await mkdir(join(github.reposPath, 'widget'))
    await writeFile(join(github.reposPath, 'widget', 'notes.txt'), 'mine')
    expect(refusalOf(await check())).toEqual({ kind: 'not-checkout' })

    const file = repository('https://github.com/acme/file')
    await writeFile(join(github.reposPath, 'file'), 'not a directory')
    expect(refusalOf(await check(file))).toEqual({ kind: 'not-directory' })

    const bare = repository('https://github.com/acme/bare')
    await github.checkout(join(github.reposPath, 'bare'), undefined, true)
    expect(refusalOf(await check(bare))).toEqual({ kind: 'other-repository', origin: undefined })

    expect(await readdir(join(github.reposPath, 'widget'))).toEqual(['notes.txt'])
  })

  test('a directory inside another checkout is not treated as its own checkout', async () => {
    await github.checkout(github.reposPath, 'https://github.com/acme/widget.git', true)
    await mkdir(join(github.reposPath, 'widget'))

    expect(refusalOf(await check())).toEqual({ kind: 'not-checkout' })
  })

  test('a symlink that resolves outside the repos path is refused even if it holds the repository', async () => {
    const outside = join(github.root, 'elsewhere', 'widget')
    await github.checkout(outside, 'https://github.com/acme/widget.git', true)
    await symlink(outside, join(github.reposPath, 'widget'))

    expect(refusalOf(await check())).toEqual({ kind: 'outside-repos', resolved: outside })
  })

  test('a symlink that stays inside the repos path is checked like the directory it names', async () => {
    await github.checkout(
      join(github.reposPath, 'real-widget'),
      'https://github.com/acme/widget.git',
      true
    )
    await symlink(join(github.reposPath, 'real-widget'), join(github.reposPath, 'widget'))

    expect(await check()).toEqual({ kind: 'reusable' })
  })

  test('a checkout with the right origin but no commits may be a partial clone and is refused', async () => {
    await github.checkout(
      join(github.reposPath, 'widget'),
      'https://github.com/acme/widget.git',
      false
    )

    const refusal = refusalOf(await check())
    expect(refusal).toEqual({ kind: 'incomplete' })
    expect(
      new CloneDestinationRefused({
        repository: widget,
        destination: join(github.reposPath, 'widget'),
        refusal,
      }).message
    ).toContain('may be a partial clone')
  })
})

function plan(checkout: ClonePlan['checkout']): ClonePlan {
  return {
    repository: widget,
    reposPath: github.reposPath,
    destination: join(github.reposPath, 'widget'),
    checkout,
  }
}

describe('checkout execution', () => {
  test('clones into the frozen destination and records the canonical origin', async () => {
    await github.publish('acme', 'widget')

    const result = await executeCheckout(plan('clone'), github.services)

    expect(result).toEqual(
      Result.succeed({ kind: 'cloned', repository: widget, path: join(github.reposPath, 'widget') })
    )
    expect(github.clones).toHaveLength(1)

    const origin = await github.git(
      ['config', '--get', 'remote.origin.url'],
      join(github.reposPath, 'widget')
    )

    expect(origin.stdout.trim()).toBe('https://github.com/acme/widget.git')
    expect(await check()).toEqual({ kind: 'reusable' })
  })

  test('a reuse re-verifies the checkout and never clones', async () => {
    await github.checkout(
      join(github.reposPath, 'widget'),
      'https://github.com/acme/widget.git',
      true
    )

    expect(await executeCheckout(plan('reuse'), github.services)).toEqual(
      Result.succeed({ kind: 'reused', repository: widget, path: join(github.reposPath, 'widget') })
    )
    expect(github.clones).toEqual([])
  })

  test('a destination that appeared after planning stops the clone', async () => {
    await github.checkout(
      join(github.reposPath, 'widget'),
      'https://github.com/acme/widget.git',
      true
    )

    const result = await executeCheckout(plan('clone'), github.services)

    expect(result).toEqual(Result.fail({ kind: 'changed', destination: { kind: 'reusable' } }))
    expect(github.clones).toEqual([])
  })

  test('a failed clone reports git’s reason and whether anything was left on disk', async () => {
    await github.publish('acme', 'gadget')

    const result = await executeCheckout(plan('clone'), github.services)

    expect(Result.isFailure(result) && result.failure).toMatchObject({
      kind: 'failed',
      left: false,
    })
    expect(
      Result.isFailure(result) && result.failure.kind === 'failed' && result.failure.reason
    ).toContain('acme/widget')
    expect(await exists(join(github.reposPath, 'widget'))).toBe(false)
  })

  test('a timed-out clone is unknown, keeps what it left, and the leftover is never reused blindly', async () => {
    github.interceptClone(async () => {
      await github.checkout(
        join(github.reposPath, 'widget'),
        'https://github.com/acme/widget.git',
        false
      )

      throw new CommandTimeoutError({ executable: 'git', timeoutMs: 600_000 })
    })

    const result = await executeCheckout(plan('clone'), github.services)

    expect(Result.isFailure(result) && result.failure).toMatchObject({
      kind: 'unknown',
      left: true,
    })
    expect(await exists(join(github.reposPath, 'widget', '.git'))).toBe(true)
    expect(refusalOf(await check())).toEqual({ kind: 'incomplete' })

    expect(await executeCheckout(plan('clone'), github.services)).toMatchObject(
      Result.fail({
        kind: 'changed',
        destination: { kind: 'refused', refusal: { kind: 'incomplete' } },
      })
    )
    expect(github.clones).toHaveLength(1)
  })
})
