import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { RGBA } from '@opentui/core'
import { getDefaultConfig } from '../src/config'
import { createCommandRunner } from '../src/multiplexer/command'
import { resolveTheme } from '../src/styles/theme'

// Runs the real entry point in real pseudo-terminals, so it stays opt-in:
//   MUX_SESH_TERMINAL_TESTS=1 bun test tests/terminal-handoff.test.ts
// Isolation: two harness-owned tmux servers, both inside one temporary directory.
// - host: `tmux -S <root>/host.sock`, whose pane is the terminal mux-sesh (or a client) runs in.
// - target: the default socket under TMUX_TMPDIR=<root>/t, the only server mux-sesh can reach.
// mux-sesh runs under `env -i` with a temporary HOME and a PATH of bun plus a tmux shim, so the
// user's tmux server, tmux.conf, mux-sesh config, and Herdr are all out of reach. Both servers are
// killed and the directory removed after every test.
const tmuxPath = Bun.which('tmux')
const envPath = Bun.which('env')
const enabled = process.env.MUX_SESH_TERMINAL_TESTS === '1' && tmuxPath !== null && envPath !== null
const repoRoot = join(import.meta.dir, '..')
const runner = createCommandRunner()

interface Harness {
  readonly root: string
  readonly home: string
  readonly record: string
  host(...args: string[]): Promise<string>
  target(...args: string[]): Promise<string>
  appEnv(): string[]
}

interface HarnessState {
  current?: Harness
}

const state: HarnessState = {}

function harness(): Harness {
  if (!state.current) throw new Error('The terminal harness was not set up')

  return state.current
}

async function tmux(
  env: Readonly<Record<string, string>>,
  args: readonly string[]
): Promise<string> {
  const result = await runner.run([tmuxPath ?? 'tmux', ...args], { env })

  if (result.exitCode !== 0)
    throw new Error(`Harness tmux ${args.join(' ')} failed: ${result.stderr}`)

  return result.stdout.trim()
}

// The shim records the terminal state at the exact moment the attach handoff starts, then
// becomes the real tmux. Captured commands pass through untouched.
function attachShim(realTmux: string, hostSocket: string, record: string): string {
  return [
    '#!/bin/sh',
    'if [ "$1" = attach-session ]; then',
    `  { printf 'argv=%s\\n' "$*"; /usr/bin/stty -a; printf 'alternate_on=%s\\n' "$('${realTmux}' -S '${hostSocket}' display-message -p -t host '#{alternate_on}')"; } > '${record}' 2>&1`,
    'fi',
    `exec '${realTmux}' "$@"`,
    '',
  ].join('\n')
}

async function createHarness(): Promise<Harness> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'mux-sesh-handoff-')))
  const home = join(root, 'home')
  const bin = join(root, 'bin')
  const tmuxTmpdir = join(root, 't')
  const hostSocket = join(root, 'host.sock')
  const hostConfig = join(root, 'host.conf')
  const record = join(root, 'attach-record')
  const serverEnv = { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), SHELL: '/bin/sh' }

  await Promise.all([
    mkdir(join(home, '.config'), { recursive: true }),
    mkdir(bin),
    mkdir(tmuxTmpdir),
  ])
  await Promise.all([
    symlink(process.execPath, join(bin, 'bun')),
    writeFile(join(bin, 'tmux'), attachShim(tmuxPath ?? 'tmux', hostSocket, record)),
    // Keeps the picker's pane after it exits, so its exit status and final modes can be read.
    writeFile(hostConfig, 'set -g remain-on-exit on\n'),
  ])
  await chmod(join(bin, 'tmux'), 0o755)

  return {
    root,
    home,
    record,
    host: (...args) => tmux(serverEnv, ['-S', hostSocket, '-f', hostConfig, ...args]),
    target: (...args) =>
      tmux({ ...serverEnv, TMUX_TMPDIR: tmuxTmpdir }, [
        '-L',
        'default',
        '-f',
        '/dev/null',
        ...args,
      ]),
    appEnv: () => [
      `HOME=${home}`,
      `XDG_CONFIG_HOME=${join(home, '.config')}`,
      `XDG_CACHE_HOME=${join(home, '.cache')}`,
      `XDG_STATE_HOME=${join(home, '.local', 'state')}`,
      `PATH=${bin}`,
      `TMUX_TMPDIR=${tmuxTmpdir}`,
      'LANG=C.UTF-8',
      'MUX_SESH_DISABLE_AUTOUPDATE=1',
    ],
  }
}

async function disposeHarness(current: Harness): Promise<void> {
  await Promise.allSettled([current.host('kill-server'), current.target('kill-server')])
  await rm(current.root, { recursive: true, force: true })
}

beforeEach(async () => {
  if (enabled) state.current = await createHarness()
})

afterEach(async () => {
  const current = state.current

  state.current = undefined

  if (current) await disposeHarness(current)
})

async function waitFor(
  what: string,
  check: () => Promise<boolean>,
  timeoutMs = 8000
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return

    await Bun.sleep(50)
  }

  const screen = await hostScreen().catch(() => '(the host screen could not be read)')

  throw new Error(`Timed out waiting for ${what}. Host screen:\n${screen}`)
}

function hostScreen(): Promise<string> {
  return harness().host('capture-pane', '-p', '-t', 'host')
}

function hostPane(format: string): Promise<string> {
  return harness().host('display-message', '-p', '-t', 'host', format)
}

async function waitForScreen(text: string): Promise<void> {
  await waitFor(`'${text}' on the host screen`, async () => (await hostScreen()).includes(text))
}

// The host screen with its SGR escapes, so row backgrounds can be read.
function hostStyledScreen(): Promise<string> {
  return harness().host('capture-pane', '-p', '-e', '-t', 'host')
}

interface ScreenCell {
  char: string
  bg: string
}

// Background-setting SGR parameters; every other parameter leaves the background alone.
function applySgr(params: number[], bg: string): string {
  let current = bg

  for (let index = 0; index < params.length; index++) {
    const param = params[index] ?? 0

    if (param === 0 || param === 49) current = 'default'
    else if ((param >= 40 && param <= 47) || (param >= 100 && param <= 107)) current = `${param}`
    else if (param === 38 || param === 48) {
      const mode = params[index + 1]
      const width = mode === 2 ? 3 : mode === 5 ? 1 : 0
      const color = params.slice(index + 2, index + 2 + width).join(';')

      if (param === 48) current = `${mode}:${color}`
      index += 1 + width
    }
  }

  return current
}

const CSI = '\u001b['

// `capture-pane -e` output as rows of cells, each with the background it is drawn on.
function parseStyledScreen(screen: string): ScreenCell[][] {
  const rows: ScreenCell[][] = [[]]
  let bg = 'default'
  let index = 0

  while (index < screen.length) {
    const char = screen[index] ?? ''

    if (screen.startsWith(CSI, index)) {
      const params = /^[0-9;:]*/.exec(screen.slice(index + CSI.length))?.[0] ?? ''
      const end = index + CSI.length + params.length

      if (screen[end] === 'm') {
        bg = applySgr(
          params.split(/[;:]/).map(part => (part === '' ? 0 : Number(part))),
          bg
        )
      }

      index = end + 1
    } else if (char === '\n') {
      rows.push([])
      index++
    } else {
      const codePoint = screen.codePointAt(index) ?? 0
      const text = String.fromCodePoint(codePoint)
      rows[rows.length - 1]?.push({ char: text, bg })
      index += text.length
    }
  }

  return rows
}

// tmux's colour_find_rgb: a 24-bit color as the nearest xterm-256 cube or grey entry, the way a
// pane without RGB support stores it.
function tmux256(r: number, g: number, b: number): number {
  const toCube = (value: number) =>
    value < 48 ? 0 : value < 114 ? 1 : Math.floor((value - 35) / 40)

  // The cube's levels: 0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff.
  const level = (index: number) => (index === 0 ? 0 : 55 + 40 * index)
  const distance = (x: number, y: number, z: number) => (x - r) ** 2 + (y - g) ** 2 + (z - b) ** 2
  const [qr, qg, qb] = [toCube(r), toCube(g), toCube(b)]
  const [cr, cg, cb] = [level(qr), level(qg), level(qb)]
  const cube = 16 + 36 * qr + 6 * qg + qb

  if (cr === r && cg === g && cb === b) return cube

  const average = Math.floor((r + g + b) / 3)
  const greyIndex = average > 238 ? 23 : Math.floor((average - 3) / 10)
  const grey = 8 + 10 * greyIndex

  return distance(grey, grey, grey) < distance(cr, cg, cb) ? 232 + greyIndex : cube
}

// The picker runs on the default theme; the terminal decides its light or dark variant, and the
// pane stores the color in 24 bits or as its xterm-256 match.
const SELECTION_BACKGROUNDS = new Set(
  (['light', 'dark'] as const).flatMap(mode => {
    const { selection } = resolveTheme(getDefaultConfig('/').theme, {}, mode).colors
    const [r, g, b] = RGBA.fromHex(selection).toInts()

    return [`2:${r};${g};${b}`, `5:${tmux256(r, g, b)}`]
  })
)

// The selected list row: no bar, so it is the one row with a session status whose cells from the
// row's first column through the status are drawn on the theme's selection background.
function selectedRow(screen: string): string | undefined {
  const selected = parseStyledScreen(screen).flatMap(cells => {
    const text = cells.map(cell => cell.char).join('')
    const status = text.search(/[●○]/)
    const lead = cells.slice(1, status + 1)

    if (status < 1 || !lead.every(cell => SELECTION_BACKGROUNDS.has(cell.bg))) return []

    return [text]
  })

  return selected.length === 1 ? selected[0] : undefined
}

// Row order follows each session's directory name, which varies with where the repo is checked
// out, so rows are reached by title rather than by position.
async function moveCursorTo(title: string): Promise<void> {
  const isSelected = async () =>
    selectedRow(await hostStyledScreen())?.includes(` ${title} `) === true

  for (let step = 0; step < 6 && !(await isSelected()); step++) await press('k')

  for (let step = 0; step < 6 && !(await isSelected()); step++) await press('j')

  await waitFor(`the cursor on ${title}`, isSelected)
}

async function press(...keys: string[]): Promise<void> {
  for (const key of keys) {
    await harness().host('send-keys', '-t', 'host', key)
    // A key right after Escape would arrive as an Alt chord.
    await Bun.sleep(key === 'Escape' ? 500 : 150)
  }
}

// mux-sesh as a user starts it from a plain terminal, outside any multiplexer.
async function startPickerOutsideTmux(): Promise<void> {
  await harness().host(
    'new-session',
    '-d',
    '-s',
    'host',
    '-x',
    '110',
    '-y',
    '30',
    '-c',
    repoRoot,
    '--',
    envPath ?? 'env',
    '-i',
    ...harness().appEnv(),
    'TERM=xterm-256color',
    process.execPath,
    join(repoRoot, 'src/index.tsx')
  )
  await waitForScreen('select enter')
}

async function seedTarget(name: string, ...command: string[]): Promise<string> {
  return harness().target(
    'new-session',
    '-d',
    '-s',
    name,
    '-c',
    harness().home,
    '-P',
    '-F',
    '#{session_id}',
    '--',
    ...(command.length > 0 ? command : ['sleep', '600'])
  )
}

async function deadStatus(): Promise<number> {
  await waitFor('the picker to exit', async () => (await hostPane('#{pane_dead}')) === '1')

  return Number(await hostPane('#{pane_dead_status}'))
}

// Terminal modes the picker must have reset by the time its process is gone.
async function expectTerminalModesRestored(): Promise<void> {
  expect(await hostPane('alt=#{alternate_on} mouse=#{mouse_any_flag}')).toBe('alt=0 mouse=0')
}

function sttyFlags(record: string): Set<string> {
  return new Set(record.split(/[\s;]+/))
}

describe.skipIf(!enabled)('terminal handoff in isolated tmux servers', () => {
  test('external attach starts only after the picker restored the terminal', async () => {
    const id = await seedTarget(
      'target',
      '/bin/sh',
      '-c',
      'echo HANDOFF-TARGET-READY; exec sleep 600'
    )

    await startPickerOutsideTmux()
    await waitForScreen('target')
    await press('Enter')
    await waitFor(
      'the attached client',
      async () => (await harness().target('list-clients', '-F', '#{session_id}')) === id
    )

    const record = await readFile(harness().record, 'utf8')
    const flags = sttyFlags(record)

    // The captured native id, not the title, is what the handoff attaches to.
    expect(record).toContain(`argv=attach-session -t ${id}\n`)

    // Cooked mode is back: canonical input, echo, and signals.
    for (const flag of ['icanon', 'echo', 'isig']) expect(flags.has(flag)).toBe(true)

    for (const flag of ['-icanon', '-echo', '-isig']) expect(flags.has(flag)).toBe(false)
    expect(record).toContain('alternate_on=0\n')
    await waitForScreen('HANDOFF-TARGET-READY')

    await harness().target('detach-client', '-s', 'target')

    expect(await deadStatus()).toBe(0)
    await expectTerminalModesRestored()
  }, 30000)

  test('a target closed before selection is a recoverable error, not a handoff', async () => {
    await seedTarget('keep')
    await seedTarget('gone')
    await startPickerOutsideTmux()
    await waitForScreen('gone')

    await harness().target('kill-session', '-t', 'gone')
    // The list on screen is now stale; search picks the vanished row by name.
    await press('i', 'gone', 'Enter')
    await waitForScreen('no longer available')

    expect(await hostPane('#{pane_dead}')).toBe('0')
    expect(await readFile(harness().record, 'utf8').catch(() => 'no attach')).toBe('no attach')

    await press('Escape', 'q')

    expect(await deadStatus()).toBe(0)
    await expectTerminalModesRestored()
  }, 30000)

  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 0],
    ['SIGHUP', 0],
    ['SIGQUIT', 131],
  ] as const) {
    test(`${signal} exits ${code} and leaves the terminal restored`, async () => {
      await seedTarget('target')
      await startPickerOutsideTmux()

      process.kill(Number(await hostPane('#{pane_pid}')), signal)

      expect(await deadStatus()).toBe(code)
      await expectTerminalModesRestored()
    }, 30000)
  }

  test('inside tmux, a batch refuses the picker host, keeps focus on it, then focuses without a handoff', async () => {
    const alpha = await seedTarget('alpha')
    const bravo = await seedTarget('bravo')

    // The picker runs in a session of the target server, seen through a real attached client.
    const picker = await harness().target(
      'new-session',
      '-d',
      '-s',
      'picker',
      '-c',
      repoRoot,
      '-P',
      '-F',
      '#{session_id}',
      '--',
      '/bin/sh',
      '-c',
      `exec '${envPath ?? 'env'}' -i ${harness().appEnv().join(' ')} TERM=tmux-256color TMUX="$TMUX" TMUX_PANE="$TMUX_PANE" '${process.execPath}' '${join(repoRoot, 'src/index.tsx')}'`
    )

    await harness().target('set-option', '-t', 'picker', 'remain-on-exit', 'on')
    await harness().host(
      'new-session',
      '-d',
      '-s',
      'host',
      '-x',
      '110',
      '-y',
      '30',
      '--',
      envPath ?? 'env',
      '-i',
      ...harness().appEnv(),
      'TERM=xterm-256color',
      tmuxPath ?? 'tmux',
      '-L',
      'default',
      'attach-session',
      '-t',
      picker
    )
    await waitForScreen('select enter')
    await waitForScreen('picker')

    const clientSession = () => harness().target('list-clients', '-F', '#{session_id}')

    // Mark alpha and the picker host, then review the batch.
    await moveCursorTo('alpha')
    await press('m')
    await moveCursorTo('picker')
    await press('m', 'd')
    await waitForScreen("Not closing 'picker'")
    await press('Enter')
    await waitForScreen("Closed session 'alpha'")

    expect((await harness().target('list-sessions', '-F', '#{session_id}')).split('\n')).toEqual([
      bravo,
      picker,
    ])
    expect(await clientSession()).toBe(picker)
    expect(alpha).not.toBe(picker)

    await press('Escape')
    await waitFor(
      'the results to close',
      async () => !(await hostScreen()).includes('Closed session')
    )
    await moveCursorTo('bravo')
    await press('Enter')
    await waitFor('the client to switch to bravo', async () => (await clientSession()) === bravo)

    // Focus switched the client in place: no attach handoff ran, and the picker exited cleanly.
    expect(await readFile(harness().record, 'utf8').catch(() => 'no attach')).toBe('no attach')
    await waitFor(
      'the picker to exit',
      async () =>
        (await harness().target('display-message', '-p', '-t', 'picker', '#{pane_dead}')) === '1'
    )
    expect(
      await harness().target('display-message', '-p', '-t', 'picker', '#{pane_dead_status}')
    ).toBe('0')
  }, 30000)
})
