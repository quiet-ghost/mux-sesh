// Opens mux-sesh from source on one of its failure screens, for design and manual testing:
//   bun run dev:config-error | dev:backend-error | dev:crash
// Throwaway config and state live in a temp directory that is removed when the picker exits.
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'

export const DEV_SCREENS = ['config-error', 'backend-error', 'crash'] as const

export type DevScreen = (typeof DEV_SCREENS)[number]

type Env = Record<string, string>

interface PlannedFile {
  readonly path: string
  readonly contents: string
}

export interface DevScreenPlan {
  readonly env: Env
  readonly files: readonly PlannedFile[]
}

export type ParsedDevScreen =
  | { readonly kind: 'screen'; readonly screen: DevScreen }
  | { readonly kind: 'unknown'; readonly message: string }

// Fields the config check rejects by path: an unknown backend and a project without a path.
const INVALID_CONFIG = `${JSON.stringify({ backend: 'zellij', projects: [{}] }, null, 2)}\n`

// The variables that tell mux-sesh it runs inside a multiplexer.
const MULTIPLEXER_SESSION = ['TMUX', 'TMUX_PANE', 'HERDR_ENV']

function isDevScreen(value: string): value is DevScreen {
  return DEV_SCREENS.some(screen => screen === value)
}

export function parseDevScreen(value: string | undefined): ParsedDevScreen {
  if (value !== undefined && isDevScreen(value)) return { kind: 'screen', screen: value }

  return {
    kind: 'unknown',
    message: `Unknown screen "${value ?? ''}". Choose one of: ${DEV_SCREENS.join(', ')}. Example: bun run dev:crash`,
  }
}

function isSet(entry: [string, string | undefined]): entry is [string, string] {
  return entry[1] !== undefined
}

function definedEntries(base: Readonly<Record<string, string | undefined>>) {
  return Object.fromEntries(Object.entries(base).filter(isSet))
}

export function planDevScreen(
  screen: DevScreen,
  base: Readonly<Record<string, string | undefined>>,
  scratch: string,
  bunPath: string
): DevScreenPlan {
  const env = { ...definedEntries(base), MUX_SESH_DEV: '1', MUX_SESH_DISABLE_AUTOUPDATE: '1' }

  const throwaway = {
    XDG_CONFIG_HOME: join(scratch, 'config'),
    XDG_STATE_HOME: join(scratch, 'state'),
  }

  switch (screen) {
    case 'config-error':
      return {
        env: { ...env, ...throwaway },
        files: [
          {
            path: join(throwaway.XDG_CONFIG_HOME, 'mux-sesh', 'config.json'),
            contents: INVALID_CONFIG,
          },
        ],
      }
    case 'backend-error': {
      // Only Bun stays reachable, so neither tmux nor Herdr can be found.
      const hidden = Object.fromEntries(
        Object.entries(env).filter(([key]) => !MULTIPLEXER_SESSION.includes(key))
      )

      return { env: { ...hidden, ...throwaway, PATH: dirname(bunPath) }, files: [] }
    }

    case 'crash':
      return { env: { ...env, MUX_SESH_DEV_CRASH: '1' }, files: [] }
  }
}

export interface DevScreenExit {
  readonly exitCode: number
  readonly note?: string
}

// Quitting a failure screen exits mux-sesh with 1. Here that is the expected end, so the wrapper
// says so instead of letting Bun report a failed script.
export function devScreenExit(screen: DevScreen, code: number): DevScreenExit {
  if (code === 0) return { exitCode: 0 }

  if (code === 1) {
    return {
      exitCode: 0,
      note: `dev:${screen}: closed the screen (mux-sesh exits 1 after a failure screen)`,
    }
  }

  return { exitCode: code, note: `dev:${screen}: mux-sesh exited with code ${code}` }
}

async function main(): Promise<number> {
  const parsed = parseDevScreen(process.argv[2])

  if (parsed.kind === 'unknown') {
    console.error(parsed.message)

    return 2
  }

  const scratch = await mkdtemp(join(tmpdir(), 'mux-sesh-dev-screen-'))

  try {
    const plan = planDevScreen(parsed.screen, process.env, scratch, process.execPath)

    for (const file of plan.files) {
      await mkdir(dirname(file.path), { recursive: true })
      await writeFile(file.path, file.contents)
    }

    // The picker owns Ctrl+C; this wrapper only waits so it can clean up afterwards.
    process.on('SIGINT', () => {})

    const repo = resolve(import.meta.dir, '../..')

    const child = Bun.spawn([process.execPath, join(repo, 'src/index.tsx')], {
      cwd: repo,
      env: plan.env,
      stdio: ['inherit', 'inherit', 'inherit'],
    })

    const exit = devScreenExit(parsed.screen, await child.exited)

    if (exit.note) console.error(exit.note)

    return exit.exitCode
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

if (import.meta.main) process.exit(await main())
