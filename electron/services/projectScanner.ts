import path from 'node:path'
import { promises as fs } from 'node:fs'

export interface ScannedAbletonProject {
  filePath: string
  displayName: string
  modifiedTime: number
  folderPath: string
  fileSize: number
}

export interface ScanRootOptions {
  recursive: boolean
  maxDepth?: number
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.idea',
  '.next',
  'dist',
  'build',
])

export function cleanAbletonDisplayName(baseName: string): string {
  return baseName.replace(/\s*\[\d{4}\s\d{2}\s\d{2}\s\d{6}\]\s*$/i, '').trim()
}

function shouldIgnoreDir(name: string): boolean {
  if (!name) return true
  if (name.startsWith('.')) return true
  return IGNORED_DIRS.has(name.toLowerCase())
}

export async function scanAbletonProjects(
  root: string,
  options: ScanRootOptions,
): Promise<ScannedAbletonProject[]> {
  const maxDepth = options.maxDepth ?? 8
  const results: ScannedAbletonProject[] = []
  const startRoot = path.resolve(root)

  const walk = async (dirPath: string, depth: number): Promise<void> => {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      return
    }

    for (const entry of entries) {
      const entryName = entry.name
      const entryPath = path.join(dirPath, entryName)
      if (entry.isDirectory()) {
        if (!options.recursive || depth >= maxDepth || shouldIgnoreDir(entryName)) {
          continue
        }
        await walk(entryPath, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (entryName.startsWith('.')) continue
      if (!entryName.toLowerCase().endsWith('.als')) continue
      try {
        const stats = await fs.stat(entryPath)
        const displayName = cleanAbletonDisplayName(
          path.basename(entryName, path.extname(entryName)),
        )
        results.push({
          filePath: entryPath,
          displayName: displayName || path.basename(entryName, '.als'),
          modifiedTime: stats.mtimeMs,
          folderPath: path.dirname(entryPath),
          fileSize: stats.size,
        })
      } catch {
        // Ignore unreadable files.
      }
    }
  }

  await walk(startRoot, 0)
  return results
}
