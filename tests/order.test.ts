import { describe, expect, test } from 'bun:test'
import { orderProjectItems, orderSessionItems } from '../src/items/order'
import { resolveTheme } from '../src/styles/theme'
import { formatSectionHeader, getItemIconPresentation } from '../src/ui/item-icon'
import type { Item } from '../src/types'

describe('item ordering', () => {
  test('orders sessions by source when configured-first is requested', () => {
    const items: Item[] = [
      { title: 'work', desc: '', path: 'work', isSession: true },
      {
        title: 'hyprland',
        desc: '~/.config/hypr',
        path: '/tmp/hypr',
        isSession: false,
        itemKind: 'configured',
      },
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

    expect(orderProjectItems(items, 'live-first').map(item => item.title)).toEqual([
      'z-last',
      'a-first',
    ])
    expect(orderProjectItems(items, 'alphabetical').map(item => item.title)).toEqual([
      'a-first',
      'z-last',
    ])
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

  test('keeps pinned sessions at the top in config order', () => {
    const items: Item[] = [
      { title: 'work', desc: '', path: 'work', isSession: true },
      { title: 'main', desc: '', path: 'main', isSession: true },
      { title: 'side', desc: '', path: 'side', isSession: true },
    ]

    const ordered = orderSessionItems(items, 'live-first', ['main', 'missing'])

    expect(ordered.map(item => item.title)).toEqual(['main', 'side', 'work'])
    expect(ordered[0]?.isPinned).toBe(true)
    expect(ordered[1]?.isPinned).toBe(false)
  })

  test('keeps agent sessions at the bottom sorted by title', () => {
    const items: Item[] = [
      { title: 'pi-beta', desc: '', path: '/tmp/pi-beta', isSession: true },
      { title: 'work', desc: '', path: '/tmp/work', isSession: true },
      { title: 'opencode-alpha', desc: '', path: '/tmp/opencode', isSession: true },
      { title: 'claude-zeta', desc: '', path: '/tmp/claude', isSession: true },
      { title: 'codex-main', desc: '', path: '/tmp/codex', isSession: true },
      { title: 'tui_chat', desc: '', path: '/tmp/chat', isSession: true },
    ]

    expect(orderSessionItems(items, 'live-first').map(item => item.title)).toEqual([
      'work',
      'claude-zeta',
      'codex-main',
      'opencode-alpha',
      'pi-beta',
      'tui_chat',
    ])
  })
})

describe('item icons', () => {
  test('labels the agents section header', () => {
    const theme = resolveTheme('catppuccin', {}, 'dark').colors
    const header = formatSectionHeader(theme, 'agents', {
      tmux: 'T',
      configured: 'C',
      project: 'P',
      opencode: 'A',
    })

    expect(header.label).toBe('Agents')
    expect(header.text).toBe('A Agents')
  })

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
