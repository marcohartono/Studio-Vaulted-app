import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import path from 'node:path'
export interface ScanFileHit {
  name: string
  filePath: string
  ext: string
  lastModifiedMs: number
  fileSize: number
}

export interface ScanOptions {
  maxDepth?: number
  maxConcurrency?: number
}

const PROJECT_FILE_EXTS = new Set(['.als', '.flp', '.ptx'])
const JUNK_DIRS = new Set([
  'node_modules',
  '.git',
  'library',
  'system volume information',
  '$recycle.bin',
])

export async function scanForProjects(
  roots: string[],
  options: ScanOptions = {},
): Promise<ScanFileHit[]> {
  const maxDepth = options.maxDepth ?? 6
  const maxConcurrency = options.maxConcurrency ?? 8
  const results: ScanFileHit[] = []

  const queue: Array<{ dirPath: string; depth: number }> = roots.map((root) => ({
    dirPath: root,
    depth: 0,
  }))

  if (queue.length === 0) {
    return results
  }

  let active = 0

  return await new Promise((resolve) => {
    const pump = () => {
      while (active < maxConcurrency && queue.length > 0) {
        const next = queue.shift()
        if (!next) break
        active += 1
        processDirectory(next.dirPath, next.depth)
          .catch(() => undefined)
          .finally(() => {
            active -= 1
            if (queue.length === 0 && active === 0) {
              resolve(results)
              return
            }
            pump()
          })
      }
    }

    const processDirectory = async (dirPath: string, depth: number) => {
      let entries: Dirent[]
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name)
        const lowerName = entry.name.toLowerCase()

        if (entry.isDirectory()) {
          if (JUNK_DIRS.has(lowerName)) {
            continue
          }

          if (lowerName.endsWith('.logicx')) {
            const hit = await buildHit(entryPath, entry.name, '.logicx')
            if (hit) {
              results.push(hit)
            }
            continue
          }

          if (depth >= maxDepth) {
            continue
          }

          queue.push({ dirPath: entryPath, depth: depth + 1 })
          continue
        }

        if (!entry.isFile()) {
          continue
        }

        const ext = path.extname(entry.name).toLowerCase()
        if (!PROJECT_FILE_EXTS.has(ext)) {
          continue
        }

        if (
          ext === '.flp' &&
          (lowerName.includes('(overwritten') || lowerName.includes('(autosaved'))
        ) {
          continue
        }

        const hit = await buildHit(entryPath, entry.name, ext)
        if (hit) {
          results.push(hit)
        }
      }
    }

    pump()
  })
}

async function buildHit(
  entryPath: string,
  entryName: string,
  ext: string,
): Promise<ScanFileHit | null> {
  try {
    const stats = await fs.stat(entryPath)
    return {
      name: ext === '.logicx' ? entryName.slice(0, -ext.length) : path.basename(entryName, ext),
      filePath: entryPath,
      ext: ext.replace('.', ''),
      lastModifiedMs: stats.mtimeMs,
      fileSize: stats.size,
    }
  } catch {
    return null
  }
}
