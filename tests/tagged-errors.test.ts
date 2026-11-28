import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getConfigPath, getDefaultConfig, loadConfig, saveConfig } from '../src/config'
import { ConfigSaveRefused, ConfigUnparseable } from '../src/config/store'
import { MultiplexerError } from '../src/multiplexer/types'
import { FileSearchFailedError, FileSearchUnavailableError } from '../src/search/fff'

// Crash diagnostics read an error's own `message`, `name`, `stack` and `cause`, and callers match
// failures with `instanceof`; these pin that shape for the tagged errors.

describe('backend and file-search errors', () => {
  test('MultiplexerError keeps its code, message and name, and stays an Error', () => {
    const error = new MultiplexerError('server-stopped', 'Herdr is not running.')

    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe('MultiplexerError')
    expect(error.code).toBe('server-stopped')
    expect(error.message).toBe('Herdr is not running.')
    expect(Object.getOwnPropertyDescriptor(error, 'message')?.value).toBe('Herdr is not running.')
    expect(Object.getOwnPropertyDescriptor(error, 'name')?.value).toBe('MultiplexerError')
    expect(error.stack?.split('\n')[0]).toBe('MultiplexerError: Herdr is not running.')
  })

  test('FileSearchUnavailableError keeps a given cause and adds none otherwise', () => {
    const cause = new Error('dlopen failed')
    const reason = 'the native library could not be loaded'
    const withCause = new FileSearchUnavailableError(reason, { cause })
    const without = new FileSearchUnavailableError('the native library could not be loaded')

    expect(withCause).toBeInstanceOf(Error)
    expect(withCause._tag).toBe('FileSearchUnavailableError')
    expect(withCause.message).toBe('the native library could not be loaded')
    expect(Object.getOwnPropertyDescriptor(withCause, 'cause')?.value).toBe(cause)
    expect(Object.hasOwn(without, 'cause')).toBe(false)
    expect(Object.getOwnPropertyDescriptor(without, 'name')?.value).toBe(
      'FileSearchUnavailableError'
    )
    expect(without.stack?.split('\n')[0]).toBe(
      'FileSearchUnavailableError: the native library could not be loaded'
    )
  })

  test('FileSearchFailedError keeps its message and name', () => {
    const error = new FileSearchFailedError('scan failed')

    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe('FileSearchFailedError')
    expect(Object.getOwnPropertyDescriptor(error, 'message')?.value).toBe('scan failed')
    expect(Object.getOwnPropertyDescriptor(error, 'name')?.value).toBe('FileSearchFailedError')
  })
})

describe('config file errors', () => {
  let root = ''
  let home = ''
  const savedHome = process.env.HOME
  const savedXdg = process.env.XDG_CONFIG_HOME

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mux-sesh-tagged-errors-'))
    home = join(root, 'home')
    process.env.HOME = home
    delete process.env.XDG_CONFIG_HOME
    await mkdir(join(home, '.config', 'mux-sesh'), { recursive: true })
  })

  afterEach(async () => {
    process.env.HOME = savedHome

    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = savedXdg

    await rm(root, { recursive: true, force: true })
  })

  test('an unparseable config fails to load with its message and the parser error as cause', async () => {
    const configPath = getConfigPath(home)
    await writeFile(configPath, '{bad json')

    const failure = await rejectionOf(loadConfig())

    expect(failure).toBeInstanceOf(ConfigUnparseable)
    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toBe(
      `Failed to parse mux-sesh config at ${configPath}: it is not valid JSON. Fix the JSON or move the file aside; existing config was not overwritten.`
    )
    expect(Object.getOwnPropertyDescriptor(failure, 'message')?.value).toBe(failure.message)
    expect(Object.getOwnPropertyDescriptor(failure, 'cause')?.value).toBeInstanceOf(Error)
    expect(failure.stack?.split('\n')[0]).toBe(`Error: ${failure.message}`)
    expect(await readFile(configPath, 'utf8')).toBe('{bad json')
  })

  test('a save over an unparseable config is refused with its message', async () => {
    const configPath = getConfigPath(home)
    await writeFile(configPath, '{bad json')

    const failure = await rejectionOf(saveConfig(getDefaultConfig(home), home))

    expect(failure).toBeInstanceOf(ConfigSaveRefused)
    expect(failure.message).toBe(
      `The mux-sesh config at ${configPath} is no longer valid JSON, so the change was not saved. Fix the file, then try again.`
    )
    expect(Object.getOwnPropertyDescriptor(failure, 'cause')?.value).toBeInstanceOf(Error)
    expect(await readFile(configPath, 'utf8')).toBe('{bad json')
  })
})

async function rejectionOf(run: Promise<unknown>): Promise<Error> {
  try {
    await run
  } catch (cause) {
    if (cause instanceof Error) return cause
  }

  throw new Error('Expected the operation to fail with an Error')
}
