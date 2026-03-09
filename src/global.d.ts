interface Folder {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

interface LogicalTrack {
  id: string
  groupKey: string
  title: string
  latestVersionId: string | null
  rootPath: string | null
  abletonProjectPath: string | null
  dawFormat: 'als' | 'flp' | 'ptx'
  creationMode: 'blank' | 'template'
  sourceTemplatePath: string | null
  sourceTemplateName: string | null
  projectTypeLabel: string | null
  audioPath: string | null
  folderId: string | null
  status: string
  genre: string | null
  notes: string
  noteId: string | null
  notePreview: string | null
  trashed: boolean
  createdAt: number
  updatedAt: number
}

interface TrackVersion {
  id: string
  trackId: string
  filePath: string
  savedAt: number
  fileSize: number
  bpm: number | null
  bpmSource: string
  createdAt: number
}

interface TrackWithLatest {
  track: LogicalTrack
  latestVersion: TrackVersion | null
  versionCount: number
}

interface AppSettings {
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

interface TemplateRecord {
  id: string
  displayName: string
  sourcePath: string
  folderLabel?: string | null
  modifiedAt: string
}

interface ProjectTemplateOptions {
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

interface CreateProjectInput {
  projectName: string
  saveTo: string
  dawFormat: 'als' | 'flp' | 'ptx'
  folderId?: string | null
  initialStatus: string
  templateOptions: ProjectTemplateOptions
}

interface CreateProjectResult {
  projectId: string
  projectFolderPath: string
  projectFilePath: string
  createdFromTemplate: boolean
  track: TrackWithLatest
}

interface ProjectCreateResponse {
  ok: boolean
  result?: CreateProjectResult
  error?: string
  createdOnDisk?: boolean
  projectId?: string
  projectFolderPath?: string
  projectFilePath?: string
}

interface TrackNote {
  id: string
  trackId: string
  contentJson: string
  plainTextPreview: string
  createdAt: number
  updatedAt: number
}

type NoteMediaType = 'image' | 'audio'

interface NoteMedia {
  id: string
  noteId: string
  type: NoteMediaType
  filePath: string
  originalName: string
  sizeBytes: number
  createdAt: number
}

interface ScanRootResult {
  tracks: TrackWithLatest[]
  found: number
  settings: AppSettings
  error?:
    | 'root-not-set'
    | 'root-not-directory'
    | 'root-missing'
    | 'root-permission-denied'
    | 'scan-permission-denied'
    | 'scan-failed'
}

interface StudioVaultedAPI {
  pickFolders: () => Promise<string[]>
  scanProjects: (roots: string[]) => Promise<TrackWithLatest[]>
  getTracks: () => Promise<TrackWithLatest[]>
  getTracksByFolder: (folderId: string) => Promise<TrackWithLatest[]>
  getTrashedTracks: () => Promise<TrackWithLatest[]>
  upsertTracks: (tracks: unknown[]) => Promise<TrackWithLatest[]>
  moveToTrash: (ids: string[]) => Promise<TrackWithLatest[]>
  restoreTracks: (ids: string[]) => Promise<TrackWithLatest[]>
  purgeTracks: (ids: string[]) => Promise<TrackWithLatest[]>
  setTrackBpm: (id: string, bpm: number | null) => Promise<null>
  setTrackFolder: (id: string, folderId: string | null) => Promise<LogicalTrack | null>
  setTrackStatus: (id: string, status: string) => Promise<LogicalTrack | null>
  setTrackGenre: (id: string, genre: string | null) => Promise<LogicalTrack | null>
  setTrackAudioPath: (id: string, audioPath: string | null) => Promise<LogicalTrack | null>
  openProjectPath: (filePath: string) => Promise<{ ok: boolean; error?: string | null }>
  revealProjectPath: (filePath: string) => Promise<{ ok: boolean }>
  listFolders: () => Promise<Folder[]>
  createFolder: (name: string) => Promise<Folder[]>
  renameFolder: (id: string, name: string) => Promise<Folder[]>
  deleteFolder: (id: string) => Promise<Folder[]>
  listTrackVersions: (trackId: string) => Promise<TrackVersion[]>
  setLatestVersion: (trackId: string, versionId: string) => Promise<TrackWithLatest | null>
  debugComputeBpmForFileName: (fileName: string) => Promise<TrackVersion | null>
  computeBpmForTracks: (idsOrPaths: string[]) => Promise<{ queued: number }>
  updateTrackBpm: (id: string, bpm: number | null) => Promise<null>
  pickAudioFile: () => Promise<{ path: string | null; reason?: string }>
  createProject: (input: {
    name: string
    root: string
    extension: 'als' | 'flp' | 'ptx'
    folderId?: string | null
    status?: string
  }) => Promise<TrackWithLatest | null>
  onBpmUpdated: (callback: (payload: { id: string; bpm: number | null }) => void) => () => void
}

type LicensePlan = 'free' | 'paid'
type LicenseFeatureKey = 'notes' | 'templates'
type LicenseLimitKey = 'folders' | 'groups'

interface LicenseStatus {
  plan: LicensePlan
  activatedKey: string | null
  features: Record<LicenseFeatureKey, boolean>
  limits: Record<LicenseLimitKey, number>
}

interface ActivationResult {
  success: boolean
  error?: string
}

interface Window {
  studioVaulted: StudioVaultedAPI
  settings: {
    getAll: () => Promise<AppSettings>
    update: (patch: Partial<AppSettings>) => Promise<AppSettings>
    chooseDirectory: () => Promise<string | null>
  }
  projects: {
    scanRoot: (options?: {
      root?: string | null
      scanSubfolders?: boolean
    }) => Promise<ScanRootResult>
    create: (input: CreateProjectInput) => Promise<ProjectCreateResponse>
    chooseSaveDirectory: () => Promise<string | null>
  }
  templates: {
    list: () => Promise<TemplateRecord[]>
    refresh: () => Promise<TemplateRecord[]>
    chooseFolder: () => Promise<string | null>
  }
  system: {
    openPath: (path: string) => Promise<{ ok: boolean; error?: string | null }>
  }
  notes: {
    getByTrackId: (trackId: string) => Promise<{ note: TrackNote; media: NoteMedia[] } | null>
    createForTrack: (trackId: string) => Promise<{ note: TrackNote; media: NoteMedia[] } | null>
    updateContent: (payload: { trackId: string; contentJson: string }) => Promise<TrackNote | null>
    attachImage: (payload: {
      noteId: string
      trackId: string
      originalName: string
      mimeType: string
      bytes: Uint8Array
    }) => Promise<{ ok: boolean; media?: NoteMedia; error?: string }>
    listMedia: (noteId: string) => Promise<NoteMedia[]>
    deleteMedia: (mediaId: string) => Promise<{ ok: boolean }>
    renameMedia: (payload: { mediaId: string; originalName: string }) => Promise<{ ok: boolean; media?: NoteMedia; error?: string }>
    saveVoiceRecording: (payload: {
      noteId: string
      trackId: string
      originalName: string
      mimeType: string
      bytes: Uint8Array
    }) => Promise<{ ok: boolean; media?: NoteMedia; error?: string }>
  }
  audioApi: {
    buildAudioUrl: (absPath: string) => string
    buildMediaUrl: (absPath: string) => string
  }
  license: {
    getStatus: () => Promise<LicenseStatus>
    activate: (key: string) => Promise<ActivationResult>
    deactivate: () => Promise<{ success: boolean }>
  }
}
