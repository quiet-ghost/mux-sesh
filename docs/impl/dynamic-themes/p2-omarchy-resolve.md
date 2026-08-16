# P2: theme=system resolves Omarchy colors.toml

Repo source: `docs/impl/dynamic-themes/p2-omarchy-resolve.md`

Blocked by P1 (`system` id must already persist). Linear: DEV-96.

Do this after P1. No live follow, no terminal OSC palette.

## Goal

Today, picking **System** writes `theme: "system"` and live-previews, but `resolveTheme('system')` does not know that id. It falls through to Rose Pine (`DEFAULT_THEME_ID`). On an Omarchy machine that looks wrong: the picker says System, the UI still paints the catalog Rose Pine.

This phase makes `theme: "system"` mean: if this home dir has a readable Omarchy `colors.toml`, paint those colors. If not, keep today's Rose Pine fallback (P4 replaces that fallback with the terminal palette).

**Do not add an `omarchy` option.** Omarchy is an implementation detail of `system`. Detection is automatic from files under `~/.local/state/omarchy/`.

After this phase:

* Launch mux-sesh with `"theme": "system"` on an Omarchy box → UI colors come from `colors.toml`, not catalog Rose Pine (unless those hexes happen to match)
* Named catalog / custom ids still ignore Omarchy files
* Default theme stays `rosepine`
* `resolveTheme` stays **synchronous**
* Tests do not need Omarchy installed; they inject a fake home dir or a parsed palette
* Live reload when Omarchy switches is P3. This phase is resolve-once (startup + each `resolveTheme` call)

## How the current code works

Read these first:

1. P1 already persists `theme: "system"`. `src/settings.ts` has a private `SYSTEM_THEME_ID = 'system'`. `getThemeOptions` puts it first. `applyOptionSetting(config, 'theme', 'system')` only stores the string.
2. `src/app/controller.ts` around line 96 calls `resolveTheme(themePreviewId ?? config?.theme, config?.themes, config?.colorScheme)` on every render. Preview and persist both go through this.
3. `resolveTheme` in `src/styles/theme.tsx` aliases a few ids, then:
   ```ts
   const id = normalizedID && catalog[normalizedID] ? normalizedID : DEFAULT_THEME_ID
   ```
   `'system'` is not in `BUILTIN_THEMES` or `config.themes`, so it becomes `'rosepine'`. Returned `id` is `'rosepine'`, not `'system'`.
4. `getSystemColorScheme()` already exists. It reads `MUX_SESH_COLOR_SCHEME` then `COLORFGBG`. It does **not** read Omarchy. Leave it for named themes and for the no-Omarchy fallback. Do not teach it Omarchy paths.
5. `src/config/index.ts` already accepts any non-empty `theme` string, including `"system"`. Default remains `rosepine`. No schema enum to change.
6. `src/styles/omarchy.ts` exists and is empty. Fill it. Do not add a second Omarchy module.
7. File IO elsewhere uses `Bun.file` (async). `resolveTheme` is called during React render, so this phase **must** use synchronous `node:fs` (`existsSync` / `readFileSync`) inside `omarchy.ts` only. Do not make `resolveTheme` async.

## How Omarchy exposes the palette

Canonical files (read only). Both are under the injected home dir, never hardcoded `/home/...`:

* `join(homeDir, '.local/state/omarchy/current/theme.name')` — slug, e.g. `rose-pine-dark`. Overwritten in place. Optional for P2. Export the path helper so P3 can watch it. Do **not** use the slug as mux-sesh's theme id. Resolved id stays `'system'`.
* `join(homeDir, '.local/state/omarchy/current/theme/colors.toml')` — current semantic colors. The **directory** `theme/` is deleted and replaced on every `omarchy theme set`. Do not treat that path as a stable inode (P3 watches `theme.name`, never this file).

A real `colors.toml` looks like this (rose-pine-dark, 2026-08):

```toml
mode = "dark"

accent = "#ebbcba"
selection = "#524f67"
muted = "#6e6a86"

background = "#191724"
dark_background = "#13111b"
darker_background = "#0d0b12"
lighter_background = "#26233a"

foreground = "#e0def4"
dark_foreground = "#6e6a86"
light_foreground = "#908caa"
bright_foreground = "#e0def4"

red = "#eb6f92"
yellow = "#f6c177"
orange = "#ebbcba"
green = "#31748f"
cyan = "#9ccfd8"
blue = "#9ccfd8"
magenta = "#c4a7e7"
brown = "#6e6a86"

bright_red = "#eb6f92"
bright_yellow = "#f6c177"
bright_green = "#31748f"
bright_cyan = "#9ccfd8"
bright_blue = "#9ccfd8"
bright_magenta = "#c4a7e7"
```

Light themes (e.g. `/usr/share/omarchy/themes/catppuccin-latte/colors.toml`, `/usr/share/omarchy/themes/rose-pine/colors.toml`) use the same keys with `mode = "light"`.

Do **not** shell out to `omarchy-theme-color`. Parse the small key=value file. Tests must not need Omarchy installed.

## New files

### `src/styles/omarchy.ts`

This module is the only place that knows Omarchy paths and `colors.toml` keys. Fill the existing empty file.

Export:

```ts
export const OMARCHY_STATE_DIR = ['.local', 'state', 'omarchy', 'current'] as const

export type OmarchyMode = 'light' | 'dark'

export interface OmarchyPalette {
  mode: OmarchyMode
  background: string
  foreground: string
  accent?: string
  selection?: string
  muted?: string
  dark_background?: string
  darker_background?: string
  lighter_background?: string
  dark_foreground?: string
  light_foreground?: string
  bright_foreground?: string
  red?: string
  yellow?: string
  orange?: string
  green?: string
  cyan?: string
  blue?: string
  magenta?: string
  brown?: string
  bright_red?: string
  bright_yellow?: string
  bright_green?: string
  bright_cyan?: string
  bright_blue?: string
  bright_magenta?: string
}

export function getOmarchyThemeNamePath(homeDir: string): string
export function getOmarchyColorsPath(homeDir: string): string
export function isOmarchyPresent(homeDir: string): boolean
export function parseOmarchyColorsToml(text: string): OmarchyPalette | null
export function readOmarchyPalette(homeDir: string): OmarchyPalette | null
export function omarchyPaletteToThemeColors(palette: OmarchyPalette): ThemeColors
```

Paths:

```ts
import { join } from 'path'
import { existsSync, readFileSync } from 'node:fs'

export function getOmarchyThemeNamePath(homeDir: string): string {
  return join(homeDir, '.local/state/omarchy/current/theme.name')
}

export function getOmarchyColorsPath(homeDir: string): string {
  return join(homeDir, '.local/state/omarchy/current/theme/colors.toml')
}
```

`isOmarchyPresent(homeDir)` is `existsSync(getOmarchyColorsPath(homeDir))`. Do not require `theme.name`.

#### Parser rules (`parseOmarchyColorsToml`)

Line scanner. Not a TOML library. Never throw. Return `null` on failure.

For each line:

1. Trim.
2. Skip empty lines.
3. Skip lines whose first non-whitespace character is `#`.
4. Split on the **first** `=`. If none, skip the line.
5. Key = left side, trimmed, lowercased.
6. Value = right side, trimmed, then strip one matching pair of `"` or `'` if present.
7. Ignore unknown keys.
8. For color keys, accept `#rgb`, `#rrggbb`, and `#rrggbbaa` (hex digits only). Normalize `#rgb` the same way `src/styles/theme.tsx` `normalizeHex` does (duplicate that helper locally; do not export theme internals). Reject anything else for that key (omit optional; fail the parse if it was `background` or `foreground`).

Required keys: `background`, `foreground`. If either is missing or not a valid hex, return `null`.

Mode, in order:

1. `mode` is `'light'` or `'dark'` (case-insensitive) → use it.
2. Else `theme_type` is `'light'` or `'dark'` → use it.
3. Else luminance of `background` (`0.299r + 0.587g + 0.114b`) `> 150` → `'light'`, else `'dark'`.

Do not treat a missing `mode` as failure.

#### `readOmarchyPalette`

```ts
export function readOmarchyPalette(homeDir: string): OmarchyPalette | null {
  try {
    const colorsPath = getOmarchyColorsPath(homeDir)
    if (!existsSync(colorsPath)) {
      return null
    }

    const text = readFileSync(colorsPath, 'utf8')
    return parseOmarchyColorsToml(text)
  } catch {
    return null
  }
}
```

Never throw. Missing file, unreadable file, empty file, garbage → `null`.

#### `omarchyPaletteToThemeColors`

Map the **current** Omarchy palette (one set of hexes, not light+dark variants) onto `ThemeColors`. Omarchy only publishes the active desktop colors. Do not invent an opposite-mode variant.

Use this exact mapping. Optional keys fall back in the order written. `mix` / `readableText` are local copies of the helpers in `theme.tsx`.

```ts
export function omarchyPaletteToThemeColors(palette: OmarchyPalette): ThemeColors {
  const background = palette.background
  const text = palette.foreground
  const muted = palette.muted ?? palette.dark_foreground ?? mix(text, background, 0.5)
  const chrome = palette.cyan ?? palette.blue ?? palette.accent ?? text
  const accent = palette.accent ?? palette.orange ?? chrome
  const danger = palette.red ?? palette.bright_red ?? text
  const selection = chrome

  return {
    background,
    surface: background,
    surfaceAlt: palette.lighter_background ?? mix(background, text, 0.08),
    surfaceModal: palette.dark_background ?? mix(background, text, 0.04),
    overlay: '#000000',
    border: muted,
    borderMuted: palette.dark_foreground ?? muted,
    text,
    textMuted: muted,
    textSubtle: muted,
    primary: chrome,
    secondary: palette.magenta ?? accent,
    accent,
    active: palette.green ?? palette.bright_green ?? text,
    inactive: muted,
    key: palette.yellow ?? palette.bright_yellow ?? palette.orange ?? text,
    action: accent,
    separator: muted,
    program: palette.green ?? palette.bright_green ?? text,
    fileTree: chrome,
    danger,
    dangerSurface: mix(background, danger, 0.2),
    selection,
    selectionText: readableText(selection),
  }
}
```

Using rose-pine-dark.toml above, the mapped colors **must** be:

| ThemeColors     | hex       | from                  |
| --------------- | --------- | --------------------- |
| background      | `#191724` | background            |
| surface         | `#191724` | background            |
| surfaceAlt      | `#26233a` | lighter_background    |
| surfaceModal    | `#13111b` | dark_background       |
| overlay         | `#000000` | overlay               |
| border          | `#6e6a86` | muted                 |
| borderMuted     | `#6e6a86` | dark_foreground       |
| text            | `#e0def4` | foreground            |
| textMuted       | `#6e6a86` | muted                 |
| textSubtle      | `#6e6a86` | muted                 |
| primary         | `#9ccfd8` | cyan                  |
| secondary       | `#c4a7e7` | magenta               |
| accent          | `#ebbcba` | accent                |
| active          | `#31748f` | green                 |
| inactive        | `#6e6a86` | muted                 |
| key             | `#f6c177` | yellow                |
| action          | `#ebbcba` | accent                |
| separator       | `#6e6a86` | muted                 |
| program         | `#31748f` | green                 |
| fileTree        | `#9ccfd8` | cyan                  |
| danger          | `#eb6f92` | red                   |
| dangerSurface   | mix       | background+red        |
| selection       | `#9ccfd8` | cyan                  |
| selectionText   | `#171717` | `readableText`        |

### Test fixtures

Copy real Omarchy key sets. Do not invent a different schema.

* `tests/fixtures/omarchy/rose-pine-dark.toml` — the dark file quoted above (`mode = "dark"`, `background = "#191724"`)
* `tests/fixtures/omarchy/catppuccin.toml` — copy `/usr/share/omarchy/themes/catppuccin/colors.toml` (`mode = "dark"`, `background = "#1e1e2e"`, `accent = "#89b4fa"`)
* `tests/fixtures/omarchy/light-sample.toml` — copy `/usr/share/omarchy/themes/catppuccin-latte/colors.toml` (`mode = "light"`, `background = "#eff1f5"`)

Also useful in unit tests (inline strings, not extra files): missing `background`, invalid hex, comments / blank lines, unquoted hex, `#rgb` short form.

## Files to change

### 1. `src/styles/theme.tsx`

Export the system id from the theme module so settings and resolve share one constant:

```ts
export const SYSTEM_THEME_ID = 'system'
```

Add an options bag. Do **not** make the 4th argument a raw `homeDir` string — tests need to inject a palette without touching disk.

```ts
export interface ResolveThemeOptions {
  homeDir?: string
  omarchyPalette?: OmarchyPalette | null
}

export function resolveTheme(
  themeId?: string,
  customThemes: Record<string, ThemeDefinition> = {},
  colorScheme: ThemeColorScheme = DEFAULT_COLOR_SCHEME,
  options: ResolveThemeOptions = {}
)
```

After `aliasThemeID`, **before** the catalog lookup:

```ts
const normalizedID = aliasThemeID(themeId)

if (normalizedID === SYSTEM_THEME_ID) {
  const palette =
    options.omarchyPalette !== undefined
      ? options.omarchyPalette
      : readOmarchyPalette(options.homeDir ?? getHomeDir())

  if (palette) {
    const mode = colorScheme === 'system' ? palette.mode : colorScheme
    return {
      id: SYSTEM_THEME_ID,
      name: 'System',
      mode,
      colors: omarchyPaletteToThemeColors(palette),
      catalog,
    }
  }
}

const id = normalizedID && catalog[normalizedID] ? normalizedID : DEFAULT_THEME_ID
```

Rules:

* `omarchyPalette !== undefined` (including explicit `null`) means "do not read the filesystem". This is the test seam.
* `omarchyPalette` omitted means read `readOmarchyPalette(options.homeDir ?? getHomeDir())`.
* Palette present → `id: 'system'`, `name: 'System'`, colors from the mapper. Do **not** put a fake `DesktopTheme` into `catalog`.
* Palette absent → fall through to today's unknown-id behavior (`rosepine`). P4 replaces that fallback.
* Named catalog ids (`rosepine`, `catppuccin`, custom, …) never call `readOmarchyPalette`.
* `color_scheme: dark|light` locks **reported** `mode` only. Colors still come from the current `colors.toml`. Do not synthesize a light palette from a dark file or the reverse.
* `color_scheme: system` (default) uses `palette.mode`.
* Keep `DEFAULT_THEME_ID = 'rosepine'`. Do not change the default theme.

Build `catalog` **before** the system branch so the returned object still has it (callers / tests may read `resolved.catalog`).

Import `getHomeDir` from `../config/paths` (or `../config`). Import palette helpers from `./omarchy`.

### 2. `src/app/controller.ts`

Pass the real home dir so tests / unusual `HOME` values resolve the same paths as config:

```ts
import { getConfigPath, getHomeDir, saveConfig } from '../config'

const resolvedTheme = resolveTheme(
  themePreviewId ?? config?.theme,
  config?.themes,
  config?.colorScheme,
  { homeDir: getHomeDir() }
)
```

Do **not** pre-read the palette in the controller. Do **not** make this async. Do **not** subscribe to files (P3).

### 3. `src/settings.ts`

Stop declaring a private `SYSTEM_THEME_ID`. Import it from `./styles/theme` next to `BUILTIN_THEMES`.

Update the System option description to match P1's intended copy (it currently says "Follow the detected terminal theme"):

```ts
if (id === SYSTEM_THEME_ID) {
  return {
    value: id,
    label: 'System',
    description: 'Follow the desktop or terminal theme',
  }
}
```

No picker list changes. Still no `omarchy` id.

### 4. `src/config/index.ts`

No behavior change required. `"system"` is already a valid theme string.

Add a regression test (see Tests) that `normalizeConfig({ theme: 'system' }, home).theme === 'system'` and that the default is still `rosepine`.

Do **not** rewrite `"system"` to `rosepine` at load time. Persistence stays `"system"`; resolution happens in `resolveTheme`.

## Call stack

```
useAppController
  resolveTheme(themePreviewId ?? config.theme, config.themes, config.colorScheme, { homeDir })
    aliasThemeID(themeId)
    if id === 'system':
      options.omarchyPalette ?? readOmarchyPalette(homeDir)
        getOmarchyColorsPath(homeDir)
        readFileSync + parseOmarchyColorsToml
      if palette: omarchyPaletteToThemeColors(palette) → ThemeColors
      else: catalog fallback → rosepine
    else:
      catalog[id] ?? rosepine → resolveVariantTheme
  theme = resolved.colors → ThemeProvider
```

Disk is read only when `themeId` (or preview id) is `'system'` and no injected palette was passed.

## Tests

### `tests/omarchy.test.ts` (new)

Parser / mapper / path helpers. No live `$HOME`.

* `getOmarchyColorsPath('/tmp/fake-home')` ends with `/.local/state/omarchy/current/theme/colors.toml`
* `getOmarchyThemeNamePath('/tmp/fake-home')` ends with `/.local/state/omarchy/current/theme.name`
* `parseOmarchyColorsToml` of `tests/fixtures/omarchy/rose-pine-dark.toml`:
  * `mode === 'dark'`
  * `background === '#191724'`
  * `foreground === '#e0def4'`
  * `accent === '#ebbcba'`
* `parseOmarchyColorsToml` of `light-sample.toml`: `mode === 'light'`, `background === '#eff1f5'`
* Comments, blank lines, and `key = "#abc"` short hex still parse
* Unquoted `#191724` still parses
* Missing `background` → `null`
* `background = "nope"` → `null`
* No `mode` key + dark background → `mode === 'dark'`
* `readOmarchyPalette('/tmp/does-not-exist-omarchy')` → `null`
* `readOmarchyPalette(tempHome)` where you wrote the rose-pine-dark fixture under the Omarchy path → parsed palette
* `omarchyPaletteToThemeColors` of the rose-pine-dark parse matches the table above (`background`, `primary`, `selection`, `selectionText`)
* `isOmarchyPresent` is false for an empty temp home, true after writing `theme/colors.toml`

Use `mkdtemp` from `fs/promises` like `tests/config.test.ts`. Do not read the developer's real `~/.local/state/omarchy`.

### `tests/theme.test.ts`

Keep existing Rose Pine / `COLORFGBG` tests.

Add:

* `resolveTheme('system', {}, 'system', { omarchyPalette: parsedRosePineDark })`:
  * `id === 'system'`
  * `name === 'System'`
  * `mode === 'dark'`
  * `colors.background === '#191724'`
  * `colors.primary === '#ebbcba'`
* `resolveTheme('system', {}, 'light', { omarchyPalette: parsedRosePineDark })`:
  * `mode === 'light'` (locked)
  * `colors.background === '#191724'` (still the Omarchy file, not catalog light Rose Pine)
* `resolveTheme('system', {}, 'system', { omarchyPalette: null })`:
  * `id === 'rosepine'` (today's fallback)
  * `colors.background === '#191724'` (catalog dark Rose Pine — same hex, different id)
* `resolveTheme('rosepine', {}, 'dark', { omarchyPalette: parsedCatppuccin })`:
  * `id === 'rosepine'`
  * `colors.primary === '#9ccfd8'` (catalog, **not** Catppuccin `#89b4fa`)
* `resolveTheme('system', {}, 'system', { homeDir: tempHomeWithFixture })` reads disk and returns `id === 'system'`
* `resolveTheme('system', {}, 'system', { homeDir: emptyTempHome })` returns `id === 'rosepine'`

When asserting the no-Omarchy fallback, pass `{ omarchyPalette: null }` or a dedicated temp home so the test does not accidentally read the machine's real Omarchy files.

### `tests/config.test.ts`

* `normalizeConfig({ theme: 'system' }, '/home/tester').theme === 'system'`
* `getDefaultConfig('/home/tester').theme === 'rosepine'`

### `tests/settings.test.ts`

If not already present from P1:

* `getSettingOptions(config, 'theme')[0].value === 'system'`
* values do **not** include `'omarchy'`
* `applyOptionSetting(config, 'theme', 'system').theme === 'system'`

## Out of scope

* Watching `theme.name` or `colors.toml` (P3)
* SIGUSR2 retint (P3)
* Terminal OSC / `COLORFGBG` as the system **palette** (P4). `COLORFGBG` may still drive `getSystemColorScheme` for named themes
* User-facing docs (P5)
* Changing the default theme away from `rosepine`
* Adding an `omarchy` picker / config id
* Shelling out to `omarchy-theme-color` or `omarchy theme get`
* Making `resolveTheme` async
* Rewriting `config.json` when Omarchy files change
* Reading `/usr/share/omarchy/themes/*` — only the **current** `~/.local/state/omarchy/current/theme/colors.toml`

## Done when

* `theme: "system"` + readable Omarchy `colors.toml` under that home dir → `resolveTheme` returns `id: 'system'` and mapped `colors.toml` hexes
* Named themes still ignore Omarchy
* Missing / unreadable / invalid Omarchy files → same Rose Pine fallback as today
* Config still stores `"system"`, never an Omarchy slug
* Tests pass without a live Omarchy install
* `bun test` and `bun run typecheck` pass
