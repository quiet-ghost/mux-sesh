export enum AppMode {
  Normal,
  Search,
  NewSession,
  Rename,
  OpencodeManage,
}

export enum ViewMode {
  Sessions,
  Projects,
}

export type KeybindMode = 'vim' | 'standard'

export interface OpencodeSessionStats {
  sessionID?: string
  title?: string
  projectID?: string
  directory?: string
  messageCount?: number
  filesModified?: number
  additions?: number
  deletions?: number
  createdAt?: number
  updatedAt?: number
  // Aggregated stats (for home directory sessions)
  sessionCount?: number
  mostRecentTitle?: string
  // Current session live stats (last message)
  lastMessageTokens?: number
  contextLimit?: number
  sessionTotalCost?: number
}

export interface Item {
  title: string
  desc: string
  path: string
  isSession: boolean
  isAttached?: boolean
  windowCount?: string
  createdAt?: number
  lastActivity?: number
  opencodeStats?: OpencodeSessionStats
}

export interface Config {
  projectPaths: string[]
  reposPath: string
  editor: string
  editorCmd: string
  keybindMode?: KeybindMode
  autoUpdate?: boolean
}

export interface WindowInfo {
  index: string
  name: string
  currentPath: string
  currentCommand: string
}

export interface SessionDetails {
  name: string
  isAttached: boolean
  windowCount: string
  windows: WindowInfo[]
}

export interface SearchResult {
  item: Item
  score: number
}

export interface FuzzyMatch {
  score: number
  indices: number[]
}

export type InstallMethod = 'npm' | 'bun' | 'brew' | 'unknown'

export interface UpdateCompletedEvent {
  version: string
}

export type UpdateEventListener = (event: UpdateCompletedEvent) => void
