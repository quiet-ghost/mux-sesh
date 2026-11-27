import type { TextareaRenderable } from '@opentui/core'
import { useMemo, useRef, useState } from 'react'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import type { MultiplexerBackend } from '../multiplexer'
import type { StatusLine } from '../ui/status-line'
import { useToasts } from './notifications'

const NO_MARKS: ReadonlyMap<string, Item> = new Map()

export function useAppCoreState() {
  const [appMode, setAppMode] = useState(AppMode.Normal)
  const [viewMode, setViewMode] = useState(ViewMode.Sessions)
  const [items, setItems] = useState<Item[]>([])
  const [allItems, setAllItems] = useState<Item[]>([])
  const [projectSourceItems, setProjectSourceItems] = useState<Item[]>([])
  const [sessionCandidateItems, setSessionCandidateItems] = useState<Item[]>([])
  const [sessionItems, setSessionItems] = useState<Item[]>([])
  const [cursor, setCursor] = useState(0)
  const [agentCursor, setAgentCursor] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  // Persistent status lines above the footer: stale inventory, and degraded file search.
  const [inventoryStatus, setInventoryStatus] = useState('')
  const [fileSearchStatus, setFileSearchStatus] = useState('')

  const statusLines = useMemo(
    (): readonly StatusLine[] => [
      ...(inventoryStatus ? [{ kind: 'stale' as const, text: inventoryStatus }] : []),
      ...(fileSearchStatus ? [{ kind: 'warn' as const, text: fileSearchStatus }] : []),
    ],
    [inventoryStatus, fileSearchStatus]
  )

  const [renameTarget, setRenameTarget] = useState<Item | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [backend, setBackend] = useState<MultiplexerBackend | null>(null)
  // Rows the user marked for a batch close, keyed by item key, in the order they were marked.
  const [markedItems, setMarkedItems] = useState<ReadonlyMap<string, Item>>(NO_MARKS)
  const [prefixActive, setPrefixActive] = useState(false)
  const prefixTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const lastSessionSelectionRef = useRef<string | null>(null)
  const lastProjectSelectionRef = useRef<string | null>(null)
  const toasts = useToasts()
  const [updatedVersion, setUpdatedVersion] = useState<string | null>(null)

  return {
    appMode,
    setAppMode,
    viewMode,
    setViewMode,
    items,
    setItems,
    allItems,
    setAllItems,
    projectSourceItems,
    setProjectSourceItems,
    sessionCandidateItems,
    setSessionCandidateItems,
    sessionItems,
    setSessionItems,
    cursor,
    setCursor,
    agentCursor,
    setAgentCursor,
    searchQuery,
    setSearchQuery,
    statusLines,
    setInventoryStatus,
    setFileSearchStatus,
    renameTarget,
    setRenameTarget,
    config,
    setConfig,
    backend,
    setBackend,
    markedItems,
    setMarkedItems,
    prefixActive,
    setPrefixActive,
    prefixTimeoutRef,
    textareaRef,
    lastSessionSelectionRef,
    lastProjectSelectionRef,
    toast: toasts.current,
    moreToasts: toasts.more,
    showToast: toasts.showToast,
    acknowledgeToast: toasts.acknowledgeToast,
    updatedVersion,
    setUpdatedVersion,
  }
}
