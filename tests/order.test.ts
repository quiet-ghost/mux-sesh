import { describe, expect, test } from 'bun:test'
import { orderProjectItems, orderSessionItems } from '../src/items/order'
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
})

describe('item icons', () => {
  test('uses config icons for linked project rows', () => {
    const icon = getItemIconPresentation(
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

    expect(icon).toEqual({ glyph: 'T', color: '#a6e3a1' })
  })
})
