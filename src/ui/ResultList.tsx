import { useMemo } from 'react'
import type { IconConfig } from '../config/config-model'
import type { Item } from '../items/item'
import { getItemKey } from '../multiplexer/items'
import ItemRow from './ItemRow'
import { getVisibleWindow } from './list-window'
import { getTitleColumnWidth } from './session-viewport'
import { getSessionMeta } from './session-meta'

// New names what Enter does on each target row; the selected row shows the frozen plan's action.
export type RowActions = { kind: 'none' } | { kind: 'launch'; selected: string | undefined }

interface Props {
  items: Item[]
  cursor: number
  maxItems: number
  width: number
  searchQuery: string
  actions: RowActions
  icons?: IconConfig
  marked?: ReadonlyMap<string, Item>
  // The item key whose close waits for a second key, if any.
  closingKey: string | undefined
}

function getRowContext(item: Item): string {
  return item.desc
}

function getLaunchAction(item: Item): string {
  if (item.linkedSessionName) return `focus -> ${item.linkedSessionName}`

  return item.itemKind === 'file' ? 'open' : 'create'
}

function getRowMeta(item: Item, selected: boolean, actions: RowActions): string {
  if (item.isSession || actions.kind === 'none') return getSessionMeta(item)

  return (selected ? actions.selected : undefined) ?? getLaunchAction(item)
}

// One flat list in the main list's rows: Search's best-first results, New's targets, and Projects.
export default function ResultList({
  items,
  cursor,
  maxItems,
  width,
  searchQuery,
  actions,
  icons,
  marked,
  closingKey,
}: Props) {
  const searching = searchQuery.trim().length > 0
  const visibleWindow = getVisibleWindow(items, cursor, maxItems)
  const titleColumn = useMemo(() => getTitleColumnWidth(items, getRowContext), [items])

  return (
    <>
      {visibleWindow.items.map((item, i) => {
        const selected = visibleWindow.startIndex + i === cursor

        return (
          <ItemRow
            key={`${getItemKey(item)}:${item.path}`}
            item={item}
            selected={selected}
            marked={marked?.has(getItemKey(item)) ?? false}
            closing={getItemKey(item) === closingKey}
            width={width}
            titleColumn={titleColumn}
            context={getRowContext(item)}
            meta={getRowMeta(item, selected, actions)}
            searching={searching}
            icons={icons}
          />
        )
      })}
    </>
  )
}
