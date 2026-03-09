import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import type { AppSettings } from './settingsStore'

export type TemplateRecord = {
  id: string
  displayName: string
  sourcePath: string
  folderLabel?: string | null
  modifiedAt: string
}

type TemplateDiscoverySettings = Pick<
  AppSettings,
  'templateRootDirs' | 'scanTemplateSubfolders' | 'recentTemplatePaths'
>

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.idea',
  '.next',
  'dist',
  'build',
  '__pycache__',
  '$recycle.bin',
  'system volume information',
])

export function cleanTemplateDisplayName(fileName: string): string {
  const withoutExt = path.basename(fileName, path.extname(fileName))
  return withoutExt.replace(/\s*\[\d{4}\s\d{2}\s\d{2}\s\d{6}\]\s*$/i, '').trim()
}

function shouldIgnoreDirectory(name: string): boolean {
  if (!name) return true
  if (name.startsWith('.')) return true
  return IGNORED_DIRS.has(name.toLowerCase())
}

function uniqResolvedPaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const resolved: string[] = []
  for (const entry of paths) {
    const next = entry.trim()
    if (!next) continue
    const normalized = path.resolve(next)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    resolved.push(normalized)
  }
  return resolved
}

function defaultAbletonTemplateDirs(): string[] {
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return [
      path.join(home, 'Music', 'Ableton', 'User Library', 'Templates'),
      path.join(home, 'Music', 'Ableton', 'User Library', 'Templates', 'Set'),
    ]
  }
  if (process.platform === 'win32') {
    return [
      path.join(home, 'Documents', 'Ableton', 'User Library', 'Templates'),
      path.join(home, 'Documents', 'Ableton', 'User Library', 'Templates', 'Set'),
    ]
  }
  return [path.join(home, 'Music', 'Ableton', 'User Library', 'Templates')]
}

async function pathExistsAndDir(absPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(absPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function scanTemplateRoot(
  root: string,
  recursive: boolean,
): Promise<TemplateRecord[]> {
  const found: TemplateRecord[] = []
  const walk = async (dirPath: string): Promise<void> => {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (!recursive || shouldIgnoreDirectory(entry.name)) continue
        await walk(entryPath)
        continue
      }
      if (!entry.isFile()) continue
      if (entry.name.startsWith('.')) continue
      if (!entry.name.toLowerCase().endsWith('.als')) continue
      try {
        const stats = await fs.stat(entryPath)
        const displayName = cleanTemplateDisplayName(entry.name)
        found.push({
          id: entryPath,
          displayName: displayName || path.basename(entry.name, '.als'),
          sourcePath: entryPath,
          folderLabel: path.basename(path.dirname(entryPath)) || null,
          modifiedAt: new Date(stats.mtimeMs).toISOString(),
        })
      } catch {
        // Ignore unreadable files.
      }
    }
  }
  await walk(root)
  return found
}

function sortTemplates(records: TemplateRecord[], recent: string[]): TemplateRecord[] {
  const recentLookup = new Map<string, number>()
  recent.forEach((item, index) => {
    recentLookup.set(path.resolve(item), index)
  })
  return [...records].sort((a, b) => {
    const aRecent = recentLookup.get(path.resolve(a.sourcePath))
    const bRecent = recentLookup.get(path.resolve(b.sourcePath))
    const aIsRecent = typeof aRecent === 'number'
    const bIsRecent = typeof bRecent === 'number'
    if (aIsRecent && bIsRecent) return aRecent - bRecent
    if (aIsRecent) return -1
    if (bIsRecent) return 1
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
  })
}

export async function discoverTemplates(
  settings: TemplateDiscoverySettings,
): Promise<TemplateRecord[]> {
  const candidateRoots = uniqResolvedPaths([
    ...settings.templateRootDirs,
    ...defaultAbletonTemplateDirs(),
  ])
  const existingRoots: string[] = []
  for (const root of candidateRoots) {
    if (await pathExistsAndDir(root)) {
      existingRoots.push(root)
    }
  }
  if (existingRoots.length === 0) return []

  const byPath = new Map<string, TemplateRecord>()
  for (const root of existingRoots) {
    const templates = await scanTemplateRoot(root, settings.scanTemplateSubfolders)
    for (const template of templates) {
      const key = path.resolve(template.sourcePath)
      if (byPath.has(key)) continue
      byPath.set(key, template)
    }
  }

  return sortTemplates(Array.from(byPath.values()), settings.recentTemplatePaths)
}
