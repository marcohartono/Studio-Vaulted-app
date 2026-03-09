import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import './App.css'
import logo from './assets/Studio-vaulted-icon-1.png'
import { useSettings } from './hooks/useSettings'
import { getScanErrorMessage, useProjectScan } from './hooks/useProjectScan'
import { ProjectRootSettingCard } from './components/settings/ProjectRootSettingCard'
import { ScanOptionsCard } from './components/settings/ScanOptionsCard'
import {
  StartNewProjectModal,
  type StartNewProjectFormState,
} from './components/projects/StartNewProjectModal'
import { TrackNoteModal } from './components/notes/TrackNoteModal'
import { PlanBadge } from './components/license/PlanBadge'
import { LicenseSettingsCard } from './components/settings/LicenseSettingsCard'
import {
  getPreviewState,
  initPreviewPlayer,
  pausePreview,
  playPreview,
  playPreviewSnippet,
  seekTo,
  subscribePreviewState,
  togglePreview,
} from './renderer/audio/previewPlayer'

type View =
  | { type: 'all' }
  | { type: 'trash' }
  | { type: 'folder'; id: string }
  | { type: 'settings' }

type ModalState =
  | { kind: 'folderCreate'; name: string }
  | { kind: 'folderRename'; id: string; name: string }
  | { kind: 'projectCreate' }

type FilterState = {
  bpmPreset: string  // '' | 'under100' | '100-120' | '120-130' | '130-140' | '140+'
  status: string     // '' | 'Idea' | 'Potential' | 'Finished'
  genre: string      // '' | any genre string
  datePreset: string // '' | 'today' | 'week' | 'month' | 'year'
}

const BPM_PRESETS: { label: string; id: string; min: number; max: number }[] = [
  { label: '<100', id: 'under100', min: 0, max: 99 },
  { label: '100–120', id: '100-120', min: 100, max: 120 },
  { label: '120–130', id: '120-130', min: 120, max: 130 },
  { label: '130–140', id: '130-140', min: 130, max: 140 },
  { label: '140+', id: '140+', min: 140, max: Infinity },
]

const STATUS_OPTIONS = ['Idea', 'Potential', 'Finished'] as const

const GENRE_GROUPS: { label: string; genres: string[] }[] = [
  { label: 'Hip Hop / R&B', genres: ['Hip Hop', 'Trap', 'R&B', 'Pluggnb', 'Rage', 'Drill', 'UK Drill', 'Lo-Fi', 'Boom Bap', 'Soul', 'Neo Soul', 'Future Soul', 'Cloud Rap'] },
  { label: 'House / Techno', genres: ['House', 'Tech House', 'Deep House', 'Nu Disco', 'Afro House', 'Amapiano', 'Minimal Techno', 'Dub Techno', 'Hard Techno', 'Acid House', 'Progressive House', 'Melodic House', 'UKG'] },
  { label: 'Pop / EDM', genres: ['Pop', 'EDM', 'Indie Pop', 'Hyperpop', 'Synth-Pop', 'K-Pop', 'Bedroom Pop', 'Dream Pop', 'Trap EDM', 'Trance', 'Future House', 'Tropical House'] },
  { label: 'Bass / Electronic', genres: ['Drum and Bass', 'Jungle', 'Dubstep', 'Leftfield Bass', 'Footwork', 'Synthwave', 'Chillout', 'IDM', 'Experimental', 'Speed Garage'] },
  { label: 'Live / Other', genres: ['Rock', 'Indie Rock', 'Jazz', 'Blues', 'Gospel', 'Funk', 'Reggae', 'Folk', 'Country', 'Classical', 'Punk'] },
  { label: 'Global', genres: ['Brazilian Funk', 'Reggaeton', 'Dancehall', 'Jersey Club', 'Moombahton', 'African', 'Indian', 'Latin'] },
  { label: 'Cinematic', genres: ['Cinematic'] },
]


const DATE_PRESETS: { label: string; id: string; ms: number }[] = [
  { label: 'Today', id: 'today', ms: 24 * 60 * 60 * 1000 },
  { label: 'This week', id: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'This month', id: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: 'This year', id: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
]

type VersionModalState = {
  trackId: string
  title: string
  versions: TrackVersion[]
}

type NoteModalState = {
  trackId: string
  trackTitle: string
}

type SortKey = 'title' | 'bpm' | 'savedAt'
type SortDirection = 'asc' | 'desc'

function App() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [tracks, setTracks] = useState<TrackWithLatest[]>([])
  const [view, setView] = useState<View>({ type: 'all' })
  const [foldersSelection, setFoldersSelection] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [projectCreateForm, setProjectCreateForm] = useState<StartNewProjectFormState | null>(null)
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [templateRecords, setTemplateRecords] = useState<TemplateRecord[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [versionModal, setVersionModal] = useState<VersionModalState | null>(null)
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [previewState, setPreviewState] = useState(getPreviewState())
  const [bulkFolderId, setBulkFolderId] = useState('')
  const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null)
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    bpmPreset: '',
    status: '',
    genre: '',
    datePreset: '',
  })
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'savedAt',
    direction: 'desc',
  })
  const bpmDebugDone = useRef(false)

  const hasBridge = typeof window !== 'undefined' && Boolean(window.studioVaulted)
  const hasSettingsBridge = typeof window !== 'undefined' && Boolean(window.settings && window.projects)
  const {
    settings,
    isLoading: isSettingsLoading,
    error: settingsError,
    update: updateSettings,
    refresh: refreshSettings,
  } = useSettings()
  const {
    scanRoot,
    isScanning: isRootScanning,
    error: scanRootError,
    lastFoundCount,
  } = useProjectScan()
  const AUDIO_EXTS = useMemo(
    () => new Set(['.mp3', '.wav', '.aiff', '.aif', '.m4a', '.flac']),
    [],
  )

  useEffect(() => {
    initPreviewPlayer()
    return subscribePreviewState(setPreviewState)
  }, [])

  useEffect(() => {
    if (!hasBridge) {
      setError('Studio Vaulted bridge is not available.')
      return
    }
    window.studioVaulted
      .listFolders()
      .then((folderList) => setFolders(folderList))
      .catch(() => setError('Failed to load folders.'))
  }, [hasBridge])

  useEffect(() => {
    if (!settings?.projectRootDir) {
      setFoldersSelection([])
      return
    }
    setFoldersSelection([settings.projectRootDir])
  }, [settings?.projectRootDir])

  useEffect(() => {
    if (!hasSettingsBridge || !settings?.projectRootDir || view.type !== 'all') return
    void scanRoot({ scanSubfolders: settings.scanSubfolders }).then((result) => {
      if (!result || result.error) return
      setTracks(result.tracks)
    })
  }, [hasSettingsBridge, scanRoot, settings?.projectRootDir, settings?.scanSubfolders, view.type])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const clearSelection = () => {
    setSelectedIds(new Set())
    setLastSelectedIndex(null)
  }

  useEffect(() => {
    if (!hasBridge) return
    const loadTracks = async () => {
      try {
        if (view.type === 'all') {
          setTracks(await window.studioVaulted.getTracks())
          clearSelection()
          return
        }
        if (view.type === 'trash') {
          setTracks(await window.studioVaulted.getTrashedTracks())
          clearSelection()
          return
        }
        if (view.type === 'folder') {
          setTracks(await window.studioVaulted.getTracksByFolder(view.id))
          clearSelection()
          return
        }
        if (view.type === 'settings') {
          clearSelection()
          return
        }
      } catch {
        setError('Failed to load tracks.')
      }
    }
    loadTracks()
  }, [view, hasBridge])

  useEffect(() => {
    if (!hasBridge || bpmDebugDone.current || !import.meta.env.DEV) return
    bpmDebugDone.current = true
    window.studioVaulted.debugComputeBpmForFileName('Walk.als').catch(() => undefined)
  }, [hasBridge])

  useEffect(() => {
    if (!hasBridge) return
    const unsubscribe = window.studioVaulted.onBpmUpdated(({ id, bpm }) => {
      setTracks((prev) =>
        prev.map((entry) => {
          if (!entry.latestVersion || entry.latestVersion.id !== id) return entry
          return {
            ...entry,
            latestVersion: {
              ...entry.latestVersion,
              bpm,
              bpmSource: 'als',
            },
          }
        }),
      )
      setVersionModal((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          versions: prev.versions.map((version) =>
            version.id === id ? { ...version, bpm, bpmSource: 'als' } : version,
          ),
        }
      })
    })
    return unsubscribe
  }, [hasBridge])

  useEffect(() => {
    const closeMenus = () => setOpenMenuTrackId(null)
    window.addEventListener('click', closeMenus)
    return () => window.removeEventListener('click', closeMenus)
  }, [])

  const folderOptions = useMemo(() => {
    return [{ id: '', name: 'No Folder' }, ...folders]
  }, [folders])

  const selectedFoldersLabel = useMemo(() => {
    if (foldersSelection.length === 0) return 'None'
    return foldersSelection
      .map((folder) => folder.split(/[/\\]/).pop() ?? folder)
      .join(', ')
  }, [foldersSelection])
  const projectRootOptions = useMemo(() => {
    if (settings?.recentProjectRoots && settings.recentProjectRoots.length > 0) {
      return settings.recentProjectRoots
    }
    if (settings?.projectRootDir) return [settings.projectRootDir]
    return foldersSelection
  }, [settings?.recentProjectRoots, settings?.projectRootDir, foldersSelection])

  const loadTemplates = async (mode: 'list' | 'refresh' = 'list') => {
    if (typeof window === 'undefined' || !window.templates) return
    setTemplatesLoading(true)
    try {
      const templates = mode === 'refresh' ? await window.templates.refresh() : await window.templates.list()
      setTemplateRecords(templates)
    } catch {
      setTemplateRecords([])
    } finally {
      setTemplatesLoading(false)
    }
  }

  const selectedCount = selectedIds.size
  const activeFolderId = view.type === 'folder' ? view.id : ''
  const formatFileName = (filePath: string) => filePath.split(/[/\\]/).pop() ?? filePath
  const getFileExtension = (filePath: string) => {
    const lower = filePath.toLowerCase()
    const extIndex = lower.lastIndexOf('.')
    return extIndex === -1 ? '' : lower.slice(extIndex)
  }
  const isPathInsideRoot = (filePath: string, root: string) => {
    const normalizedFile = filePath.replace(/\\/g, '/').toLowerCase()
    const normalizedRoot = root.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
    if (normalizedFile === normalizedRoot) return true
    return normalizedFile.startsWith(`${normalizedRoot}/`)
  }
  const hasAudioFileInDragEvent = (event: DragEvent<HTMLElement>) => {
    const transfer = event.dataTransfer
    if (!transfer) return false
    const items = Array.from(transfer.items ?? [])
    if (items.length > 0) {
      return items.some((item) => item.kind === 'file' && (item.type.startsWith('audio/') || item.type === ''))
    }
    const files = Array.from(transfer.files ?? [])
    return files.some((file) => AUDIO_EXTS.has(getFileExtension(file.name)))
  }
  const getDawLabel = (filePath: string | null | undefined) => {
    if (!filePath) return '—'
    const lower = filePath.toLowerCase()
    if (lower.endsWith('.als')) return 'Ableton'
    if (lower.endsWith('.flp')) return 'FL'
    if (lower.endsWith('.logicx')) return 'Logic'
    return '—'
  }
  const getPreviewPath = (entry: TrackWithLatest) => {
    return entry.track.audioPath ?? entry.latestVersion?.filePath ?? null
  }
  const isPreviewablePath = (filePath: string | null | undefined) => {
    if (!filePath) return false
    const lower = filePath.toLowerCase()
    const extIndex = lower.lastIndexOf('.')
    if (extIndex === -1) return false
    return AUDIO_EXTS.has(lower.slice(extIndex))
  }
  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
    const minutes = Math.floor(seconds / 60)
    const remainder = Math.floor(seconds % 60)
    return `${minutes}:${String(remainder).padStart(2, '0')}`
  }
  const renderPlayPauseIcon = (isPlaying: boolean) => {
    if (isPlaying) {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="4" width="5" height="16" rx="1.5" />
          <rect x="14" y="4" width="5" height="16" rx="1.5" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5.5v13l11-6.5-11-6.5z" />
      </svg>
    )
  }

  const currentPreviewTitle = useMemo(() => {
    if (!previewState.currentPath) return 'No preview selected'
    const match = tracks.find(
      (entry) =>
        entry.track.audioPath === previewState.currentPath ||
        entry.latestVersion?.filePath === previewState.currentPath,
    )
    return match?.track.title ?? formatFileName(previewState.currentPath)
  }, [previewState.currentPath, tracks])


  const displayedTracks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const bpmRange = filters.bpmPreset ? BPM_PRESETS.find((p) => p.id === filters.bpmPreset) : null
    const dateRange = filters.datePreset ? DATE_PRESETS.find((p) => p.id === filters.datePreset) : null
    const cutoffMs = dateRange ? Date.now() - dateRange.ms : null

    const filtered = tracks.filter((entry) => {
      const title = entry.track.title.toLowerCase()
      const bpm = entry.latestVersion?.bpm ?? null
      const savedAt = entry.latestVersion?.savedAt ?? 0
      if (query && !title.includes(query)) return false
      if (bpmRange && (bpm === null || bpm < bpmRange.min || bpm > bpmRange.max)) return false
      if (filters.status && entry.track.status !== filters.status) return false
      if (filters.genre && entry.track.genre !== filters.genre) return false
      if (cutoffMs !== null && savedAt < cutoffMs) return false
      return true
    })

    const grouped = new Map<string, TrackWithLatest[]>()
    for (const entry of filtered) {
      const key = entry.track.title.toLowerCase()
      const bucket = grouped.get(key) ?? []
      bucket.push(entry)
      grouped.set(key, bucket)
    }

    const deduped: TrackWithLatest[] = []
    for (const bucket of grouped.values()) {
      if (bucket.length === 1) {
        deduped.push(bucket[0])
        continue
      }
      const maxVersions = Math.max(...bucket.map((entry) => entry.versionCount))
      if (maxVersions <= 1) {
        bucket.sort((a, b) => {
          const aSaved = a.latestVersion?.savedAt ?? 0
          const bSaved = b.latestVersion?.savedAt ?? 0
          return bSaved - aSaved
        })
        deduped.push(bucket[0])
        continue
      }
      const candidates = bucket.filter((entry) => entry.versionCount === maxVersions)
      candidates.sort((a, b) => {
        const aSaved = a.latestVersion?.savedAt ?? 0
        const bSaved = b.latestVersion?.savedAt ?? 0
        return bSaved - aSaved
      })
      deduped.push(candidates[0])
    }

    const sorted = [...deduped]
    const direction = sort.direction === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      if (sort.key === 'title') {
        return a.track.title.localeCompare(b.track.title) * direction
      }
      if (sort.key === 'bpm') {
        const aBpm = a.latestVersion?.bpm ?? null
        const bBpm = b.latestVersion?.bpm ?? null
        if (aBpm === null && bBpm === null) return 0
        if (aBpm === null) return 1
        if (bBpm === null) return -1
        return (aBpm - bBpm) * direction
      }
      const aSaved = a.latestVersion?.savedAt ?? 0
      const bSaved = b.latestVersion?.savedAt ?? 0
      return (aSaved - bSaved) * direction
    })
    return sorted
  }, [tracks, searchQuery, filters, sort])

  const currentPreviewIndex = useMemo(() => {
    if (!previewState.currentPath) return -1
    return displayedTracks.findIndex((entry) => {
      const path = getPreviewPath(entry)
      return path === previewState.currentPath
    })
  }, [displayedTracks, previewState.currentPath])

  const hasPreviewableTrack = displayedTracks.some((entry) =>
    isPreviewablePath(getPreviewPath(entry)),
  )

  const isBpmComputing = useMemo(() => {
    return displayedTracks.some((entry) => {
      const filePath = entry.latestVersion?.filePath ?? ''
      return filePath.toLowerCase().endsWith('.als') && entry.latestVersion?.bpm === null
    })
  }, [displayedTracks])


  const handlePickFolders = async () => {
    setError(null)
    if (!hasSettingsBridge) return
    setIsScanning(true)
    try {
      const picked = await window.settings.chooseDirectory()
      if (!picked) return
      const nextSettings = await updateSettings({ projectRootDir: picked })
      if (!nextSettings) {
        setError('Failed to save Project Root Folder.')
        return
      }
      setFoldersSelection([picked])
      const result = await scanRoot({
        root: picked,
        scanSubfolders: nextSettings.scanSubfolders,
      })
      if (!result || result.error) {
        setError(getScanErrorMessage(result?.error) ?? 'Scan failed. Check folder access and try again.')
        return
      }
      setTracks(result.tracks)
      setView({ type: 'all' })
      setToast(`Found ${result.found} projects`)
    } finally {
      setIsScanning(false)
    }
  }

  const handleScan = async () => {
    setError(null)
    if (!hasSettingsBridge) return
    if (!settings?.projectRootDir) {
      setError('Set a Project Root Folder before rescanning.')
      return
    }
    setIsScanning(true)
    try {
      const result = await scanRoot({
        root: settings.projectRootDir,
        scanSubfolders: settings.scanSubfolders,
      })
      if (!result || result.error) {
        setError(getScanErrorMessage(result?.error) ?? 'Scan failed. Check folder access and try again.')
        return
      }
      setTracks(result.tracks)
      setView({ type: 'all' })
      setToast(`Found ${result.found} projects`)
      await refreshSettings()
    } finally {
      setIsScanning(false)
    }
  }

  const handleRowClick = (id: string, index: number, event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('input, select, button, a, textarea, label')) {
      return
    }

    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      const rangeIds = displayedTracks
        .slice(start, end + 1)
        .map((entry) => entry.track.id)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        rangeIds.forEach((rangeId) => next.add(rangeId))
        return next
      })
      setLastSelectedIndex(index)
      return
    }

    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    setLastSelectedIndex(index)
  }

  const handleBulkMoveFolder = async () => {
    if (!hasBridge || selectedIds.size === 0) return
    const resolved = bulkFolderId === '' ? null : bulkFolderId
    const ids = Array.from(selectedIds)
    setTracks((prev) =>
      prev.map((entry) =>
        selectedIds.has(entry.track.id)
          ? { ...entry, track: { ...entry.track, folderId: resolved } }
          : entry,
      ),
    )
    await Promise.all(ids.map((id) => window.studioVaulted.setTrackFolder(id, resolved)))
    if (view.type === 'folder' && resolved !== view.id) {
      setTracks((prev) => prev.filter((entry) => !selectedIds.has(entry.track.id)))
    }
    clearSelection()
    setBulkFolderId('')
  }

  const toggleCheckbox = (id: string, index: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    setLastSelectedIndex(index)
  }

  const handleNewFolder = () => {
    setModal({ kind: 'folderCreate', name: '' })
  }

  const handleStartProject = async () => {
    if (!hasBridge || !hasSettingsBridge) return
    setError(null)
    setProjectCreateError(null)
    let roots = settings?.recentProjectRoots ?? []
    if (roots.length === 0 && settings?.projectRootDir) {
      roots = [settings.projectRootDir]
    }
    if (roots.length === 0) {
      const picked = await window.settings.chooseDirectory()
      if (picked) {
        const next = await updateSettings({ projectRootDir: picked })
        roots = next?.recentProjectRoots ?? [picked]
      }
    }
    if (roots.length === 0) {
      setError('Set a Project Root Folder before creating a new project.')
      return
    }
    setProjectCreateForm({
      projectName: '',
      saveTo: roots[0],
      dawFormat: 'als',
      folderId: '',
      initialStatus: 'Idea',
      creationMode: 'blank',
      selectedTemplatePath: settings?.newProjectDefaults.lastUsedTemplatePath ?? null,
      selectedTemplateName: null,
      createStandardFolders: settings?.newProjectDefaults.createStandardFolders ?? true,
      openAfterCreate: settings?.newProjectDefaults.openAfterCreate ?? false,
      rememberRecentTemplate: true,
      saveAsDefaults: false,
      projectTypeLabel: '',
    })
    setModal({ kind: 'projectCreate' })
    await loadTemplates('list')
  }

  const handleRenameFolder = (id: string) => {
    const folder = folders.find((item) => item.id === id)
    setModal({ kind: 'folderRename', id, name: folder?.name ?? '' })
  }

  const handleDeleteFolder = async (id: string) => {
    if (!hasBridge) return
    const confirmDelete = window.confirm('Delete this folder? Tracks will be unassigned.')
    if (!confirmDelete) return
    setFolders(await window.studioVaulted.deleteFolder(id))
    if (view.type === 'folder' && view.id === id) {
      setView({ type: 'all' })
    }
  }

  const handleUpdateFolder = async (id: string, folderId: string) => {
    if (!hasBridge) return
    const resolved = folderId === '' ? null : folderId
    setTracks((prev) =>
      prev.map((entry) =>
        entry.track.id === id
          ? { ...entry, track: { ...entry.track, folderId: resolved } }
          : entry,
      ),
    )
    await window.studioVaulted.setTrackFolder(id, resolved)
    if (view.type === 'folder' && resolved !== view.id) {
      setTracks((prev) => prev.filter((entry) => entry.track.id !== id))
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    if (!hasBridge) return
    setTracks((prev) =>
      prev.map((entry) =>
        entry.track.id === id ? { ...entry, track: { ...entry.track, status } } : entry,
      ),
    )
    await window.studioVaulted.setTrackStatus(id, status)
  }

  const handleUpdateGenre = async (id: string, genre: string) => {
    if (!hasBridge) return
    const value = genre === '' ? null : genre
    setTracks((prev) =>
      prev.map((entry) =>
        entry.track.id === id ? { ...entry, track: { ...entry.track, genre: value } } : entry,
      ),
    )
    await window.studioVaulted.setTrackGenre(id, value)
  }

  const handleAssignAudio = async (trackId: string) => {
    if (!hasBridge) return
    const result = await window.studioVaulted.pickAudioFile()
    if (!result.path) {
      if (result.reason === 'outside-roots') {
        setError('Audio file must be inside your configured Project Root Folder.')
      }
      return
    }
    setTracks((prev) =>
      prev.map((entry) =>
        entry.track.id === trackId
          ? { ...entry, track: { ...entry.track, audioPath: result.path } }
          : entry,
      ),
    )
    await window.studioVaulted.setTrackAudioPath(trackId, result.path)
  }

  const handleTrackDragOver = (trackId: string, event: DragEvent<HTMLElement>) => {
    if (view.type === 'trash') return
    if (!hasAudioFileInDragEvent(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    if (dragOverTrackId !== trackId) {
      setDragOverTrackId(trackId)
    }
  }

  const handleTrackDragLeave = (trackId: string, event: DragEvent<HTMLElement>) => {
    if (dragOverTrackId !== trackId) return
    const currentTarget = event.currentTarget
    const relatedTarget = event.relatedTarget as Node | null
    if (relatedTarget && currentTarget.contains(relatedTarget)) return
    setDragOverTrackId(null)
  }

  const handleTrackDrop = async (trackId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOverTrackId(null)
    if (!hasBridge || view.type === 'trash') return

    const files = Array.from(event.dataTransfer?.files ?? [])
    const droppedAudioFile = files.find((file) => {
      const absPath = (file as File & { path?: string }).path ?? file.name
      return AUDIO_EXTS.has(getFileExtension(absPath))
    })
    if (!droppedAudioFile) {
      setError('Drop an audio file (.mp3, .wav, .aiff, .aif, .m4a, .flac).')
      return
    }

    const audioPath = (droppedAudioFile as File & { path?: string }).path
    if (!audioPath) {
      setError('Could not read dropped file path.')
      return
    }

    if (settings?.projectRootDir && !isPathInsideRoot(audioPath, settings.projectRootDir)) {
      setError('Audio file must be inside your configured Project Root Folder.')
      return
    }

    setTracks((prev) =>
      prev.map((entry) =>
        entry.track.id === trackId
          ? { ...entry, track: { ...entry.track, audioPath } }
          : entry,
      ),
    )
    await window.studioVaulted.setTrackAudioPath(trackId, audioPath)
  }

  const handleOpenProject = async (entry: TrackWithLatest) => {
    if (!hasBridge) return
    const filePath = entry.latestVersion?.filePath
    if (!filePath) return
    await window.studioVaulted.openProjectPath(filePath)
  }

  const handleRevealProject = async (entry: TrackWithLatest) => {
    if (!hasBridge) return
    const filePath = entry.latestVersion?.filePath
    if (!filePath) return
    await window.studioVaulted.revealProjectPath(filePath)
  }

  const findPreviewPath = (startIndex: number, direction: 1 | -1) => {
    if (displayedTracks.length === 0) return null
    let index = startIndex
    while (index >= 0 && index < displayedTracks.length) {
      const candidate = displayedTracks[index]
      const path = getPreviewPath(candidate)
      if (isPreviewablePath(path)) {
        return path
      }
      index += direction
    }
    return null
  }

  const handlePrevTrack = () => {
    if (displayedTracks.length === 0) return
    const start = currentPreviewIndex === -1 ? displayedTracks.length - 1 : currentPreviewIndex - 1
    const path = findPreviewPath(start, -1)
    if (path) {
      void playPreview(path)
    }
  }

  const handleNextTrack = () => {
    if (displayedTracks.length === 0) return
    const start = currentPreviewIndex === -1 ? 0 : currentPreviewIndex + 1
    const path = findPreviewPath(start, 1)
    if (path) {
      void playPreview(path)
    }
  }

  const handleTrashTrack = async (id: string) => {
    if (!hasBridge) return
    await window.studioVaulted.moveToTrash([id])
    if (view.type === 'trash') {
      setTracks(await window.studioVaulted.getTrashedTracks())
    } else {
      setTracks((prev) => prev.filter((entry) => entry.track.id !== id))
    }
  }

  const handleBulkTrash = async () => {
    if (!hasBridge || selectedIds.size === 0) return
    await window.studioVaulted.moveToTrash(Array.from(selectedIds))
    if (view.type === 'trash') {
      setTracks(await window.studioVaulted.getTrashedTracks())
    } else {
      setTracks((prev) => prev.filter((entry) => !selectedIds.has(entry.track.id)))
    }
    clearSelection()
  }

  const handleBulkRestore = async () => {
    if (!hasBridge || selectedIds.size === 0) return
    await window.studioVaulted.restoreTracks(Array.from(selectedIds))
    setTracks(await window.studioVaulted.getTrashedTracks())
    clearSelection()
  }

  const handleRestoreTrack = async (id: string) => {
    if (!hasBridge) return
    await window.studioVaulted.restoreTracks([id])
    setTracks(await window.studioVaulted.getTrashedTracks())
  }

  const handleOpenVersions = async (entry: TrackWithLatest) => {
    if (!hasBridge) return
    const versions = await window.studioVaulted.listTrackVersions(entry.track.id)
    setVersionModal({ trackId: entry.track.id, title: entry.track.title, versions })
  }

  const handleOpenNote = async (entry: TrackWithLatest) => {
    if (!window.notes) return
    setError(null)
    try {
      const existing = await window.notes.getByTrackId(entry.track.id)
      const result = existing ?? (await window.notes.createForTrack(entry.track.id))
      if (result) {
        setTracks((prev) =>
          prev.map((item) =>
            item.track.id === entry.track.id
              ? {
                  ...item,
                  track: {
                    ...item.track,
                    noteId: result.note.id,
                    notePreview: result.note.plainTextPreview || null,
                  },
                }
              : item,
          ),
        )
      }
      setNoteModal({
        trackId: entry.track.id,
        trackTitle: entry.track.title,
      })
    } catch {
      setError('Failed to open note.')
    }
  }

  const handleSetLatestVersion = async (trackId: string, versionId: string) => {
    if (!hasBridge) return
    const updated = await window.studioVaulted.setLatestVersion(trackId, versionId)
    if (updated) {
      setTracks((prev) =>
        prev.map((entry) => (entry.track.id === trackId ? updated : entry)),
      )
      setVersionModal((prev) => (prev ? { ...prev } : prev))
    }
  }

  const closeModal = () => {
    setModal(null)
    setProjectCreateError(null)
    setIsCreatingProject(false)
    setProjectCreateForm(null)
  }

  const submitModal = async () => {
    if (!modal || !hasBridge) return
    setError(null)
    try {
      if (modal.kind === 'folderCreate') {
        const name = modal.name.trim()
        if (!name) return
        setFolders(await window.studioVaulted.createFolder(name))
      }
      if (modal.kind === 'folderRename') {
        const name = modal.name.trim()
        if (!name) return
        setFolders(await window.studioVaulted.renameFolder(modal.id, name))
      }
      closeModal()
    } catch {
      setError('Action failed. Please try again.')
    }
  }

  const refreshTracksForCurrentView = async () => {
    if (!hasBridge) return
    if (view.type === 'all') {
      setTracks(await window.studioVaulted.getTracks())
      return
    }
    if (view.type === 'trash') {
      setTracks(await window.studioVaulted.getTrashedTracks())
      return
    }
    if (view.type === 'folder') {
      setTracks(await window.studioVaulted.getTracksByFolder(view.id))
      return
    }
    setTracks(await window.studioVaulted.getTracks())
  }

  const submitProjectCreate = async () => {
    if (!projectCreateForm || !window.projects) return
    setProjectCreateError(null)
    setIsCreatingProject(true)
    try {
      const response = await window.projects.create({
        projectName: projectCreateForm.projectName,
        saveTo: projectCreateForm.saveTo,
        dawFormat: projectCreateForm.dawFormat,
        folderId: projectCreateForm.folderId ?? null,
        initialStatus: projectCreateForm.initialStatus,
        templateOptions: {
          mode: projectCreateForm.creationMode,
          templatePath: projectCreateForm.selectedTemplatePath ?? null,
          templateDisplayName: projectCreateForm.selectedTemplateName ?? null,
          createStandardFolders: projectCreateForm.createStandardFolders,
          openAfterCreate: projectCreateForm.openAfterCreate,
          rememberRecentTemplate: projectCreateForm.rememberRecentTemplate,
          saveAsDefaults: projectCreateForm.saveAsDefaults,
          projectTypeLabel: projectCreateForm.projectTypeLabel ?? null,
          future: {},
        },
      })

      if (!response.ok || !response.result) {
        if (response.createdOnDisk) {
          setProjectCreateError(response.error ?? 'Project created on disk but failed to sync library.')
          return
        }
        setProjectCreateError(response.error ?? 'Failed to create project.')
        return
      }
      await refreshTracksForCurrentView()
      setToast('Project created successfully.')
      closeModal()
    } catch {
      setProjectCreateError('Action failed. Please try again.')
    } finally {
      setIsCreatingProject(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="brand">
          <img src={logo} alt="Studio Vaulted logo" />
          Studio Vaulted
        </h1>

        <div className="nav-section">
          <div className="section-header">
            <h2>Folders</h2>
            <button onClick={handleNewFolder}>New</button>
          </div>
          <select
            value={activeFolderId}
            onChange={(event) => {
              const nextId = event.target.value
              if (nextId === '') {
                setView({ type: 'all' })
                return
              }
              setView({ type: 'folder', id: nextId })
            }}
          >
            <option value="">All Tracks</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <div className="row-actions">
            <button
              onClick={() => {
                if (!activeFolderId) return
                handleRenameFolder(activeFolderId)
              }}
              disabled={!activeFolderId}
            >
              Rename
            </button>
            <button
              onClick={() => {
                if (!activeFolderId) return
                handleDeleteFolder(activeFolderId)
              }}
              disabled={!activeFolderId}
            >
              Delete
            </button>
          </div>
        </div>

        <nav className="nav-section">
          <button
            className={view.type === 'all' ? 'active' : ''}
            onClick={() => setView({ type: 'all' })}
          >
            All Tracks
          </button>
          <button
            className={view.type === 'trash' ? 'active' : ''}
            onClick={() => setView({ type: 'trash' })}
          >
            Trash
          </button>
          <button
            className={view.type === 'settings' ? 'active' : ''}
            onClick={() => setView({ type: 'settings' })}
          >
            Settings
          </button>
        </nav>

        <div className="sidebar-actions">
          <div className="folder-picker-group">
            <button onClick={handlePickFolders} disabled={isScanning}>
              {isScanning ? 'Scanning...' : 'Pick + Scan Folders'}
            </button>
            <div className="selected-folders">
              <span>Project root:</span>
              <strong>{settings?.projectRootDir ?? selectedFoldersLabel}</strong>
            </div>
          </div>
          <button
            onClick={handleScan}
            disabled={isScanning || !settings?.projectRootDir}
          >
            {isScanning ? 'Scanning...' : 'Rescan Root'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <PlanBadge />
      </aside>

      <main className="content">
        <header className="content-header">
          <div>
            <h2>
              {view.type === 'all'
                ? 'All Tracks'
                : view.type === 'trash'
                  ? 'Trash'
                  : view.type === 'folder'
                    ? 'Folder'
                    : view.type === 'settings'
                      ? 'Settings'
                    : 'Tracks'}
            </h2>
            <p>
              {view.type === 'settings'
                ? 'Manage your default project folder and scan behavior.'
                : `${displayedTracks.length} tracks`}
            </p>
          </div>
          {view.type !== 'settings' && (
            <div className="search-box">
              <span className="search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M10.5 4a6.5 6.5 0 1 0 4.09 11.55l4.43 4.43 1.41-1.41-4.43-4.43A6.5 6.5 0 0 0 10.5 4Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" />
                </svg>
              </span>
              <input
                type="search"
                placeholder="Search projects, BPM, DAW..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          )}
          {view.type !== 'settings' && (
            <button className="start-project-button" onClick={handleStartProject}>
              Start New Project
            </button>
          )}
          {view.type !== 'settings' && isBpmComputing && <div className="bpm-status">BPM is computing…</div>}
          {view.type !== 'settings' && selectedCount > 0 && (
            <div className="bulk-bar">
              {view.type === 'trash' ? (
                <button onClick={handleBulkRestore}>Restore</button>
              ) : (
                <>
                  <button onClick={handleBulkTrash}>Move to Trash</button>
                  <div className="bulk-move">
                    <select
                      value={bulkFolderId}
                      onChange={(event) => setBulkFolderId(event.target.value)}
                    >
                      {folderOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className={`ghost ${bulkFolderId ? 'highlight' : ''}`}
                      onClick={handleBulkMoveFolder}
                      disabled={bulkFolderId === ''}
                    >
                      Move
                    </button>
                  </div>
                </>
              )}
              <button onClick={clearSelection}>Clear selection</button>
            </div>
          )}
        </header>
        {toast && <div className="toast-banner">{toast}</div>}

        {view.type === 'settings' ? (
          <div className="settings-page">
            <ProjectRootSettingCard
              projectRootDir={settings?.projectRootDir ?? null}
              onChooseFolder={handlePickFolders}
              onReset={async () => {
                const next = await updateSettings({
                  projectRootDir: null,
                  lastScanAt: null,
                })
                if (next) {
                  setFoldersSelection([])
                  setToast('Project root reset.')
                }
              }}
              isBusy={isScanning || isSettingsLoading || isRootScanning}
            />
            <ScanOptionsCard
              scanSubfolders={settings?.scanSubfolders ?? true}
              onToggleSubfolders={(next) => {
                void updateSettings({ scanSubfolders: next })
              }}
              onRescan={handleScan}
              isScanning={isScanning || isRootScanning}
              lastScanAt={settings?.lastScanAt ?? null}
              lastFoundCount={lastFoundCount}
            />
            <LicenseSettingsCard />
            {(settingsError || scanRootError) && (
              <p className="error">{settingsError ?? scanRootError}</p>
            )}
          </div>
        ) : (
          <>
        {/* ── Filter bar ── */}
        {(() => {
          const activeCount =
            (filters.bpmPreset ? 1 : 0) +
            (filters.status ? 1 : 0) +
            (filters.genre ? 1 : 0) +
            (filters.datePreset ? 1 : 0)
          return (
            <div className="filter-bar">
              <label className="filter-select-group">
                <span className="filter-select-label">BPM</span>
                <select
                  value={filters.bpmPreset}
                  onChange={(e) => setFilters((prev) => ({ ...prev, bpmPreset: e.target.value }))}
                >
                  <option value="">All</option>
                  {BPM_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>

              <div className="filter-select-group">
                <span className="filter-select-label">Status</span>
                <div className="filter-status-pills">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      className={`filter-status-pill filter-status-pill--${s.toLowerCase()} ${filters.status === s ? 'active' : ''}`}
                      onClick={() => setFilters((prev) => ({ ...prev, status: prev.status === s ? '' : s }))}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <label className="filter-select-group">
                <span className="filter-select-label">Genre</span>
                <select
                  value={filters.genre}
                  onChange={(e) => setFilters((prev) => ({ ...prev, genre: e.target.value }))}
                >
                  <option value="">All</option>
                  {GENRE_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.genres.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="filter-select-group">
                <span className="filter-select-label">Modified</span>
                <select
                  value={filters.datePreset}
                  onChange={(e) => setFilters((prev) => ({ ...prev, datePreset: e.target.value }))}
                >
                  <option value="">Any time</option>
                  {DATE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>

              <div className="filter-bar-spacer" />

              <label className="filter-select-group">
                <span className="filter-select-label">Sort</span>
                <div className="filter-sort-control">
                  <select
                    value={sort.key}
                    onChange={(e) => setSort((prev) => ({ ...prev, key: e.target.value as SortKey }))}
                  >
                    <option value="savedAt">Last Saved</option>
                    <option value="title">Name</option>
                    <option value="bpm">BPM</option>
                  </select>
                  <button
                    className="filter-sort-dir"
                    onClick={() =>
                      setSort((prev) => ({
                        ...prev,
                        direction: prev.direction === 'asc' ? 'desc' : 'asc',
                      }))
                    }
                    title={sort.direction === 'asc' ? 'Ascending' : 'Descending'}
                  >
                    {sort.direction === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </label>

              {activeCount > 0 && (
                <button
                  className="filter-clear"
                  onClick={() => setFilters({ bpmPreset: '', status: '', genre: '', datePreset: '' })}
                >
                  Clear {activeCount}
                </button>
              )}
            </div>
          )
        })()}

        <div className="tracks-grid">
          {view.type === 'all' && !settings?.projectRootDir ? (
            <div className="empty-grid">
              <p className="empty-state-title">
                Set your Project Root Folder to automatically find your Ableton projects.
              </p>
              <div className="empty-state-actions">
                <button className="ghost" onClick={handlePickFolders}>
                  Choose Folder
                </button>
                <button className="ghost" onClick={() => setView({ type: 'settings' })}>
                  Go to Settings
                </button>
              </div>
            </div>
          ) : displayedTracks.length === 0 ? (
            <div className="empty-grid">No tracks to display.</div>
          ) : (
            displayedTracks.map((entry, index) => {
              const previewPath = getPreviewPath(entry)
              const isPreviewable = isPreviewablePath(previewPath)
              const statusClass =
                entry.track.status === 'Finished'
                  ? 'finished'
                  : entry.track.status === 'Potential'
                    ? 'potential'
                    : entry.track.status === 'Idea'
                      ? 'idea'
                      : 'trashed'
              return (
                <article
                  key={entry.track.id}
                  className={`track-card ${selectedIds.has(entry.track.id) ? 'selected' : ''} ${dragOverTrackId === entry.track.id ? 'drag-over' : ''}`}
                  onClick={(event) => handleRowClick(entry.track.id, index, event)}
                  onDragOver={(event) => handleTrackDragOver(entry.track.id, event)}
                  onDragLeave={(event) => handleTrackDragLeave(entry.track.id, event)}
                  onDrop={(event) => void handleTrackDrop(entry.track.id, event)}
                >
                  <div className="track-card-top">
                    <label className="track-card-check">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(entry.track.id)}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleCheckbox(entry.track.id, index)
                        }}
                        readOnly
                      />
                    </label>
                    {view.type === 'trash' ? (
                      <div className="track-card-status trashed">Trashed</div>
                    ) : (
                      <div className="track-card-status-wrap">
                        <select
                          className={`track-card-status track-card-status-select ${statusClass}`}
                          value={entry.track.status}
                          onChange={(event) =>
                            handleUpdateStatus(entry.track.id, event.target.value)
                          }
                          onClick={(event) => event.stopPropagation()}
                        >
                          <option value="Idea">Idea</option>
                          <option value="Potential">Potential</option>
                          <option value="Finished">Finished</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="track-card-title-row">
                    <div className="track-title-group">
                      <h3>{entry.track.title}</h3>
                      {entry.track.noteId ? <span className="note-badge">Note</span> : null}
                    </div>
                    <div className="kebab-menu">
                      <button
                        className="kebab-trigger"
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenMenuTrackId((prev) => (prev === entry.track.id ? null : entry.track.id))
                        }}
                        aria-label="More actions"
                      >
                        ⋮
                      </button>
                      {openMenuTrackId === entry.track.id && (
                        <div className="kebab-dropdown" onClick={(event) => event.stopPropagation()}>
                          <button onClick={() => handleOpenVersions(entry)}>Versions</button>
                          <button onClick={() => handleRevealProject(entry)}>Show in Folder</button>
                          {view.type === 'trash' ? (
                            <button onClick={() => handleRestoreTrack(entry.track.id)}>Restore</button>
                          ) : (
                            <button onClick={() => handleTrashTrack(entry.track.id)}>Trash</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {entry.track.notePreview ? (
                    <div className="track-note-preview">{entry.track.notePreview}</div>
                  ) : null}

                  <div className="track-meta">
                    <span>{getDawLabel(entry.latestVersion?.filePath)}</span>
                    <span>{entry.latestVersion?.bpm ?? '—'} BPM</span>
                    <span>{entry.versionCount} version{entry.versionCount === 1 ? '' : 's'}</span>
                  </div>

                  <div className="preview-actions">
                    {isPreviewable ? (
                      <button
                        className="play-button"
                        onClick={(event) => {
                          event.stopPropagation()
                          if (!previewPath) return
                          togglePreview(previewPath)
                        }}
                        aria-label={
                          previewState.currentPath === previewPath && previewState.isPlaying
                            ? 'Pause preview'
                            : 'Play preview'
                        }
                      >
                        {renderPlayPauseIcon(
                          previewState.currentPath === previewPath && previewState.isPlaying,
                        )}
                      </button>
                    ) : (
                      <span className="muted">No preview audio</span>
                    )}
                    <button
                      className="ghost"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleAssignAudio(entry.track.id)
                      }}
                    >
                      {entry.track.audioPath ? 'Change Audio' : 'Assign Audio'}
                    </button>
                  </div>

                  <div className="track-edit-row">
                    <select
                      value={entry.track.folderId ?? ''}
                      onChange={(event) => handleUpdateFolder(entry.track.id, event.target.value)}
                      disabled={view.type === 'trash'}
                    >
                      {folderOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={entry.track.genre ?? ''}
                      onChange={(event) => handleUpdateGenre(entry.track.id, event.target.value)}
                      disabled={view.type === 'trash'}
                    >
                      <option value="">— Genre —</option>
                      {GENRE_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.genres.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="track-card-footer">
                    <span>
                      {entry.latestVersion ? new Date(entry.latestVersion.savedAt).toLocaleString() : '—'}
                    </span>
                    <div className="track-card-actions">
                      {view.type === 'trash' ? (
                        <button className="ghost" onClick={() => handleRestoreTrack(entry.track.id)}>
                          Restore
                        </button>
                      ) : (
                        <>
                          <button className="ghost" onClick={() => handleOpenNote(entry)}>
                            {entry.track.noteId ? 'Open Note' : 'Add Note'}
                          </button>
                          <button className="ghost" onClick={() => handleOpenProject(entry)}>
                            Open Project
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
          </>
        )}

        {view.type !== 'settings' && (
        <footer className="footer-player">
          <div className="player-track">
            <strong>{currentPreviewTitle}</strong>
            {previewState.error && <span className="player-error">{previewState.error}</span>}
          </div>
          <div className="player-controls">
            <button
              className="ghost"
              disabled={!hasPreviewableTrack}
              onClick={handlePrevTrack}
            >
              Prev
            </button>
            <button
              className="ghost"
              disabled={!previewState.currentPath}
              onClick={() => seekTo(previewState.currentTime - 10)}
            >
              -10s
            </button>
            <button
              className="play-button"
              disabled={!previewState.currentPath}
              onClick={() => {
                if (!previewState.currentPath) return
                if (previewState.isPlaying) {
                  pausePreview()
                } else {
                  togglePreview(previewState.currentPath)
                }
              }}
              aria-label={previewState.isPlaying ? 'Pause preview' : 'Play preview'}
            >
              {renderPlayPauseIcon(previewState.isPlaying)}
            </button>
            <button
              className="ghost"
              disabled={!previewState.currentPath}
              onClick={() => seekTo(previewState.currentTime + 10)}
            >
              +10s
            </button>
            <button
              className="ghost"
              disabled={!hasPreviewableTrack}
              onClick={handleNextTrack}
            >
              Next
            </button>
            <button
              className="ghost"
              disabled={!previewState.currentPath}
              onClick={() => {
                if (!previewState.currentPath) return
                playPreviewSnippet(previewState.currentPath, 0, 20)
              }}
            >
              Preview 20s
            </button>
          </div>
          <div className="player-scrubber">
            <input
              type="range"
              min={0}
              max={previewState.duration || 0}
              step={0.1}
              value={previewState.currentTime}
              onChange={(event) => seekTo(Number(event.target.value))}
              disabled={!previewState.currentPath || !previewState.duration}
            />
            <div className="player-time">
              <span>{formatTime(previewState.currentTime)}</span>
              <span>{formatTime(previewState.duration)}</span>
            </div>
          </div>
        </footer>
        )}
      </main>
      {modal && modal.kind !== 'projectCreate' && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            {modal.kind === 'folderCreate' && <h3>New Folder</h3>}
            {modal.kind === 'folderRename' && <h3>Rename Folder</h3>}

            {(modal.kind === 'folderCreate' || modal.kind === 'folderRename') && (
              <label>
                Name
                <input
                  type="text"
                  value={modal.name}
                  onChange={(event) =>
                    setModal({ ...modal, name: event.target.value })
                  }
                />
              </label>
            )}
            <div className="modal-actions">
              <button onClick={closeModal}>Cancel</button>
              <button className="primary" onClick={submitModal}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {modal?.kind === 'projectCreate' && projectCreateForm && (
        <StartNewProjectModal
          value={projectCreateForm}
          projectRootOptions={projectRootOptions}
          folderOptions={folderOptions}
          templates={templateRecords}
          templatesLoading={templatesLoading}
          onChange={setProjectCreateForm}
          onCancel={closeModal}
          onSubmit={submitProjectCreate}
          onChooseSaveDirectory={async () => {
            const picked = await window.projects?.chooseSaveDirectory()
            if (!picked) return
            setProjectCreateForm((prev) => (prev ? { ...prev, saveTo: picked } : prev))
          }}
          onRefreshTemplates={async () => {
            await loadTemplates('refresh')
          }}
          onChooseTemplateFolder={async () => {
            const picked = await window.templates?.chooseFolder()
            if (!picked) return
            const nextRoots = Array.from(
              new Set([...(settings?.templateRootDirs ?? []), picked]),
            )
            await updateSettings({ templateRootDirs: nextRoots })
            await loadTemplates('refresh')
          }}
          onOpenSettings={() => {
            setView({ type: 'settings' })
            closeModal()
          }}
          submitting={isCreatingProject}
          error={projectCreateError}
        />
      )}
      {versionModal && (
        <div className="modal-backdrop" onClick={() => setVersionModal(null)}>
          <div
            className="modal-card version-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Version History</h3>
            <p>{versionModal.title}</p>
            <div className="version-list">
              {versionModal.versions.length === 0 ? (
                <p>No versions found.</p>
              ) : (
                versionModal.versions.map((version) => (
                  <div key={version.id} className="version-row">
                    <div>
                      <strong>{formatFileName(version.filePath)}</strong>
                      <div className="version-meta">
                        {new Date(version.savedAt).toLocaleString()}
                      </div>
                      <div className="version-path">{version.filePath}</div>
                    </div>
                    <div className="version-actions">
                      <button
                        onClick={() => handleSetLatestVersion(versionModal.trackId, version.id)}
                      >
                        Set as Current
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button onClick={() => setVersionModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {noteModal && (
        <TrackNoteModal
          trackId={noteModal.trackId}
          trackTitle={noteModal.trackTitle}
          onClose={() => setNoteModal(null)}
          onSaved={(preview) => {
            setTracks((prev) =>
              prev.map((entry) =>
                entry.track.id === noteModal.trackId
                  ? {
                      ...entry,
                      track: {
                        ...entry.track,
                        noteId: entry.track.noteId ?? null,
                        notePreview: preview || null,
                      },
                    }
                  : entry,
              ),
            )
          }}
        />
      )}
    </div>
  )
}

export default App
