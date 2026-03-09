import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { CreateProjectDbInput, TrackWithLatest } from '../db/trackStore'
import { createProjectRecord } from '../db/trackStore'

export type ProjectTemplateOptions = {
  mode: 'blank' | 'template'
  templatePath?: string | null
  templateDisplayName?: string | null
  createStandardFolders: boolean
  openAfterCreate: boolean
  rememberRecentTemplate: boolean
  saveAsDefaults: boolean
  projectTypeLabel?: string | null
  future?: {
    defaultTags?: string[]
    color?: string | null
    bpm?: number | null
    notes?: string | null
  }
}

export type CreateProjectInput = {
  projectName: string
  saveTo: string
  dawFormat: 'als' | 'flp' | 'ptx'
  folderId?: string | null
  initialStatus: string
  templateOptions: ProjectTemplateOptions
}

export type CreateProjectResult = {
  projectId: string
  projectFolderPath: string
  projectFilePath: string
  createdFromTemplate: boolean
  track: TrackWithLatest
}

export class ProjectCreatedOnDiskSyncError extends Error {
  projectId: string
  projectFolderPath: string
  projectFilePath: string
  constructor(message: string, payload: { projectId: string; projectFolderPath: string; projectFilePath: string }) {
    super(message)
    this.name = 'ProjectCreatedOnDiskSyncError'
    this.projectId = payload.projectId
    this.projectFolderPath = payload.projectFolderPath
    this.projectFilePath = payload.projectFilePath
  }
}

type ProjectFactoryDeps = {
  createProjectRecordImpl?: (input: CreateProjectDbInput) => Promise<TrackWithLatest>
}

type ManifestPayload = {
  projectId: string
  projectName: string
  createdAt: string
  mode: 'blank' | 'template'
  templateSourcePath: string | null
  templateDisplayName: string | null
  projectTypeLabel: string | null
  dawFormat: 'als' | 'flp' | 'ptx'
}

const STANDARD_PROJECT_FOLDERS = ['Samples', 'Exports', 'Stems', 'Notes']

function sanitizeProjectName(name: string): string {
  const withoutInvalid = Array.from(name).map((char) => {
    const code = char.charCodeAt(0)
    if (code >= 0 && code <= 31) return ' '
    if ('<>:"/\\|?*'.includes(char)) return ' '
    return char
  }).join('')
  return withoutInvalid.replace(/\s+/g, ' ').trim()
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
  const stat = await fs.stat(dirPath)
  if (!stat.isDirectory()) {
    throw new Error('Save location is not a directory.')
  }
}

async function ensureUniqueProjectFolder(root: string, baseName: string): Promise<string> {
  for (let index = 0; index < 500; index += 1) {
    const folderName = index === 0 ? baseName : `${baseName} (${index})`
    const candidate = path.join(root, folderName)
    try {
      await fs.access(candidate)
      continue
    } catch {
      return candidate
    }
  }
  throw new Error('Could not resolve a unique project folder name.')
}

async function writeManifest(filePath: string, payload: ManifestPayload): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

function extensionForFormat(format: 'als' | 'flp' | 'ptx'): string {
  return format
}

export async function createProject(
  input: CreateProjectInput,
  deps?: ProjectFactoryDeps,
): Promise<CreateProjectResult> {
  const cleanName = sanitizeProjectName(input.projectName)
  if (!cleanName) {
    throw new Error('Project name is required.')
  }

  const saveRoot = path.resolve(input.saveTo)
  await ensureDirectoryExists(saveRoot)

  const mode = input.templateOptions.mode
  const dawFormat = mode === 'template' ? 'als' : input.dawFormat
  const extension = extensionForFormat(dawFormat)
  const projectFolderPath = await ensureUniqueProjectFolder(saveRoot, cleanName)
  await fs.mkdir(projectFolderPath, { recursive: true })

  const projectFilePath = path.join(projectFolderPath, `${cleanName}.${extension}`)
  if (mode === 'template') {
    const templatePath = input.templateOptions.templatePath?.trim()
    if (!templatePath) {
      throw new Error('Template is required for template mode.')
    }
    const resolvedTemplatePath = path.resolve(templatePath)
    const stat = await fs.stat(resolvedTemplatePath).catch(() => null)
    if (!stat || !stat.isFile()) {
      throw new Error('Selected template file could not be found.')
    }
    if (!resolvedTemplatePath.toLowerCase().endsWith('.als')) {
      throw new Error('Selected template must be an Ableton .als file.')
    }
    await fs.copyFile(resolvedTemplatePath, projectFilePath, fs.constants.COPYFILE_EXCL)
  } else {
    await fs.writeFile(projectFilePath, '', { flag: 'wx' })
  }

  if (input.templateOptions.createStandardFolders) {
    await Promise.all(
      STANDARD_PROJECT_FOLDERS.map((name) =>
        fs.mkdir(path.join(projectFolderPath, name), { recursive: true }),
      ),
    )
  }

  const nowIso = new Date().toISOString()
  const projectId = randomUUID()
  const templateSourcePath =
    mode === 'template' ? path.resolve(input.templateOptions.templatePath ?? '') : null
  const templateDisplayName =
    mode === 'template' ? input.templateOptions.templateDisplayName ?? null : null
  const projectTypeLabel = input.templateOptions.projectTypeLabel ?? null

  await writeManifest(path.join(projectFolderPath, '.studio-vaulted.json'), {
    projectId,
    projectName: cleanName,
    createdAt: nowIso,
    mode,
    templateSourcePath,
    templateDisplayName,
    projectTypeLabel,
    dawFormat,
  })

  const stats = await fs.stat(projectFilePath)
  const dbInput: CreateProjectDbInput = {
    projectId,
    projectName: cleanName,
    rootPath: projectFolderPath,
    dawProjectPath: projectFilePath,
    dawFormat,
    folderId: input.folderId ?? null,
    status: input.initialStatus,
    creationMode: mode,
    sourceTemplatePath: templateSourcePath,
    sourceTemplateName: templateDisplayName,
    projectTypeLabel,
    fileSize: stats.size,
    savedAt: stats.mtimeMs,
  }
  const createRecord = deps?.createProjectRecordImpl ?? createProjectRecord
  try {
    const track = await createRecord(dbInput)
    return {
      projectId,
      projectFolderPath,
      projectFilePath,
      createdFromTemplate: mode === 'template',
      track,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error'
    throw new ProjectCreatedOnDiskSyncError(
      `Project created on disk but failed to sync library: ${message}`,
      { projectId, projectFolderPath, projectFilePath },
    )
  }
}
