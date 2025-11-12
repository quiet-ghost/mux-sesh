import { spawn } from 'bun'
import { basename } from 'path'
import { stat } from 'fs/promises'
import type { Config, Item } from '../types'

export async function getProjectItems(config: Config): Promise<Item[]> {
  const items: Item[] = []
  
  // Filter out paths that don't exist
  const existingPaths: string[] = []
  for (const path of config.projectPaths) {
    try {
      await stat(path)
      existingPaths.push(path)
    } catch {
      // Path doesn't exist, skip it
    }
  }
  
  if (existingPaths.length === 0) {
    return items
  }
  
  // Use find to locate directories
  const args = [
    ...existingPaths,
    '-mindepth', '1',
    '-maxdepth', '3',
    '-type', 'd'
  ]
  
  const proc = spawn(['find', ...args])
  const output = await new Response(proc.stdout).text()
  
  const lines = output.trim().split('\n').filter(Boolean)
  
  for (const line of lines) {
    const baseName = basename(line)
    
    // Skip hidden directories and common build directories
    if (
      baseName.startsWith('.') ||
      baseName === 'node_modules' ||
      baseName === 'target' ||
      baseName === 'build' ||
      baseName === 'dist'
    ) {
      continue
    }
    
    const name = baseName
    const desc = line.replace(process.env.HOME || '', '~')
    
    items.push({
      title: name,
      desc,
      path: line,
      isSession: false,
    })
  }
  
  // Sort alphabetically
  items.sort((a, b) => a.title.localeCompare(b.title))
  
  return items
}
