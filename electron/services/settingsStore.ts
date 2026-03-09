import path from 'node:path'
import { promises as fs } from 'node:fs'
import { app } from 'electron'

export interface AppSettings {
  projectRootDir: string | null
  scanSubfolders: boolean
  lastScanAt: string | null
  recentProjectRoots: string[]
  templateRootDirs: string[]
  scanTemplateSubfolders: boolean
  recentTemplatePaths: string[]
  newProjectDefaults: {
    createStandardFolders: boolean
    openAfterCreate: boolean
    lastUsedTemplatePath?: string | null
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  projectRootDir: null,
  scanSubfolders: true,
  lastScanAt: null,
  recentProjectRoots: [],
  templateRootDirs: [],
  scanTemplateSubfolders: true,
  recentTemplatePaths: [],
  newProjectDefaults: {
    createStandardFolders: true,
    openAfterCreate: false,
    lastUsedTemplatePath: null,
  },
}

let writeQueue: Promise<void> = Promise.resolve()

export function getSettingsFilePath(): string {
  return path.join(app.getPath('userData'), 'studio-vaulted-settings.json')
}

function toRecentRoots(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const deduped = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const next = item.trim()
    if (!next) continue
    deduped.add(path.resolve(next))
    if (deduped.size >= 5) break
  }
  return Array.from(deduped)
}

function toRecentTemplatePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const deduped = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const next = item.trim()
    if (!next) continue
    deduped.add(path.resolve(next))
    if (deduped.size >= 10) break
  }
  return Array.from(deduped)
}

function toTemplateRoots(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const deduped = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const next = item.trim()
    if (!next) continue
    deduped.add(path.resolve(next))
  }
  return Array.from(deduped)
}

export function normalizeSettings(input: unknown): AppSettings {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }
  const source = input as Record<string, unknown>
  const projectRootRaw = source.projectRootDir
  const projectRootDir =
    typeof projectRootRaw === 'string' && projectRootRaw.trim().length > 0
      ? path.resolve(projectRootRaw)
      : null
  const scanSubfolders =
    typeof source.scanSubfolders === 'boolean'
      ? source.scanSubfolders
      : DEFAULT_SETTINGS.scanSubfolders
  const lastScanAt =
    typeof source.lastScanAt === 'string' && source.lastScanAt.trim().length > 0
      ? source.lastScanAt
      : null
  const recentProjectRoots = toRecentRoots(source.recentProjectRoots)
  const templateRootDirs = toTemplateRoots(source.templateRootDirs)
  const scanTemplateSubfolders =
    typeof source.scanTemplateSubfolders === 'boolean'
      ? source.scanTemplateSubfolders
      : DEFAULT_SETTINGS.scanTemplateSubfolders
  const recentTemplatePaths = toRecentTemplatePaths(source.recentTemplatePaths)
  const rawDefaults =
    source.newProjectDefaults && typeof source.newProjectDefaults === 'object'
      ? (source.newProjectDefaults as Record<string, unknown>)
      : {}
  const createStandardFolders =
    typeof rawDefaults.createStandardFolders === 'boolean'
      ? rawDefaults.createStandardFolders
      : DEFAULT_SETTINGS.newProjectDefaults.createStandardFolders
  const openAfterCreate =
    typeof rawDefaults.openAfterCreate === 'boolean'
      ? rawDefaults.openAfterCreate
      : DEFAULT_SETTINGS.newProjectDefaults.openAfterCreate
  const lastUsedTemplatePathRaw = rawDefaults.lastUsedTemplatePath
  const lastUsedTemplatePath =
    typeof lastUsedTemplatePathRaw === 'string' && lastUsedTemplatePathRaw.trim().length > 0
      ? path.resolve(lastUsedTemplatePathRaw)
      : null
  if (projectRootDir && !recentProjectRoots.includes(projectRootDir)) {
    recentProjectRoots.unshift(projectRootDir)
  }
  const normalizedRecentTemplates = recentTemplatePaths.filter((item) => item !== lastUsedTemplatePath)
  if (lastUsedTemplatePath) {
    normalizedRecentTemplates.unshift(lastUsedTemplatePath)
  }
  return {
    projectRootDir,
    scanSubfolders,
    lastScanAt,
    recentProjectRoots: recentProjectRoots.slice(0, 5),
    templateRootDirs,
    scanTemplateSubfolders,
    recentTemplatePaths: normalizedRecentTemplates.slice(0, 10),
    newProjectDefaults: {
      createStandardFolders,
      openAfterCreate,
      lastUsedTemplatePath,
    },
  }
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(tempPath, content, 'utf8')
  await fs.rename(tempPath, filePath)
}

export async function writeSettingsAtomicForPath(
  filePath: string,
  settings: AppSettings,
): Promise<void> {
  await writeAtomic(filePath, JSON.stringify(settings, null, 2))
}

async function backupCorruptSettings(filePath: string): Promise<void> {
  try {
    const backupName = `${path.basename(filePath, '.json')}.corrupt-${Date.now()}.json`
    const backupPath = path.join(path.dirname(filePath), backupName)
    await fs.rename(filePath, backupPath)
  } catch {
    // Ignore backup failure; defaults will still be recreated.
  }
}

export async function getSettings(): Promise<AppSettings> {
  const filePath = getSettingsFilePath()
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return normalizeSettings(JSON.parse(raw))
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError?.code === 'ENOENT') {
      const defaults = { ...DEFAULT_SETTINGS }
      await writeAtomic(filePath, JSON.stringify(defaults, null, 2))
      return defaults
    }
    await backupCorruptSettings(filePath)
    const defaults = { ...DEFAULT_SETTINGS }
    await writeAtomic(filePath, JSON.stringify(defaults, null, 2))
    return defaults
  }
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getSettings()
  const next = normalizeSettings({ ...current, ...patch })
  if (next.projectRootDir) {
    next.recentProjectRoots = [
      next.projectRootDir,
      ...next.recentProjectRoots.filter((item) => item !== next.projectRootDir),
    ].slice(0, 5)
  }
  if (next.newProjectDefaults.lastUsedTemplatePath) {
    next.recentTemplatePaths = [
      next.newProjectDefaults.lastUsedTemplatePath,
      ...next.recentTemplatePaths.filter(
        (item) => item !== next.newProjectDefaults.lastUsedTemplatePath,
      ),
    ].slice(0, 10)
  }
  const filePath = getSettingsFilePath()
  writeQueue = writeQueue.then(() =>
    writeAtomic(filePath, JSON.stringify(next, null, 2)),
  )
  await writeQueue
  return next
}
