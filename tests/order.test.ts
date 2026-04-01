import { describe, expect, test } from 'bun:test'
import { orderProjectItems, orderSessionItems } from '../src/items/order'
import { resolveTheme } from '../src/styles/theme'
import { getItemIconPresentation } from '../src/ui/item-icon'
import type { Item } from '../src/types'

describe('item ordering', () => {
  test('orders sessions by source when configured-first is requested', () => {
    const items: Item[] = [
      { title: 'work', desc: '', path: 'work', isSession: true },
      { title: 'hyprland', desc: '~/.config/hypr', path: '/tmp/hypr', isSession: false, itemKind: 'configured' },
      { title: 'dev', desc: '', path: 'dev', isSession: true },
    ]

    expect(orderSessionItems(items, 'configured-first').map(item => item.title)).toEqual([
      'hyprland',
      'dev',
      'work',
    ])
  })

  test('keeps zoxide-ranked project order unless alphabetical is requested', () => {
    const items: Item[] = [
      { title: 'z-last', desc: '', path: '/tmp/z-last', isSession: false },
      { title: 'a-first', desc: '', path: '/tmp/a-first', isSession: false },
    ]

    expect(orderProjectItems(items, 'live-first').map(item => item.title)).toEqual(['z-last', 'a-first'])
    expect(orderProjectItems(items, 'alphabetical').map(item => item.title)).toEqual(['a-first', 'z-last'])
  })

  test('groups live worktree sessions with their parent project', () => {
    const items: Item[] = [
      {
        title: 'update-session-naming',
        desc: 'mux-sesh [worktree]',
        path: '/home/tester/dev/projects/mux-sesh/.worktrees/update-session-naming',
        isSession: true,
      },
      {
        title: 'blackjack',
        desc: 'projects',
        path: '/home/tester/dev/projects/blackjack',
        isSession: true,
      },
      {
        title: 'mux-sesh',
        desc: 'projects',
        path: '/home/tester/dev/projects/mux-sesh',
        isSession: true,
      },
      {
        title: 'mux-sesh-config',
        desc: 'mux-sesh [worktree]',
        path: '/home/tester/dev/projects/mux-sesh/.worktrees/mux-sesh-config',
        isSession: true,
      },
    ]

    expect(orderSessionItems(items, 'live-first').map(item => item.title)).toEqual([
      'blackjack',
      'mux-sesh',
      'mux-sesh-config',
      'update-session-naming',
    ])
  })
})

describe('item icons', () => {
  test('uses config icons for linked project rows', () => {
    const legacyTheme = resolveTheme('catppuccin', {}, 'dark').colors
    const icon = getItemIconPresentation(
      legacyTheme,
      {
        title: 'highlight-helper',
        desc: '',
        path: '/tmp/highlight-helper',
        isSession: false,
        linkedSessionName: 'projects_highlight-helper',
        linkedSessionAttached: true,
      },
      {
        tmux: 'T',
        configured: 'C',
        project: 'P',
        opencode: 'O',
      }
    )

    expect(icon).toEqual({ glyph: 'T', color: legacyTheme.active })
  })
})
