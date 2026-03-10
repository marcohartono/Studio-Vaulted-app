import { app, BrowserWindow, ipcMain, dialog, protocol, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { promises as fs, existsSync } from 'node:fs'
import { scanForProjects } from './scan/scanForProjects'
import { parseAbletonVersionFile } from './scan/trackGrouping'
import { scanAbletonProjects } from './services/projectScanner'
import { getSettings, updateSettings, type AppSettings } from './services/settingsStore'
import { discoverTemplates } from './services/templateDiscovery'
import {
  createProject as createProjectFromInput,
  ProjectCreatedOnDiskSyncError,
  type CreateProjectInput,
} from './services/projectFactory'
import {
  listTracks,
  listTracksByFolder,
  listTrashedTracks,
  upsertScanResults,
  listTrackVersions,
  setLatestVersion,
  debugComputeBpmForFileName,
  moveToTrash,
  restoreTracks,
  purgeTracks,
  setTrackBpm,
  setTrackFolder,
  setTrackStatus,
  setTrackGenre,
  setTrackAudioPath,
} from './db/trackStore'
import { enqueueBpm } from './bpm/bpmQueue'
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
} from './db/folderStore'
import {
  createTrackNote,
  deleteNoteMedia,
  getNotesMediaRootPath,
  getTrackNoteByTrackId,
  listNoteMedia,
  renameNoteMedia,
  saveNoteMediaFile,
  updateTrackNoteContent,
} from './db/trackNoteStore'
import {
  activateLicense,
  deactivateLicense,
  getLicenseStatus,
  initLicense,
} from './license/license'

const DEBUG_AUDIO = process.env.DEBUG_AUDIO === '1'
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.aiff', '.aif', '.m4a', '.flac', '.webm', '.ogg', '.opus'])
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.svg'])
let libraryRoots: string[] = []
let scanRootInFlight: Promise<{
  tracks: Awaited<ReturnType<typeof listTracks>>
  found: number
  settings: AppSettings
  error?: string
}> | null = null
let scanRootInFlightKey: string | null = null

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  const pngIcon = path.join(process.env.VITE_PUBLIC, 'Studio-vaulted-icon-1.png')
  const icoIcon = path.join(process.env.VITE_PUBLIC, 'Studio-vaulted-icon-1.ico')
  // Use .ico on Windows if available, otherwise fall back to .png
  const iconPath = process.platform === 'win32' && existsSync(icoIcon) ? icoIcon : pngIcon

  win = new BrowserWindow({
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })
  win.maximize()

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function isPathInRoots(filePath: string, roots: string[]) {
  if (roots.length === 0) return false
  const resolved = path.resolve(filePath)
  return roots.some((root) => {
    const resolvedRoot = path.resolve(root)
    if (process.platform === 'win32') {
      return resolved.toLowerCase().startsWith(resolvedRoot.toLowerCase() + path.sep)
    }
    return resolved.startsWith(resolvedRoot + path.sep)
  })
}

function isPathInsideRoot(filePath: string, root: string): boolean {
  const resolved = path.resolve(filePath)
  const resolvedRoot = path.resolve(root)
  if (process.platform === 'win32') {
    const lower = resolved.toLowerCase()
    const lowerRoot = resolvedRoot.toLowerCase()
    return lower === lowerRoot || lower.startsWith(lowerRoot + path.sep)
  }
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)
}

async function registerAudioProtocol() {
  protocol.registerFileProtocol('app', async (request, callback) => {
    try {
      const url = new URL(request.url)
      const filePath = url.searchParams.get('path')
      if (!filePath) {
        callback({ error: -6 })
        return
      }

      const ext = path.extname(filePath).toLowerCase()

      // app://media — serve images stored inside the notes media root
      if (url.hostname === 'media') {
        if (!IMAGE_EXTS.has(ext)) {
          callback({ error: -6 })
          return
        }
        const notesRoot = getNotesMediaRootPath()
        if (!isPathInsideRoot(filePath, notesRoot)) {
          callback({ error: -6 })
          return
        }
        await fs.access(filePath)
        callback({ path: filePath })
        return
      }

      // app://audio — serve audio from library roots or notes media root
      if (url.hostname === 'audio') {
        if (!AUDIO_EXTS.has(ext)) {
          callback({ error: -6 })
          return
        }
        if (!isPathInRoots(filePath, libraryRoots)) {
          const notesRoot = getNotesMediaRootPath()
          if (isPathInsideRoot(filePath, notesRoot)) {
            await fs.access(filePath)
            callback({ path: filePath })
            return
          }
          if (DEBUG_AUDIO) {
            console.warn('[audio] blocked path outside roots', filePath)
          }
          callback({ error: -6 })
          return
        }
        await fs.access(filePath)
        callback({ path: filePath })
        return
      }

      callback({ error: -6 })
    } catch (error) {
      if (DEBUG_AUDIO) {
        console.warn('[audio] protocol error', error)
      }
      callback({ error: -6 })
    }
  })
}

async function runRootScan(options?: {
  root?: string | null
  scanSubfolders?: boolean
}): Promise<{
  tracks: Awaited<ReturnType<typeof listTracks>>
  found: number
  settings: AppSettings
  error?: string
}> {
  const settings = await getSettings()
  const rootInput = options?.root ?? settings.projectRootDir
  if (!rootInput) {
    console.warn('[scanRoot] root-not-set: no project root configured')
    return {
      tracks: await listTracks(),
      found: 0,
      settings,
      error: 'root-not-set',
    }
  }
  const resolvedRoot = path.resolve(rootInput)
  const recursive = options?.scanSubfolders ?? settings.scanSubfolders
  try {
    const rootStat = await fs.stat(resolvedRoot)
    if (!rootStat.isDirectory()) {
      console.warn('[scanRoot] root-not-directory:', resolvedRoot)
      return {
        tracks: await listTracks(),
        found: 0,
        settings,
        error: 'root-not-directory',
      }
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError?.code === 'EACCES' || nodeError?.code === 'EPERM') {
      console.warn('[scanRoot] root-permission-denied:', resolvedRoot, nodeError?.code)
      return {
        tracks: await listTracks(),
        found: 0,
        settings,
        error: 'root-permission-denied',
      }
    }
    console.warn('[scanRoot] root-missing:', resolvedRoot, nodeError?.code ?? 'unknown')
    return {
      tracks: await listTracks(),
      found: 0,
      settings,
      error: 'root-missing',
    }
  }

  try {
    await fs.access(resolvedRoot, fs.constants.R_OK)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError?.code === 'EACCES' || nodeError?.code === 'EPERM') {
      console.warn('[scanRoot] scan-permission-denied:', resolvedRoot, nodeError?.code)
      return {
        tracks: await listTracks(),
        found: 0,
        settings,
        error: 'root-permission-denied',
      }
    }
    console.warn('[scanRoot] scan-failed-access:', resolvedRoot, nodeError?.code ?? 'unknown')
    return {
      tracks: await listTracks(),
      found: 0,
      settings,
      error: 'scan-failed',
    }
  }

  libraryRoots = [resolvedRoot]
  const scanned = await scanAbletonProjects(resolvedRoot, {
    recursive,
    maxDepth: 8,
  })
  console.info(
    '[scanRoot] scan-complete:',
    JSON.stringify({ root: resolvedRoot, recursive, found: scanned.length }),
  )
  const tracks = await upsertScanResults(
    scanned.map((item) => ({
      name: item.displayName,
      filePath: item.filePath,
      ext: 'als',
      lastModifiedMs: item.modifiedTime,
      fileSize: item.fileSize,
    })),
  )
  const latestAlsPaths = tracks
    .map((entry) => entry.latestVersion?.filePath)
    .filter(
      (filePath): filePath is string =>
        typeof filePath === 'string' && filePath.toLowerCase().endsWith('.als'),
    )
  if (latestAlsPaths.length > 0) {
    enqueueBpm(latestAlsPaths)
  }
  const nextSettings = await updateSettings({
    projectRootDir: resolvedRoot,
    scanSubfolders: recursive,
    lastScanAt: new Date().toISOString(),
  })
  return {
    tracks,
    found: scanned.length,
    settings: nextSettings,
  }
}

function extensionFromMimeType(mimeType: string, fallbackName: string): string {
  const lower = mimeType.toLowerCase()
  if (lower.includes('png')) return 'png'
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg'
  if (lower.includes('webp')) return 'webp'
  if (lower.includes('gif')) return 'gif'
  if (lower.includes('wav')) return 'wav'
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('webm')) return 'webm'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3'
  const fromName = path.extname(fallbackName).replace('.', '').toLowerCase()
  return fromName || 'bin'
}

ipcMain.handle("pickFolders", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "multiSelections"],
  });
  if (result.canceled) return [];
  libraryRoots = result.filePaths
  return result.filePaths;
});

ipcMain.handle('settings:getAll', async () => {
  return getSettings()
})

ipcMain.handle('settings:update', async (_event, patch: Partial<AppSettings>) => {
  return updateSettings(patch ?? {})
})

ipcMain.handle('settings:chooseDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('templates:list', async () => {
  const settings = await getSettings()
  return discoverTemplates(settings)
})

ipcMain.handle('templates:refresh', async () => {
  const settings = await getSettings()
  return discoverTemplates(settings)
})

ipcMain.handle('templates:chooseFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('pickAudioFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Audio', extensions: Array.from(AUDIO_EXTS).map((ext) => ext.slice(1)) },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { path: null }
  }
  const filePath = result.filePaths[0]
  if (!isPathInRoots(filePath, libraryRoots)) {
    if (DEBUG_AUDIO) {
      console.warn('[audio] selected file outside roots', filePath)
    }
    return { path: null, reason: 'outside-roots' }
  }
  return { path: filePath }
})

ipcMain.handle('scanProjects', async (_event, roots: string[]) => {
  if (!Array.isArray(roots)) return []
  libraryRoots = roots
  const hits = await scanForProjects(roots, { maxDepth: 6 })
  const tracks = await upsertScanResults(hits)
  const latestAlsPaths = tracks
    .map((entry) => entry.latestVersion?.filePath)
    .filter(
      (filePath): filePath is string =>
        typeof filePath === 'string' && filePath.toLowerCase().endsWith('.als'),
    )
  if (latestAlsPaths.length > 0) {
    enqueueBpm(latestAlsPaths)
  }
  return tracks
})

ipcMain.handle(
  'projects:scanRoot',
  async (
    _event,
    options?: {
      root?: string | null
      scanSubfolders?: boolean
    },
  ) => {
    const settings = await getSettings()
    const requestedRoot = options?.root ?? settings.projectRootDir ?? ''
    const requestedRecursive = options?.scanSubfolders ?? settings.scanSubfolders
    const requestKey = JSON.stringify({
      root: path.resolve(requestedRoot || '.'),
      scanSubfolders: requestedRecursive,
    })

    if (scanRootInFlight) {
      if (scanRootInFlightKey === requestKey) {
        return scanRootInFlight
      }
      await scanRootInFlight.catch(() => undefined)
    }

    scanRootInFlightKey = requestKey
    scanRootInFlight = runRootScan(options)
      .catch(async (error) => {
        const nodeError = error as NodeJS.ErrnoException
        console.error('[scanRoot] unhandled error:', nodeError?.message ?? error)
        const settings = await getSettings()
        return {
          tracks: await listTracks(),
          found: 0,
          settings,
          error:
            nodeError?.code === 'EACCES' || nodeError?.code === 'EPERM'
              ? 'scan-permission-denied'
              : 'scan-failed',
        }
      })
      .finally(() => {
        scanRootInFlight = null
        scanRootInFlightKey = null
      })
    return scanRootInFlight
  },
)

ipcMain.handle(
  'projects:create',
  async (
    _event,
    input: CreateProjectInput,
  ) => {
    try {
      const result = await createProjectFromInput(input)
      const resolvedRoot = path.resolve(input.saveTo)
      if (!libraryRoots.some((root) => path.resolve(root) === resolvedRoot)) {
        libraryRoots = [resolvedRoot]
      }
      if (input.templateOptions.rememberRecentTemplate && input.templateOptions.templatePath) {
        await updateSettings({
          recentTemplatePaths: [
            path.resolve(input.templateOptions.templatePath),
            ...(await getSettings()).recentTemplatePaths,
          ],
        })
      }
      if (input.templateOptions.saveAsDefaults) {
        await updateSettings({
          newProjectDefaults: {
            createStandardFolders: input.templateOptions.createStandardFolders,
            openAfterCreate: input.templateOptions.openAfterCreate,
            lastUsedTemplatePath:
              input.templateOptions.mode === 'template'
                ? input.templateOptions.templatePath ?? null
                : null,
          },
        })
      }
      if (input.templateOptions.openAfterCreate) {
        await shell.openPath(result.projectFilePath)
      }
      return { ok: true, result }
    } catch (error) {
      if (error instanceof ProjectCreatedOnDiskSyncError) {
        return {
          ok: false,
          error: error.message,
          createdOnDisk: true,
          projectId: error.projectId,
          projectFolderPath: error.projectFolderPath,
          projectFilePath: error.projectFilePath,
        }
      }
      const message = error instanceof Error ? error.message : 'Failed to create project.'
      return {
        ok: false,
        error: message,
        createdOnDisk: false,
      }
    }
  },
)

ipcMain.handle(
  'createProject',
  async (
    _event,
    legacyInput: {
      name: string
      root: string
      extension: 'als' | 'flp' | 'ptx'
      folderId?: string | null
      status?: string
    },
  ) => {
    const input: CreateProjectInput = {
      projectName: legacyInput.name,
      saveTo: legacyInput.root,
      dawFormat: legacyInput.extension,
      folderId: legacyInput.folderId ?? null,
      initialStatus: legacyInput.status ?? 'Idea',
      templateOptions: {
        mode: 'blank',
        createStandardFolders: true,
        openAfterCreate: false,
        rememberRecentTemplate: false,
        saveAsDefaults: false,
      },
    }
    try {
      const response = await createProjectFromInput(input)
      return response.track
    } catch {
      return null
    }
  },
)

ipcMain.handle('projects:chooseSaveDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('notes:getByTrackId', async (_event, trackId: string) => {
  if (!trackId) return null
  const note = await getTrackNoteByTrackId(trackId)
  if (!note) return null
  const media = await listNoteMedia(note.id)
  return { note, media }
})

ipcMain.handle('notes:createForTrack', async (_event, trackId: string) => {
  if (!trackId) return null
  const note = await createTrackNote(trackId)
  const media = await listNoteMedia(note.id)
  return { note, media }
})

ipcMain.handle('notes:updateContent', async (_event, payload: { trackId: string; contentJson: string }) => {
  if (!payload?.trackId) return null
  const note = await updateTrackNoteContent(payload.trackId, payload.contentJson ?? '')
  return note
})

ipcMain.handle(
  'notes:attachImage',
  async (
    _event,
    payload: {
      noteId: string
      trackId: string
      originalName: string
      mimeType: string
      bytes: Uint8Array
    },
  ) => {
    if (!payload?.noteId || !payload?.trackId || !payload?.bytes) {
      return { ok: false, error: 'Invalid image payload.' }
    }
    if (!payload.mimeType?.toLowerCase().startsWith('image/')) {
      return { ok: false, error: 'Only image attachments are supported.' }
    }
    const media = await saveNoteMediaFile({
      trackId: payload.trackId,
      noteId: payload.noteId,
      type: 'image',
      originalName: payload.originalName || 'image',
      bytes: payload.bytes,
      extension: extensionFromMimeType(payload.mimeType, payload.originalName),
    })
    return { ok: true, media }
  },
)

ipcMain.handle('notes:listMedia', async (_event, noteId: string) => {
  if (!noteId) return []
  return listNoteMedia(noteId)
})

ipcMain.handle('notes:deleteMedia', async (_event, mediaId: string) => {
  if (!mediaId) return { ok: false }
  return deleteNoteMedia(mediaId)
})

ipcMain.handle(
  'notes:renameMedia',
  async (_event, payload: { mediaId: string; originalName: string }) => {
    if (!payload?.mediaId) return { ok: false, error: 'Media id is required.' }
    return renameNoteMedia(payload.mediaId, payload.originalName ?? '')
  },
)

ipcMain.handle(
  'notes:saveVoiceRecording',
  async (
    _event,
    payload: {
      noteId: string
      trackId: string
      originalName: string
      mimeType: string
      bytes: Uint8Array
    },
  ) => {
    if (!payload?.noteId || !payload?.trackId || !payload?.bytes) {
      return { ok: false, error: 'Invalid recording payload.' }
    }
    const media = await saveNoteMediaFile({
      trackId: payload.trackId,
      noteId: payload.noteId,
      type: 'audio',
      originalName: payload.originalName || 'recording.webm',
      bytes: payload.bytes,
      extension: extensionFromMimeType(payload.mimeType || '', payload.originalName || ''),
    })
    return { ok: true, media }
  },
)

ipcMain.handle('getTracks', async () => {
  return listTracks()
})

ipcMain.handle('getTracksByFolder', async (_event, folderId: string) => {
  if (!folderId) return listTracks()
  return listTracksByFolder(folderId)
})

ipcMain.handle('getTrashedTracks', async () => {
  return listTrashedTracks()
})

ipcMain.handle('upsertTracks', async () => {
  return listTracks()
})

ipcMain.handle('setTrackBpm', async (_event, id: string, bpm: number | null) => {
  await setTrackBpm(id, bpm)
  return null
})

ipcMain.handle('setTrackFolder', async (_event, id: string, folderId: string | null) => {
  return setTrackFolder(id, folderId)
})

ipcMain.handle('setTrackStatus', async (_event, id: string, status: string) => {
  if (!id || !status) return null
  return setTrackStatus(id, status)
})

ipcMain.handle('setTrackGenre', async (_event, id: string, genre: string | null) => {
  if (!id) return null
  return setTrackGenre(id, genre ?? null)
})

ipcMain.handle('setTrackAudioPath', async (_event, id: string, audioPath: string | null) => {
  if (!id) return null
  return setTrackAudioPath(id, audioPath ?? null)
})

ipcMain.handle('openProjectPath', async (_event, filePath: string) => {
  if (!filePath) return { ok: false }

  // If the stored path is an Ableton timestamped backup, resolve to the canonical main file.
  // e.g. "MySong [2026 03 10 120000].als" → "MySong.als"
  const parsed = parseAbletonVersionFile(filePath)
  let targetPath = filePath
  if (parsed) {
    const canonical = path.join(path.dirname(filePath), `${parsed.baseName}.als`)
    if (existsSync(canonical)) {
      targetPath = canonical
    }
  }

  const result = await shell.openPath(targetPath)
  return { ok: result === '', error: result || null }
})

ipcMain.handle('revealProjectPath', async (_event, filePath: string) => {
  if (!filePath) return { ok: false }
  shell.showItemInFolder(filePath)
  return { ok: true }
})

ipcMain.handle('system:openPath', async (_event, targetPath: string) => {
  if (!targetPath) return { ok: false }
  const result = await shell.openPath(targetPath)
  return { ok: result === '', error: result || null }
})

ipcMain.handle('moveToTrash', async (_event, ids: string[]) => {
  if (!Array.isArray(ids)) return listTracks()
  return moveToTrash(ids)
})

ipcMain.handle('restoreTracks', async (_event, ids: string[]) => {
  if (!Array.isArray(ids)) return listTracks()
  return restoreTracks(ids)
})

ipcMain.handle('purgeTracks', async (_event, ids: string[]) => {
  if (!Array.isArray(ids)) return listTracks()
  return purgeTracks(ids)
})

ipcMain.handle('computeBpmForTracks', async (_event, idsOrPaths: string[]) => {
  if (!Array.isArray(idsOrPaths)) return { queued: 0 }
  const queued = enqueueBpm(idsOrPaths)
  return { queued }
})

ipcMain.handle('updateTrackBpm', async (_event, id: string, bpm: number | null) => {
  await setTrackBpm(id, bpm)
  return null
})

ipcMain.handle('listFolders', async () => {
  return listFolders()
})

ipcMain.handle('createFolder', async (_event, name: string) => {
  if (!name) return listFolders()
  return createFolder(name)
})

ipcMain.handle('renameFolder', async (_event, id: string, name: string) => {
  if (!id || !name) return listFolders()
  return renameFolder(id, name)
})

ipcMain.handle('deleteFolder', async (_event, id: string) => {
  if (!id) return listFolders()
  return deleteFolder(id)
})

ipcMain.handle('listTrackVersions', async (_event, trackId: string) => {
  if (!trackId) return []
  return listTrackVersions(trackId)
})

ipcMain.handle('setLatestVersion', async (_event, trackId: string, versionId: string) => {
  if (!trackId || !versionId) return null
  const updated = await setLatestVersion(trackId, versionId)
  const latestPath = updated?.latestVersion?.filePath
  if (latestPath && latestPath.toLowerCase().endsWith('.als')) {
    enqueueBpm([latestPath])
  }
  return updated
})

ipcMain.handle('debugComputeBpmForFileName', async (_event, fileName: string) => {
  if (!fileName) return null
  const updated = await debugComputeBpmForFileName(fileName)
  if (updated) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('bpmUpdated', { id: updated.id, bpm: updated.bpm })
    }
  }
  return updated
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

ipcMain.handle('license:getStatus', () => {
  return getLicenseStatus()
})

ipcMain.handle('license:activate', async (_event, key: string) => {
  return activateLicense(key)
})

ipcMain.handle('license:deactivate', async () => {
  await deactivateLicense()
  return { success: true }
})

app.whenReady().then(async () => {
  await initLicense()
  const settings = await getSettings()
  if (settings.projectRootDir) {
    libraryRoots = [settings.projectRootDir]
  }
  await registerAudioProtocol()
  createWindow()
})
