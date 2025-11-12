// Core types for the application

export enum AppMode {
  Normal,
  Search,
  NewSession,
  Rename,
}

export enum ViewMode {
  Sessions,
  Projects,
}

export interface Item {
  title: string
  desc: string
  path: string
  isSession: boolean
  isAttached?: boolean
  windowCount?: string
}

export interface Config {
  projectPaths: string[]
  reposPath: string
  editor: string
  editorCmd: string
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
