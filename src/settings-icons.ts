import type { SettingsReset } from './settings'
import type { Config, IconConfig } from './types'

// The Icons form: an on/off row, then one glyph per icon kind in the config's `icons` object. The
// file has no on/off key, so "on" is any glyph set: turning it on writes the Nerd Font set from the
// docs, and turning it off clears every glyph.
export type IconKind = keyof IconConfig

export type IconsFormRow = 'enabled' | IconKind

export type IconsFormEntry =
  | {
      readonly row: 'enabled'
      readonly title: string
      readonly value: string
      readonly description: string
      readonly control: 'toggle'
      readonly reset: SettingsReset
    }
  | {
      readonly row: IconKind
      readonly title: string
      readonly value: string
      readonly description: string
      readonly glyph: string
      readonly control: 'open'
      readonly reset: SettingsReset
    }

export type IconsChange =
  | { readonly kind: 'toggle' }
  | { readonly kind: 'set'; readonly icon: IconKind; readonly glyph: string }
  | { readonly kind: 'clear'; readonly icon: IconKind }

// What a form key asks for; applying reads the glyph from the field being edited.
export type IconsFormAction =
  | { readonly kind: 'toggle' }
  | { readonly kind: 'apply'; readonly icon: IconKind }
  | { readonly kind: 'clear'; readonly icon: IconKind }

export const NERD_FONT_ICONS = {
  tmux: '\uebc8',
  configured: '\uf013',
  project: '\ue5ff',
} satisfies Partial<IconConfig>

const NO_ICONS: IconConfig = { tmux: '', herdr: '', configured: '', project: '', opencode: '' }

const KINDS: readonly { icon: IconKind; title: string; description: string }[] = [
  {
    icon: 'tmux',
    title: 'tmux sessions',
    description: 'icons.tmux: tmux session rows and the Live header under tmux',
  },
  {
    icon: 'herdr',
    title: 'Herdr workspaces',
    description: 'icons.herdr: Herdr workspace rows and the Live header under Herdr',
  },
  {
    icon: 'configured',
    title: 'Configured projects',
    description: "icons.configured: project rule rows and their header; a rule's own icon wins",
  },
  {
    icon: 'project',
    title: 'Projects',
    description: "icons.project: discovered project rows; a project rule's own icon wins",
  },
  {
    icon: 'opencode',
    title: 'Agents',
    description: 'icons.opencode: agent session rows and the Agents header',
  },
]

function iconsOf(config: Config): IconConfig {
  return { ...NO_ICONS, ...config.icons }
}

function isOn(config: Config): boolean {
  const icons = iconsOf(config)

  return KINDS.some(({ icon }) => icons[icon].length > 0)
}

function entries(config: Config): IconsFormEntry[] {
  const icons = iconsOf(config)
  const on = isOn(config)

  return [
    {
      row: 'enabled',
      title: 'Icons',
      value: on ? 'on' : 'off',
      description: on
        ? 'Off clears every glyph below'
        : 'On fills tmux sessions, Configured projects and Projects with Nerd Font glyphs',
      control: 'toggle',
      reset: on ? 'unavailable' : 'default',
    },
    ...KINDS.map(({ icon, title, description }): IconsFormEntry => {
      const glyph = icons[icon]

      return {
        row: icon,
        title,
        value: glyph || 'none',
        description,
        glyph,
        control: 'open',
        reset: glyph ? 'available' : 'default',
      }
    }),
  ]
}

function apply(config: Config, change: IconsChange): Config {
  const icons = iconsOf(config)

  switch (change.kind) {
    case 'toggle':
      return { ...config, icons: isOn(config) ? NO_ICONS : { ...icons, ...NERD_FONT_ICONS } }
    case 'set':
      return { ...config, icons: { ...icons, [change.icon]: change.glyph.trim() } }
    case 'clear':
      return { ...config, icons: { ...icons, [change.icon]: '' } }
  }
}

function titleOf(icon: IconKind): string {
  return KINDS.find(kind => kind.icon === icon)?.title ?? icon
}

export const IconsForm = { entries, apply, titleOf } as const
