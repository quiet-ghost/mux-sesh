# mux-sesh: Go/Bubble Tea → TypeScript/OpenTUI Conversion Guide

## Overview

This document serves as a complete reference for converting the mux-sesh tmux session manager from Go (using Bubble Tea) to TypeScript (using OpenTUI with React).

**Original:** Go + Bubble Tea + Lipgloss (1,280 lines)  
**Target:** TypeScript + OpenTUI React + Bun

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Technology Mappings](#technology-mappings)
3. [Component Architecture](#component-architecture)
4. [Code Migration Guide](#code-migration-guide)
5. [Configuration](#configuration)
6. [Styling System](#styling-system)
7. [Keyboard Handling](#keyboard-handling)
8. [Tmux Integration](#tmux-integration)
9. [Build & Deployment](#build--deployment)
10. [Testing Strategy](#testing-strategy)

---

## Project Structure

### Current Go Structure
```
mux-sesh/
├── main.go                 # 1,280 lines - UI, state, logic, rendering
├── config.go               # 81 lines - config management
├── go.mod                  # Go dependencies
├── go.sum
├── config.example.json     # Example configuration
├── .goreleaser.yaml        # Release configuration
└── README.md
```

### New TypeScript Structure
```
mux-sesh/
├── src/
│   ├── index.tsx              # Main entry point (~20 lines)
│   ├── app.tsx                # Main App component (~200 lines)
│   │
│   ├── components/
│   │   ├── SessionList.tsx    # Left panel - session/project list (~150 lines)
│   │   ├── DetailPanel.tsx    # Right panel - session details (~100 lines)
│   │   ├── SearchInput.tsx    # Search/input component (~50 lines)
│   │   └── KeybindHelp.tsx    # Keybind hints at bottom (~30 lines)
│   │
│   ├── lib/
│   │   ├── config.ts          # Config management (~100 lines)
│   │   ├── tmux.ts            # Tmux command utilities (~200 lines)
│   │   ├── projects.ts        # Project scanning (~100 lines)
│   │   ├── search.ts          # Fuzzy search logic (~150 lines)
│   │   └── github.ts          # GitHub cloning (~80 lines)
│   │
│   ├── types/
│   │   └── index.ts           # TypeScript types & interfaces (~80 lines)
│   │
│   └── styles/
│       └── theme.ts           # Color scheme & style constants (~100 lines)
│
├── package.json
├── tsconfig.json
├── bunfig.toml               # Bun configuration
└── README.md
```

**Estimated Total:** ~1,360 lines (slightly more due to type definitions and separation of concerns)

---

## Technology Mappings

### Core Technologies

| Go Stack | TypeScript Stack |
|----------|------------------|
| Go 1.24.4 | TypeScript 5.x |
| Bubble Tea | OpenTUI React |
| Lipgloss | OpenTUI Styling |
| Go Modules | Bun Package Manager |
| `os/exec` | `Bun.spawn()` |
| goreleaser | `bun build --compile` |

### Framework Concepts

| Go/Bubble Tea Concept | OpenTUI React Equivalent |
|-----------------------|--------------------------|
| `model` struct | React state (`useState`) |
| `Init() tea.Cmd` | `useEffect()` initialization |
| `Update(msg tea.Msg)` | `useKeyboard()` + event handlers |
| `View() string` | JSX component return |
| `tea.Program` | `createCliRenderer()` + `createRoot()` |
| `lipgloss.Style` | `style` prop on components |
| `textinput.Model` | `<input>` component |
| `tea.KeyMsg` | `useKeyboard()` callback |

### Component Mappings

| Your Go Code Feature | OpenTUI Component/Pattern |
|----------------------|---------------------------|
| Session list rendering | `<select>` or custom `<box>` with map |
| Detail panel | `<box>` with nested `<text>` components |
| Search input | `<input>` with `onInput` handler |
| Styled/colored text | `<text>` with `<span fg="color">` |
| Borders (rounded) | `<box border borderStyle="rounded">` |
| Left/right panel layout | `<box flexDirection="row">` |
| Vertical stacking | `<box flexDirection="column">` |
| Active indicators (●/○) | `<text fg={isActive ? activeColor : inactiveColor}>` |
| Window details | `<text>` with dynamic content |

---

## Component Architecture

### 1. Main App Component (`src/app.tsx`)

**Go Equivalent:** `model` struct + `Update()` + `View()` functions

```tsx
import { useKeyboard, useRenderer } from "@opentui/react"
import { useState, useEffect } from "react"
import SessionList from "./components/SessionList"
import DetailPanel from "./components/DetailPanel"
import { loadConfig } from "./lib/config"
import { listTmuxSessions } from "./lib/tmux"
import { getProjectItems } from "./lib/projects"
import type { Item, Config } from "./types"

enum AppMode {
  Normal,
  Search,
  NewSession,
  Rename
}

enum ViewMode {
  Sessions,
  Projects
}

export function App() {
  const renderer = useRenderer()
  const [appMode, setAppMode] = useState(AppMode.Normal)
  const [viewMode, setViewMode] = useState(ViewMode.Sessions)
  const [items, setItems] = useState<Item[]>([])
  const [allItems, setAllItems] = useState<Item[]>([])
  const [cursor, setCursor] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [config, setConfig] = useState<Config | null>(null)
  const [message, setMessage] = useState("")
  
  // Initialize
  useEffect(() => {
    async function init() {
      const cfg = await loadConfig()
      setConfig(cfg)
      await refreshItems()
    }
    init()
  }, [])
  
  // Keyboard handling
  useKeyboard((key) => {
    if (appMode === AppMode.Normal) {
      handleNormalMode(key)
    } else if (appMode === AppMode.Search) {
      handleSearchMode(key)
    }
    // ... etc
  })
  
  async function refreshItems() {
    if (viewMode === ViewMode.Sessions) {
      const sessions = await listTmuxSessions()
      setItems(sessions)
      setAllItems(sessions)
    } else {
      const projects = await getProjectItems(config!)
      setItems(projects)
      setAllItems(projects)
    }
  }
  
  return (
    <box style={{ flexDirection: "row" }}>
      <SessionList 
        items={items}
        cursor={cursor}
        appMode={appMode}
        viewMode={viewMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      {appMode !== AppMode.NewSession && (
        <DetailPanel 
          selectedItem={items[cursor]}
          appMode={appMode}
        />
      )}
    </box>
  )
}
```

### 2. Session List Component (`src/components/SessionList.tsx`)

**Go Equivalent:** Lines 551-765 in main.go (View function - left panel)

```tsx
import { colors, sessionListStyle } from "../styles/theme"
import type { Item, AppMode, ViewMode } from "../types"

interface Props {
  items: Item[]
  cursor: number
  appMode: AppMode
  viewMode: ViewMode
  searchQuery: string
  onSearchChange: (query: string) => void
}

export default function SessionList({ 
  items, 
  cursor, 
  appMode, 
  viewMode,
  searchQuery,
  onSearchChange 
}: Props) {
  const title = appMode === AppMode.Search 
    ? "Search Sessions" 
    : appMode === AppMode.NewSession
    ? "New Session"
    : "Tmux Session Manager"
  
  return (
    <box style={sessionListStyle}>
      <text fg={colors.primary} style={{ bold: true }}>
        {title}
      </text>
      
      {(appMode === AppMode.Search || appMode === AppMode.NewSession) && (
        <input 
          placeholder="Type to search..."
          value={searchQuery}
          onInput={onSearchChange}
          focused
        />
      )}
      
      <box style={{ flexDirection: "column" }}>
        {items.map((item, i) => (
          <box key={i} style={{
            backgroundColor: i === cursor ? "#313244" : "transparent"
          }}>
            {item.isSession ? (
              <text>
                <span fg={item.isAttached ? colors.active : colors.inactive}>
                  {item.isAttached ? "●" : "○"}
                </span>
                {" " + item.title + " "}
                <span fg={colors.inactive}>({item.windowCount})</span>
              </text>
            ) : (
              <text>{item.title}</text>
            )}
          </box>
        ))}
      </box>
      
      {/* Keybind hints */}
      <KeybindHelp appMode={appMode} />
    </box>
  )
}
```

### 3. Detail Panel Component (`src/components/DetailPanel.tsx`)

**Go Equivalent:** Lines 750-761 (right panel), buildSessionDetails function (lines 820-896)

```tsx
import { useEffect, useState } from "react"
import { getSessionDetails } from "../lib/tmux"
import { colors, detailPanelStyle } from "../styles/theme"
import type { Item, SessionDetails } from "../types"

interface Props {
  selectedItem?: Item
  appMode: AppMode
}

export default function DetailPanel({ selectedItem, appMode }: Props) {
  const [details, setDetails] = useState<SessionDetails | null>(null)
  
  useEffect(() => {
    if (selectedItem?.isSession) {
      getSessionDetails(selectedItem.title).then(setDetails)
    }
  }, [selectedItem])
  
  if (!selectedItem?.isSession) {
    return (
      <box style={detailPanelStyle}>
        <text fg={colors.inactive}>No session selected</text>
      </box>
    )
  }
  
  return (
    <box style={detailPanelStyle}>
      <text fg={colors.primary} style={{ bold: true }}>
        {selectedItem.title}
      </text>
      
      <text>
        Status: <span fg={details?.isAttached ? colors.active : colors.inactive}>
          {details?.isAttached ? "Active" : "Inactive"}
        </span>
      </text>
      
      <text>Windows: {details?.windowCount}</text>
      
      <box style={{ flexDirection: "column", marginTop: 1 }}>
        <text fg={colors.primary} style={{ bold: true }}>Windows</text>
        {details?.windows.map((win, i) => (
          <box key={i} style={{ flexDirection: "column" }}>
            <text>{win.index}: {win.name}</text>
            {win.currentCommand && (
              <text fg={colors.action}>  {win.currentCommand}</text>
            )}
            {win.currentPath && (
              <text fg={colors.inactive}>  {win.currentPath}</text>
            )}
          </box>
        ))}
      </box>
    </box>
  )
}
```

---

## Code Migration Guide

### State Management

**Go (main.go:141-157):**
```go
type model struct {
    appMode      AppMode
    viewMode     ViewMode
    items        []item
    allItems     []item
    projectItems []item
    cursor       int
    searchInput  textinput.Model
    choice       string
    action       string
    quitting     bool
    width        int
    height       int
    message      string
    renameTarget string
    config       Config
}
```

**TypeScript (src/app.tsx):**
```typescript
// Split into multiple useState calls
const [appMode, setAppMode] = useState(AppMode.Normal)
const [viewMode, setViewMode] = useState(ViewMode.Sessions)
const [items, setItems] = useState<Item[]>([])
const [allItems, setAllItems] = useState<Item[]>([])
const [projectItems, setProjectItems] = useState<Item[]>([])
const [cursor, setCursor] = useState(0)
const [searchQuery, setSearchQuery] = useState("")
const [choice, setChoice] = useState("")
const [action, setAction] = useState("")
const [message, setMessage] = useState("")
const [renameTarget, setRenameTarget] = useState("")
const [config, setConfig] = useState<Config | null>(null)

// Terminal dimensions from hook
const { width, height } = useTerminalDimensions()
```

### Keyboard Handling

**Go (main.go:188-296):**
```go
func (m model) handleNormalMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
    switch keypress := msg.String(); keypress {
    case "ctrl+c", "q", "esc":
        m.quitting = true
        return m, tea.Quit
    case "i":
        m.appMode = ModeSearch
        // ...
    case "down", "j":
        if m.cursor < len(m.items)-1 {
            m.cursor++
        }
    }
    return m, nil
}
```

**TypeScript (src/app.tsx):**
```typescript
useKeyboard((key) => {
  if (appMode === AppMode.Normal) {
    switch (key.name) {
      case 'q':
      case 'escape':
        process.exit(0)
        break
      case 'i':
        setAppMode(AppMode.Search)
        break
      case 'j':
      case 'down':
        setCursor(c => Math.min(c + 1, items.length - 1))
        break
      case 'k':
      case 'up':
        setCursor(c => Math.max(c - 1, 0))
        break
      case 'enter':
        if (items[cursor]) {
          handleSelect(items[cursor])
        }
        break
      case 'd':
        if (items[cursor]?.isSession) {
          handleKillSession(items[cursor].title)
        }
        break
      case 'r':
        if (items[cursor]?.isSession) {
          setAppMode(AppMode.Rename)
          setRenameTarget(items[cursor].title)
        }
        break
      case 'n':
        setAppMode(AppMode.NewSession)
        setViewMode(ViewMode.Projects)
        break
      case 'R':
        refreshItems()
        setMessage("Refreshed")
        break
    }
  } else if (appMode === AppMode.Search) {
    // Handle search mode
  }
})
```

### Fuzzy Search

**Go (main.go:464-538):**
```go
func calculateSearchScore(item item, query string) int {
    title := strings.ToLower(item.title)
    desc := strings.ToLower(item.desc)
    query = strings.ToLower(strings.TrimSpace(query))
    
    // ... scoring logic
    
    return score
}
```

**TypeScript (src/lib/search.ts):**
```typescript
export function calculateSearchScore(item: Item, query: string): number {
  const title = item.title.toLowerCase()
  const desc = item.desc?.toLowerCase() || ''
  const queryLower = query.toLowerCase().trim()
  
  if (queryLower === '') return 1
  
  const queryWords = queryLower.split(/\s+/)
  if (queryWords.length === 0) return 0
  
  let score = 0
  let matchedWords = 0
  
  for (const word of queryWords) {
    let wordScore = 0
    
    // Exact match
    if (title === word) wordScore += 1000
    
    // Prefix match
    if (title.startsWith(word)) wordScore += 500
    
    // Contains match
    if (title.includes(word)) {
      wordScore += 200
      matchedWords++
    }
    
    if (desc.includes(word)) {
      wordScore += 100
      matchedWords++
    }
    
    // Word boundary match
    if (wordScore === 0) {
      const titleWords = title.split(/[-_.\s]/)
      for (const titleWord of titleWords) {
        if (titleWord.includes(word)) {
          wordScore += 150
          matchedWords++
          break
        }
      }
    }
    
    score += wordScore
  }
  
  // Bonus for matching multiple words
  if (matchedWords > 1) {
    score += matchedWords * 100
  }
  
  // Bonus for matching all words
  if (matchedWords === queryWords.length) {
    score += 300
  }
  
  // Path depth bonus
  const pathDepth = (item.desc?.match(/\//g) || []).length
  score += (10 - pathDepth) * 10
  
  // Bonus for top-level projects
  if (pathDepth === 2) {
    score += 200
  }
  
  return matchedWords === 0 ? 0 : score
}

export function filterAndSortItems(items: Item[], query: string): Item[] {
  if (!query.trim()) return items
  
  const scored = items
    .map(item => ({
      item,
      score: calculateSearchScore(item, query)
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
  
  return scored.map(({ item }) => item)
}
```

---

## Configuration

### Go (config.go:16-63)

```go
type Config struct {
    ProjectPaths []string `json:"project_paths"`
    ReposPath    string   `json:"repos_path"`
    Editor       string   `json:"editor"`
    EditorCmd    string   `json:"editor_cmd"`
}

func LoadConfig() Config {
    configDir := filepath.Join(os.Getenv("HOME"), ".config", "mux-sesh")
    configFile := filepath.Join(configDir, "config.json")
    
    if _, err := os.Stat(configFile); os.IsNotExist(err) {
        config := DefaultConfig()
        SaveConfig(config)
        return config
    }
    
    data, err := os.ReadFile(configFile)
    // ... error handling
    
    var config Config
    json.Unmarshal(data, &config)
    return config
}
```

### TypeScript (src/lib/config.ts)

```typescript
import { join } from 'path'
import { mkdir } from 'fs/promises'

export interface Config {
  projectPaths: string[]
  reposPath: string
  editor: string
  editorCmd: string
}

export function getDefaultConfig(): Config {
  const homeDir = process.env.HOME || '~'
  return {
    projectPaths: [
      join(homeDir, 'dev'),
      join(homeDir, 'personal'),
    ],
    reposPath: join(homeDir, 'dev', 'repos'),
    editor: 'nvim',
    editorCmd: 'nvim -c "lua vim.defer_fn(function() if pcall(require, \'telescope\') then vim.cmd(\'Telescope find_files\') end end, 100)"',
  }
}

export async function loadConfig(): Promise<Config> {
  const configDir = join(process.env.HOME!, '.config', 'mux-sesh')
  const configPath = join(configDir, 'config.json')
  
  try {
    const file = Bun.file(configPath)
    const config = await file.json()
    return {
      ...getDefaultConfig(),
      ...config,
    }
  } catch (error) {
    // Config doesn't exist, create default
    const defaultConfig = getDefaultConfig()
    await saveConfig(defaultConfig)
    return defaultConfig
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const configDir = join(process.env.HOME!, '.config', 'mux-sesh')
  const configPath = join(configDir, 'config.json')
  
  await mkdir(configDir, { recursive: true })
  await Bun.write(configPath, JSON.stringify(config, null, 2))
}

export function getConfigPath(): string {
  return join(process.env.HOME!, '.config', 'mux-sesh', 'config.json')
}
```

---

## Styling System

### Catppuccin Color Scheme

**Go (main.go:19-113):**
```go
var (
    primaryColor    = lipgloss.Color("#f38ba8")
    activeColor     = lipgloss.Color("#a6e3a1")
    inactiveColor   = lipgloss.Color("#6c7086")
    textColor       = lipgloss.Color("#cdd6f4")
    borderColor     = lipgloss.Color("#89b4fa")
    backgroundColor = lipgloss.Color("#1e1e2e")
    
    titleStyle = lipgloss.NewStyle().
        Foreground(primaryColor).
        Bold(true).
        Align(lipgloss.Center).
        Width(50)
)
```

**TypeScript (src/styles/theme.ts):**
```typescript
export const colors = {
  primary: '#f38ba8',
  active: '#a6e3a1',
  inactive: '#6c7086',
  text: '#cdd6f4',
  border: '#89b4fa',
  background: '#1e1e2e',
  backgroundAlt: '#313244',
  key: '#f9e2af',
  action: '#cba6f7',
  separator: '#585b70',
  program: '#fab387',
  fileTree: '#94e2d5',
}

export const sessionListStyle = {
  border: true,
  borderStyle: 'rounded' as const,
  borderColor: colors.border,
  padding: 1,
  width: 50,
  height: 28,
}

export const sessionListStyleFull = {
  ...sessionListStyle,
  width: 110,
}

export const detailPanelStyle = {
  border: true,
  borderStyle: 'rounded' as const,
  borderColor: colors.border,
  padding: 1,
  width: 60,
  height: 28,
}

export const selectedStyle = {
  fg: colors.text,
  backgroundColor: colors.backgroundAlt,
  bold: true,
}

export const normalStyle = {
  fg: colors.text,
}
```

---

## Keyboard Handling

### Complete Keyboard Map

| Mode | Key | Action |
|------|-----|--------|
| **Normal** | `q`, `Esc`, `Ctrl+C` | Quit |
| Normal | `i` | Enter search mode |
| Normal | `n` | Create new session |
| Normal | `d` | Kill selected session |
| Normal | `r` | Rename selected session |
| Normal | `R` | Refresh list |
| Normal | `s` | Switch to sessions view |
| Normal | `p` | Switch to projects view |
| Normal | `j`, `↓` | Move cursor down |
| Normal | `k`, `↑` | Move cursor up |
| Normal | `Enter`, `1-9` | Select item |
| **Search** | `Esc`, `Ctrl+C` | Exit search mode |
| Search | `Enter` | Select first result |
| Search | `↓`, `Ctrl+J` | Move cursor down |
| Search | `↑`, `Ctrl+K` | Move cursor up |
| **NewSession** | `Esc`, `Ctrl+C` | Cancel |
| NewSession | `Enter` | Create session |
| NewSession | `↓`, `Ctrl+J` | Move cursor down |
| NewSession | `↑`, `Ctrl+K` | Move cursor up |
| **Rename** | `Esc`, `Ctrl+C` | Cancel rename |
| Rename | `Enter` | Confirm rename |

---

## Tmux Integration

### Core tmux Commands

**TypeScript (src/lib/tmux.ts):**

```typescript
import { spawn } from 'bun'
import type { Item, SessionDetails, WindowInfo } from '../types'

export async function listTmuxSessions(): Promise<Item[]> {
  const proc = spawn([
    'tmux',
    'list-sessions',
    '-F',
    '#{session_name}:#{session_attached}:#{session_windows}'
  ])
  
  const output = await new Response(proc.stdout).text()
  const lines = output.trim().split('\n').filter(Boolean)
  
  return lines.map(line => {
    const [name, attached, windows] = line.split(':')
    return {
      title: name,
      path: name,
      desc: '',
      isSession: true,
      isAttached: attached === '1',
      windowCount: windows,
    }
  }).sort((a, b) => a.title.localeCompare(b.title))
}

export async function createTmuxSession(name: string, path: string): Promise<void> {
  const sessionName = name.replace(/\./g, '_')
  const insideTmux = !!process.env.TMUX
  
  // Check if tmux is running
  const tmuxRunning = spawn(['pgrep', 'tmux'])
  await tmuxRunning.exited
  const isTmuxRunning = tmuxRunning.exitCode === 0
  
  if (!insideTmux && !isTmuxRunning) {
    // Not inside tmux and tmux not running - create new session and attach
    const proc = spawn(['tmux', 'new-session', '-s', sessionName, '-c', path], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await proc.exited
    return
  }
  
  // Check if session exists
  const hasSession = spawn(['tmux', 'has-session', `-t=${sessionName}`])
  await hasSession.exited
  
  if (hasSession.exitCode !== 0) {
    // Session doesn't exist, create it
    const createProc = spawn(['tmux', 'new-session', '-d', '-s', sessionName, '-c', path])
    await createProc.exited
    
    // Send nvim command
    const nvimProc = spawn([
      'tmux', 'send-keys', '-t', sessionName,
      'nvim -c "lua vim.defer_fn(function() if pcall(require, \'telescope\') then vim.cmd(\'Telescope find_files\') end end, 100)"',
      'Enter'
    ])
    await nvimProc.exited
  }
  
  // Switch to session
  const switchProc = spawn(['tmux', 'switch-client', '-t', sessionName])
  await switchProc.exited
}

export async function switchTmuxSession(name: string): Promise<void> {
  const proc = spawn(['tmux', 'switch-client', '-t', name])
  await proc.exited
}

export async function killTmuxSession(name: string): Promise<void> {
  const proc = spawn(['tmux', 'kill-session', '-t', name])
  await proc.exited
}

export async function renameTmuxSession(oldName: string, newName: string): Promise<void> {
  const sanitizedName = newName.replace(/\./g, '_').replace(/ /g, '_')
  const proc = spawn(['tmux', 'rename-session', '-t', oldName, sanitizedName])
  await proc.exited
}

export async function getSessionDetails(sessionName: string): Promise<SessionDetails> {
  // Get session status
  const statusProc = spawn([
    'tmux', 'list-sessions',
    '-F', '#{session_name}:#{session_attached}:#{session_windows}',
    '-f', `#{==:#{session_name},${sessionName}}`
  ])
  const statusOutput = await new Response(statusProc.stdout).text()
  const [, attached, windowCount] = statusOutput.trim().split(':')
  
  // Get windows
  const windowsProc = spawn([
    'tmux', 'list-windows',
    '-t', sessionName,
    '-F', '#{window_index}:#{window_name}'
  ])
  const windowsOutput = await new Response(windowsProc.stdout).text()
  const windowLines = windowsOutput.trim().split('\n').filter(Boolean)
  
  const windows: WindowInfo[] = []
  
  for (const line of windowLines) {
    const [index, name] = line.split(': ')
    
    // Get current directory
    const dirProc = spawn([
      'tmux', 'display-message',
      '-t', `${sessionName}:${index}`,
      '-p', '#{pane_current_path}'
    ])
    const currentPath = (await new Response(dirProc.stdout).text()).trim()
    
    // Get current command
    const cmdProc = spawn([
      'tmux', 'display-message',
      '-t', `${sessionName}:${index}`,
      '-p', '#{pane_current_command}'
    ])
    const currentCommand = (await new Response(cmdProc.stdout).text()).trim()
    
    // Replace home directory with ~
    const displayPath = currentPath.replace(process.env.HOME || '', '~')
    
    windows.push({
      index,
      name,
      currentPath: displayPath,
      currentCommand: ['bash', 'zsh', 'fish'].includes(currentCommand) ? '' : currentCommand,
    })
  }
  
  return {
    name: sessionName,
    isAttached: attached === '1',
    windowCount,
    windows,
  }
}
```

---

## Build & Deployment

### package.json

```json
{
  "name": "mux-sesh",
  "version": "1.0.0",
  "description": "A beautiful tmux session manager built with OpenTUI",
  "type": "module",
  "bin": {
    "mux-sesh": "./dist/mux-sesh"
  },
  "scripts": {
    "dev": "bun run src/index.tsx",
    "build": "bun build src/index.tsx --compile --outfile dist/mux-sesh",
    "start": "bun run src/index.tsx",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [
    "tmux",
    "tui",
    "terminal",
    "session-manager",
    "opentui"
  ],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "@opentui/core": "latest",
    "@opentui/react": "latest",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^18.3.1",
    "typescript": "^5.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Building & Installing

```bash
# Development
bun install
bun run dev

# Build standalone executable
bun run build

# Install globally
sudo cp dist/mux-sesh /usr/local/bin/
# or
cp dist/mux-sesh ~/.local/bin/

# Make executable
chmod +x /usr/local/bin/mux-sesh
```

---

## Testing Strategy

### Testing Phases

1. **Unit Testing (lib functions)**
   - `config.ts` - load, save, defaults
   - `search.ts` - scoring algorithm
   - `projects.ts` - directory scanning

2. **Integration Testing**
   - `tmux.ts` - all tmux operations (requires tmux running)
   - `github.ts` - clone operations

3. **Component Testing**
   - Render SessionList with mock data
   - Render DetailPanel with mock session
   - Test keyboard navigation

4. **End-to-End Testing**
   - Full workflow: open → search → select → switch
   - Create new session
   - Kill session
   - Rename session

### Manual Testing Checklist

- [ ] App starts without errors
- [ ] Lists existing tmux sessions
- [ ] Lists project directories
- [ ] Search filters sessions correctly
- [ ] Navigate with j/k and arrow keys
- [ ] Switch to session with Enter
- [ ] Kill session with 'd'
- [ ] Rename session with 'r'
- [ ] Create new session from project
- [ ] Create new session from GitHub URL
- [ ] Create custom named session
- [ ] Detail panel shows correct session info
- [ ] All keybinds work as expected
- [ ] Colors/styling match original
- [ ] Refresh works correctly

---

## Migration Checklist

### Setup Phase
- [ ] Create project structure
- [ ] Initialize Bun project
- [ ] Install dependencies
- [ ] Configure TypeScript
- [ ] Create CONVERSION_GUIDE.md

### Core Libraries
- [ ] Port config.ts (from config.go)
- [ ] Port types/index.ts (from Go structs)
- [ ] Port tmux.ts (from main.go tmux functions)
- [ ] Port projects.ts (from getProjectItems)
- [ ] Port search.ts (from calculateSearchScore)
- [ ] Port github.ts (from cloneGitHubRepo)

### Styling
- [ ] Port theme.ts (from lipgloss styles)
- [ ] Define all color constants
- [ ] Define component styles

### Components
- [ ] Create index.tsx (entry point)
- [ ] Create app.tsx (main app logic)
- [ ] Create SessionList.tsx
- [ ] Create DetailPanel.tsx
- [ ] Create SearchInput.tsx (if needed separately)
- [ ] Create KeybindHelp.tsx

### Features
- [ ] Implement Normal mode
- [ ] Implement Search mode
- [ ] Implement NewSession mode
- [ ] Implement Rename mode
- [ ] Implement keyboard navigation
- [ ] Implement session switching
- [ ] Implement session creation
- [ ] Implement session killing
- [ ] Implement session renaming
- [ ] Implement project scanning
- [ ] Implement GitHub cloning
- [ ] Implement fuzzy search

### Testing & Polish
- [ ] Test all features
- [ ] Fix bugs
- [ ] Match styling to original
- [ ] Build standalone binary
- [ ] Create installation script
- [ ] Update README.md

---

## Key Differences & Improvements

### What's Better in TypeScript/OpenTUI

1. **Type Safety**: Catch errors at compile time
2. **Component Separation**: Cleaner architecture with separate files
3. **Hot Reload**: Faster development with `bun --watch`
4. **Async/Await**: Cleaner async code than Go
5. **npm Ecosystem**: Easy to add libraries (e.g., better fuzzy search)
6. **React Hooks**: Familiar patterns for state management
7. **JSX**: More intuitive UI declaration

### What Was Better in Go

1. **Single Binary**: No runtime needed (though Bun can compile to binary)
2. **Goroutines**: Built-in concurrency (though we don't use it much)
3. **Static Typing**: Go's compile-time guarantees
4. **Standard Library**: Robust standard library

### Migration Effort Estimate

- **Setup**: 30 minutes
- **Core libraries**: 2-3 hours
- **Components**: 3-4 hours
- **Testing & Polish**: 2-3 hours
- **Total**: 8-10 hours for full feature parity

---

## Resources

### Documentation
- [OpenTUI Core Docs](https://github.com/sst/opentui/tree/main/packages/core)
- [OpenTUI React Docs](https://github.com/sst/opentui/tree/main/packages/react)
- [Bun Documentation](https://bun.sh/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Examples
- [OpenTUI React Examples](https://github.com/sst/opentui/tree/main/packages/react)
- [Awesome OpenTUI](https://github.com/msmps/awesome-opentui)

### Original Project
- [mux-sesh (Go version)](https://github.com/quiet-ghost/mux-sesh)
- [ThePrimeagen's tmux-sessionizer](https://github.com/ThePrimeagen/.dotfiles/blob/master/bin/.local/scripts/tmux-sessionizer)

---

## Notes

- This guide is meant to be a living document - update as you discover better patterns
- Keep the Go version around for reference during migration
- Test frequently to catch issues early
- Don't hesitate to deviate from the original if TypeScript/OpenTUI offers better patterns
- The component separation will make the code more maintainable long-term

---

**Last Updated:** 2025-01-11
