import { spawn } from 'bun'
import { basename } from 'path'
import { access, stat } from 'fs/promises'
import type { Config, Item } from '../types'
import { normalizePathForMatching } from '../util/glob'

interface ZoxideEntry {
  score: number
  path: string
}

const PROJECT_MARKERS = ['.git', '.jj', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'flake.nix']
function isIgnoredProjectDirectory(baseName: string): boolean {
  return (
    baseName.startsWith('.') ||
    baseName === 'node_modules' ||
    baseName === 'target' ||
    baseName === 'build' ||
    baseName === 'dist'
  )
}

function toProjectItem(projectPath: string): Item {
  return {
    title: basename(projectPath),
    desc: projectPath.replace(process.env.HOME || '', '~'),
    path: projectPath,
    isSession: false,
    itemKind: 'project',
  }
}

async function hasProjectMarker(projectPath: string): Promise<boolean> {
  for (const marker of PROJECT_MARKERS) {
    try {
      await access(`${projectPath}/${marker}`)
      return true
    } catch {}
  }

  return false
}

export async function filterProjectCandidatePaths(projectPaths: string[]): Promise<string[]> {
  const uniquePaths = [...new Set(projectPaths.map(path => normalizePathForMatching(path)))]
  const matches = await Promise.all(
    uniquePaths.map(async projectPath => ({
      projectPath,
      include: await hasProjectMarker(projectPath),
    }))
  )

  return matches.filter(match => match.include).map(match => match.projectPath)
}

export function parseZoxideOutput(output: string): ZoxideEntry[] {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      const trimmed = line.trim()
      const firstSpaceIndex = trimmed.indexOf(' ')
      if (firstSpaceIndex === -1) {
        return []
      }

      const score = Number(trimmed.slice(0, firstSpaceIndex))
      const path = trimmed.slice(firstSpaceIndex + 1).trim()
      if (!Number.isFinite(score) || !path) {
        return []
      }

      return [{ score, path }]
    })
}

function isWithinProjectRoots(projectPath: string, projectRoots: string[]): boolean {
  const normalizedProjectPath = normalizePathForMatching(projectPath)

  return projectRoots.some(projectRoot => {
    const normalizedRoot = normalizePathForMatching(projectRoot)
    return normalizedProjectPath === normalizedRoot || normalizedProjectPath.startsWith(`${normalizedRoot}/`)
  })
}

export function applyZoxideMode(items: Item[], entries: ZoxideEntry[], config: Config): Item[] {
  if (config.zoxideMode === 'off' || entries.length === 0) {
    return items.sort((a, b) => a.title.localeCompare(b.title))
  }

  const zoxideScores = new Map(entries.map(entry => [normalizePathForMatching(entry.path), entry.score]))
  const rankedItems = [...items].sort((left, right) => {
    const scoreDifference =
      (zoxideScores.get(normalizePathForMatching(right.path)) ?? 0) -
      (zoxideScores.get(normalizePathForMatching(left.path)) ?? 0)

    if (scoreDifference !== 0) {
      return scoreDifference
    }

    return left.title.localeCompare(right.title)
  })

  if (config.zoxideMode !== 'merge') {
    return rankedItems
  }

  const existingPaths = new Set(rankedItems.map(item => normalizePathForMatching(item.path)))
  const mergedItems = entries.flatMap(entry => {
    const normalizedPath = normalizePathForMatching(entry.path)
    const baseName = basename(entry.path)

    if (
      existingPaths.has(normalizedPath) ||
      !isWithinProjectRoots(entry.path, config.projectPaths) ||
      isIgnoredProjectDirectory(baseName)
    ) {
      return []
    }

    existingPaths.add(normalizedPath)
    return [toProjectItem(entry.path)]
  })

  return [...rankedItems, ...mergedItems]
}

async function getZoxideEntries(projectRoots: string[]): Promise<ZoxideEntry[]> {
  try {
    const proc = spawn(['zoxide', 'query', '--list', '--score'])
    const output = await new Response(proc.stdout).text()
    await proc.exited

    if (proc.exitCode !== 0) {
      return []
    }

    const entriesWithinRoots = parseZoxideOutput(output).filter(entry => isWithinProjectRoots(entry.path, projectRoots))
    const projectCandidatePaths = await filterProjectCandidatePaths(entriesWithinRoots.map(entry => entry.path))
    const projectCandidates = new Set(projectCandidatePaths)

    return entriesWithinRoots.filter(entry => projectCandidates.has(normalizePathForMatching(entry.path)))
  } catch {
    return []
  }
}

export async function getProjectItems(config: Config): Promise<Item[]> {
  const items: Item[] = []

  const existingPaths: string[] = []
  for (const path of config.projectPaths) {
    try {
      await stat(path)
      existingPaths.push(path)
    } catch {}
  }

  if (existingPaths.length === 0) {
    return items
  }

  const args = [...existingPaths, '-mindepth', '1', '-maxdepth', '3', '-type', 'd']

  const proc = spawn(['find', ...args])
  const output = await new Response(proc.stdout).text()

  const lines = output.trim().split('\n').filter(Boolean)

  const projectCandidatePaths = await filterProjectCandidatePaths(lines)

  for (const line of projectCandidatePaths) {
    const baseName = basename(line)

    if (isIgnoredProjectDirectory(baseName)) {
      continue
    }

    items.push(toProjectItem(line))
  }

  const zoxideEntries = config.zoxideMode === 'off' ? [] : await getZoxideEntries(existingPaths)

  return applyZoxideMode(items, zoxideEntries, config)
}
