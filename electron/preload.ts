import { ipcRenderer, contextBridge } from 'electron'
import type { IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('studioVaulted', {
  pickFolders: () => ipcRenderer.invoke('pickFolders'),
  scanProjects: (roots: string[]) => ipcRenderer.invoke('scanProjects', roots),
  getTracks: () => ipcRenderer.invoke('getTracks'),
  getTracksByFolder: (folderId: string) => ipcRenderer.invoke('getTracksByFolder', folderId),
  getTrashedTracks: () => ipcRenderer.invoke('getTrashedTracks'),
  upsertTracks: (tracks: unknown[]) => ipcRenderer.invoke('upsertTracks', tracks),
  moveToTrash: (ids: string[]) => ipcRenderer.invoke('moveToTrash', ids),
  restoreTracks: (ids: string[]) => ipcRenderer.invoke('restoreTracks', ids),
  purgeTracks: (ids: string[]) => ipcRenderer.invoke('purgeTracks', ids),
  setTrackBpm: (id: string, bpm: number | null) => ipcRenderer.invoke('setTrackBpm', id, bpm),
  setTrackFolder: (id: string, folderId: string | null) =>
    ipcRenderer.invoke('setTrackFolder', id, folderId),
  setTrackStatus: (id: string, status: string) =>
    ipcRenderer.invoke('setTrackStatus', id, status),
  setTrackGenre: (id: string, genre: string | null) =>
    ipcRenderer.invoke('setTrackGenre', id, genre),
  setTrackAudioPath: (id: string, audioPath: string | null) =>
    ipcRenderer.invoke('setTrackAudioPath', id, audioPath),
  openProjectPath: (filePath: string) => ipcRenderer.invoke('openProjectPath', filePath),
  revealProjectPath: (filePath: string) => ipcRenderer.invoke('revealProjectPath', filePath),
  listFolders: () => ipcRenderer.invoke('listFolders'),
  createFolder: (name: string) => ipcRenderer.invoke('createFolder', name),
  renameFolder: (id: string, name: string) => ipcRenderer.invoke('renameFolder', id, name),
  deleteFolder: (id: string) => ipcRenderer.invoke('deleteFolder', id),
  listTrackVersions: (trackId: string) => ipcRenderer.invoke('listTrackVersions', trackId),
  setLatestVersion: (trackId: string, versionId: string) =>
    ipcRenderer.invoke('setLatestVersion', trackId, versionId),
  debugComputeBpmForFileName: (fileName: string) =>
    ipcRenderer.invoke('debugComputeBpmForFileName', fileName),
  computeBpmForTracks: (idsOrPaths: string[]) =>
    ipcRenderer.invoke('computeBpmForTracks', idsOrPaths),
  updateTrackBpm: (id: string, bpm: number | null) =>
    ipcRenderer.invoke('updateTrackBpm', id, bpm),
  pickAudioFile: () => ipcRenderer.invoke('pickAudioFile'),
  createProject: (input: {
    name: string
    root: string
    extension: 'als' | 'flp' | 'ptx'
    folderId?: string | null
    status?: string
  }) => ipcRenderer.invoke('createProject', input),
  onBpmUpdated: (callback: (payload: { id: string; bpm: number | null }) => void) => {
    const listener = (_event: IpcRendererEvent, payload: { id: string; bpm: number | null }) => {
      callback(payload)
    }
    ipcRenderer.on('bpmUpdated', listener)
    return () => ipcRenderer.off('bpmUpdated', listener)
  },
})

contextBridge.exposeInMainWorld('settings', {
  getAll: () => ipcRenderer.invoke('settings:getAll'),
  update: (
    patch: Partial<{
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
    }>,
  ) => ipcRenderer.invoke('settings:update', patch),
  chooseDirectory: () => ipcRenderer.invoke('settings:chooseDirectory'),
})

contextBridge.exposeInMainWorld('templates', {
  list: () => ipcRenderer.invoke('templates:list'),
  refresh: () => ipcRenderer.invoke('templates:refresh'),
  chooseFolder: () => ipcRenderer.invoke('templates:chooseFolder'),
})

contextBridge.exposeInMainWorld('projects', {
  scanRoot: (options?: { root?: string | null; scanSubfolders?: boolean }) =>
    ipcRenderer.invoke('projects:scanRoot', options),
  create: (input: unknown) => ipcRenderer.invoke('projects:create', input),
  chooseSaveDirectory: () => ipcRenderer.invoke('projects:chooseSaveDirectory'),
})

contextBridge.exposeInMainWorld('system', {
  openPath: (targetPath: string) => ipcRenderer.invoke('system:openPath', targetPath),
})

contextBridge.exposeInMainWorld('notes', {
  getByTrackId: (trackId: string) => ipcRenderer.invoke('notes:getByTrackId', trackId),
  createForTrack: (trackId: string) => ipcRenderer.invoke('notes:createForTrack', trackId),
  updateContent: (payload: { trackId: string; contentJson: string }) =>
    ipcRenderer.invoke('notes:updateContent', payload),
  attachImage: (payload: {
    noteId: string
    trackId: string
    originalName: string
    mimeType: string
    bytes: Uint8Array
  }) => ipcRenderer.invoke('notes:attachImage', payload),
  listMedia: (noteId: string) => ipcRenderer.invoke('notes:listMedia', noteId),
  deleteMedia: (mediaId: string) => ipcRenderer.invoke('notes:deleteMedia', mediaId),
  renameMedia: (payload: { mediaId: string; originalName: string }) =>
    ipcRenderer.invoke('notes:renameMedia', payload),
  saveVoiceRecording: (payload: {
    noteId: string
    trackId: string
    originalName: string
    mimeType: string
    bytes: Uint8Array
  }) => ipcRenderer.invoke('notes:saveVoiceRecording', payload),
})

contextBridge.exposeInMainWorld('audioApi', {
  buildAudioUrl: (absPath: string) => {
    const url = new URL('app://audio')
    url.searchParams.set('path', absPath)
    return url.toString()
  },
  buildMediaUrl: (absPath: string) => {
    const url = new URL('app://media')
    url.searchParams.set('path', absPath)
    return url.toString()
  },
})

contextBridge.exposeInMainWorld('license', {
  getStatus: () => ipcRenderer.invoke('license:getStatus'),
  activate: (key: string) => ipcRenderer.invoke('license:activate', key),
  deactivate: () => ipcRenderer.invoke('license:deactivate'),
})
