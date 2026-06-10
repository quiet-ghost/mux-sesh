import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { getDefaultConfig } from '../src/config'
import {
  buildFileSessionName,
  buildFileStartupCommand,
  expandUserPath,
  interpolateStartupCommand,
  isFileItem,
  looksLikePathInput,
  resolveFileSession,
  resolveTypedPathTarget,
} from '../src/files/target'

describe('file target helpers', () => {
  test('builds session names from parent directory and file name', () => {
    expect(buildFileSessionName('/home/tester/notes/todo.md')).toBe('notes_todo_md')
    expect(buildFileSessionName('/home/tester/dev/mux-sesh/src/app.tsx')).toBe('src_app_tsx')
    expect(buildFileSessionName('/file.txt')).toBe('file_txt')
  })

  test('detects file items by kind', () => {
    expect(isFileItem({ itemKind: 'file' })).toBe(true)
    expect(isFileItem({ itemKind: 'project' })).toBe(false)
    expect(isFileItem({ itemKind: undefined })).toBe(false)
  })

  test('expands user paths against the provided home directory', () => {
    expect(expandUserPath('~', '/home/tester')).toBe('/home/tester')
    expect(expandUserPath('~/notes/todo.md', '/home/tester')).toBe('/home/tester/notes/todo.md')
    expect(expandUserPath('/etc/hosts', '/home/tester')).toBe('/etc/hosts')
  })

  test('interpolates startup placeholders with quoted paths', () => {
    expect(interpolateStartupCommand('nvim {file}', "/tmp/it's-here/todo.md")).toBe(
      "nvim '/tmp/it'\\''s-here/todo.md'"
    )
    expect(interpolateStartupCommand('cd {dir} && nvim {file}', '/tmp/notes/todo.md')).toBe(
      "cd '/tmp/notes' && nvim '/tmp/notes/todo.md'"
    )
    expect(interpolateStartupCommand('nvim {}', '/tmp/notes/todo.md')).toBe(
      "nvim '/tmp/notes/todo.md'"
    )
  })

  test('falls back to the configured editor for file startup commands', () => {
    const config = getDefaultConfig('/home/tester')
    expect(buildFileStartupCommand('/tmp/notes/todo.md', config)).toBe("nvim '/tmp/notes/todo.md'")
  })

  test('prefers default startup command when it has a file placeholder', () => {
    const config = {
      ...getDefaultConfig('/home/tester'),
      defaultSession: { startupCommand: 'hx {file}' },
    }

    expect(buildFileStartupCommand('/tmp/notes/todo.md', config)).toBe("hx '/tmp/notes/todo.md'")
  })

  test('resolves file sessions with parent directory cwd', () => {
    const config = getDefaultConfig('/home/tester')
    const resolved = resolveFileSession('/home/tester/notes/todo.md', config)

    expect(resolved).toEqual({
      sessionName: 'notes_todo_md',
      cwd: '/home/tester/notes',
      startupCommand: "nvim '/home/tester/notes/todo.md'",
    })
  })

  test('recognizes path-like search input only', () => {
    expect(looksLikePathInput('/etc/hosts')).toBe(true)
    expect(looksLikePathInput('~')).toBe(true)
    expect(looksLikePathInput('~/notes')).toBe(true)
    expect(looksLikePathInput('./notes')).toBe(true)
    expect(looksLikePathInput('notes')).toBe(false)
    expect(looksLikePathInput('https://github.com/user/repo')).toBe(false)
  })

  test('resolves typed paths to file and directory targets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mux-sesh-file-target-'))

    try {
      const filePath = join(root, 'todo.md')
      await writeFile(filePath, 'hello')

      expect(await resolveTypedPathTarget(filePath)).toEqual({ kind: 'file', path: filePath })
      expect(await resolveTypedPathTarget(root)).toEqual({ kind: 'directory', path: root })
      expect(await resolveTypedPathTarget(join(root, 'missing.md'))).toBeNull()
      expect(await resolveTypedPathTarget('todo.md')).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('resolves tilde-prefixed typed paths against home', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mux-sesh-file-target-home-'))

    try {
      const filePath = join(root, 'todo.md')
      await writeFile(filePath, 'hello')

      expect(await resolveTypedPathTarget('~/todo.md', root)).toEqual({
        kind: 'file',
        path: filePath,
      })
      expect(await resolveTypedPathTarget('~', dirname(filePath))).toEqual({
        kind: 'directory',
        path: root,
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
