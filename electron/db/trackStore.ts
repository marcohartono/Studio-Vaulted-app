import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { getDb, initDatabase } from './sqlite'
import { computeDisplayTitle, computeGroupKey, parseAbletonVersionFile } from '../scan/trackGrouping'
import { extractBpmFromAls } from '../../src/main/ableton/parseAlsTempo'
import type { ScanFileHit } from '../scan/scanForProjects'

function getDawFormatFromPath(filePath: unknown): 'als' | 'flp' | 'ptx' {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) return 'als'
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.flp') return 'flp'
  if (ext === '.ptx') return 'ptx'
  return 'als'
}

export interface LogicalTrack {
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
  backgroundImagePath: string | null
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

export interface TrackVersion {
  id: string
  trackId: string
  filePath: string
  savedAt: number
  fileSize: number
  bpm: number | null
  bpmSource: string
  createdAt: number
}

export interface TrackWithLatest {
  track: LogicalTrack
  latestVersion: TrackVersion | null
  versionCount: number
}

export interface CreateProjectDbInput {
  projectId: string
  projectName: string
  rootPath: string
  dawProjectPath: string
  dawFormat: 'als' | 'flp' | 'ptx'
  folderId: string | null
  status: string
  creationMode: 'blank' | 'template'
  sourceTemplatePath: string | null
  sourceTemplateName: string | null
  projectTypeLabel: string | null
  fileSize: number
  savedAt: number
}

function toLogicalTrack(row: Record<string, unknown>): LogicalTrack {
  return {
    id: row.id as string,
    groupKey: row.group_key as string,
    title: row.title as string,
    latestVersionId: (row.latest_version_id as string | null) ?? null,
    rootPath: (row.root_path as string | null) ?? null,
    abletonProjectPath: (row.ableton_project_path as string | null) ?? null,
    dawFormat: ((row.daw_format as string | null) ?? 'als') as 'als' | 'flp' | 'ptx',
    creationMode: ((row.creation_mode as string | null) ?? 'blank') as 'blank' | 'template',
    sourceTemplatePath: (row.source_template_path as string | null) ?? null,
    sourceTemplateName: (row.source_template_name as string | null) ?? null,
    projectTypeLabel: (row.project_type_label as string | null) ?? null,
    audioPath: (row.audio_path as string | null) ?? null,
    backgroundImagePath: (row.background_image_path as string | null) ?? null,
    folderId: (row.folder_id as string | null) ?? null,
    status: (row.status as string | null) ?? 'Idea',
    genre: (row.genre as string | null) ?? null,
    notes: (row.notes as string | null) ?? '',
    noteId: (row.note_id as string | null) ?? null,
    notePreview: (row.note_preview as string | null) ?? null,
    trashed: Boolean(row.trashed),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function toTrackVersion(row: Record<string, unknown>): TrackVersion {
  return {
    id: row.id as string,
    trackId: row.track_id as string,
    filePath: row.file_path as string,
    savedAt: Number(row.saved_at),
    fileSize: Number(row.file_size),
    bpm: row.bpm === null || row.bpm === undefined ? null : Number(row.bpm),
    bpmSource: (row.bpm_source as string | null) ?? 'auto',
    createdAt: Number(row.created_at),
  }
}

async function run(sql: string, params: unknown[] = []): Promise<void> {
  await initDatabase()
  const db = getDb()
  return await new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

async function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await initDatabase()
  const db = getDb()
  return await new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err)
        return
      }
      resolve(rows as T[])
    })
  })
}

async function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  await initDatabase()
  const db = getDb()
  return await new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err)
        return
      }
      resolve((row as T) ?? null)
    })
  })
}

async function listTracksWithLatest(whereClause: string, params: unknown[]): Promise<TrackWithLatest[]> {
  const rows = await all(
    `
    SELECT
      t.*,
      v.id as version_id,
      v.file_path as version_file_path,
      v.saved_at as version_saved_at,
      v.file_size as version_file_size,
      v.bpm as version_bpm,
      v.bpm_source as version_bpm_source,
      v.created_at as version_created_at,
      n.id as note_id,
      n.plain_text_preview as note_preview,
      (
        SELECT COUNT(*) FROM track_versions tv
        WHERE tv.track_id = t.id
          AND LOWER(tv.file_path) NOT LIKE '%(overwritten%'
          AND LOWER(tv.file_path) NOT LIKE '%(autosaved%'
      ) as version_count
    FROM tracks t
    LEFT JOIN track_versions v ON v.id = t.latest_version_id
    LEFT JOIN track_notes n ON n.track_id = t.id
    ${whereClause}
    ORDER BY COALESCE(v.saved_at, t.updated_at) DESC
    `,
    params,
  )

  return rows.map((row) => {
    const track = toLogicalTrack(row)
    const hasVersion = row.version_id !== null && row.version_id !== undefined
    const latestVersion = hasVersion
      ? toTrackVersion({
          id: row.version_id,
          track_id: row.id,
          file_path: row.version_file_path,
          saved_at: row.version_saved_at,
          file_size: row.version_file_size,
          bpm: row.version_bpm,
          bpm_source: row.version_bpm_source,
          created_at: row.version_created_at,
        })
      : null
    return {
      track,
      latestVersion,
      versionCount: Number(row.version_count ?? 0),
    }
  })
}

export async function listTracks(): Promise<TrackWithLatest[]> {
  return listTracksWithLatest('WHERE t.trashed = 0', [])
}

export async function listTracksByFolder(folderId: string): Promise<TrackWithLatest[]> {
  return listTracksWithLatest('WHERE t.trashed = 0 AND t.folder_id = ?', [folderId])
}

export async function listTrashedTracks(): Promise<TrackWithLatest[]> {
  return listTracksWithLatest('WHERE t.trashed = 1', [])
}

export async function listTrackVersions(trackId: string): Promise<TrackVersion[]> {
  const rows = await all(
    `
    SELECT * FROM track_versions
    WHERE track_id = ?
      AND LOWER(file_path) NOT LIKE '%(overwritten%'
      AND LOWER(file_path) NOT LIKE '%(autosaved%'
    ORDER BY saved_at DESC
    `,
    [trackId],
  )
  return rows.map((row) => toTrackVersion(row))
}

export async function setLatestVersion(
  trackId: string,
  versionId: string,
): Promise<TrackWithLatest | null> {
  const version = await get('SELECT id, file_path FROM track_versions WHERE id = ? AND track_id = ?', [
    versionId,
    trackId,
  ])
  if (!version) return null
  await run(
    'UPDATE tracks SET latest_version_id = ?, ableton_project_path = ?, updated_at = ? WHERE id = ?',
    [versionId, (version as { file_path: string }).file_path, Date.now(), trackId],
  )
  const rows = await listTracksWithLatest('WHERE t.id = ?', [trackId])
  return rows[0] ?? null
}

export async function setTrackFolder(
  trackId: string,
  folderId: string | null,
): Promise<LogicalTrack | null> {
  await run('UPDATE tracks SET folder_id = ?, updated_at = ? WHERE id = ?', [
    folderId,
    Date.now(),
    trackId,
  ])
  const row = await get('SELECT * FROM tracks WHERE id = ?', [trackId])
  return row ? toLogicalTrack(row) : null
}

export async function setTrackStatus(
  trackId: string,
  status: string,
): Promise<LogicalTrack | null> {
  await run('UPDATE tracks SET status = ?, updated_at = ? WHERE id = ?', [
    status,
    Date.now(),
    trackId,
  ])
  const row = await get('SELECT * FROM tracks WHERE id = ?', [trackId])
  return row ? toLogicalTrack(row) : null
}

export async function setTrackGenre(
  trackId: string,
  genre: string | null,
): Promise<LogicalTrack | null> {
  await run('UPDATE tracks SET genre = ?, updated_at = ? WHERE id = ?', [
    genre,
    Date.now(),
    trackId,
  ])
  const row = await get('SELECT * FROM tracks WHERE id = ?', [trackId])
  return row ? toLogicalTrack(row) : null
}

export async function setTrackAudioPath(
  trackId: string,
  audioPath: string | null,
): Promise<LogicalTrack | null> {
  await run('UPDATE tracks SET audio_path = ?, updated_at = ? WHERE id = ?', [
    audioPath,
    Date.now(),
    trackId,
  ])
  const row = await get('SELECT * FROM tracks WHERE id = ?', [trackId])
  return row ? toLogicalTrack(row) : null
}

export async function setTrackBackgroundImagePath(
  trackId: string,
  backgroundImagePath: string | null,
): Promise<LogicalTrack | null> {
  await run('UPDATE tracks SET background_image_path = ?, updated_at = ? WHERE id = ?', [
    backgroundImagePath,
    Date.now(),
    trackId,
  ])
  const row = await get('SELECT * FROM tracks WHERE id = ?', [trackId])
  return row ? toLogicalTrack(row) : null
}

export async function setTrackBpm(trackId: string, bpm: number | null): Promise<void> {
  const track = await get('SELECT latest_version_id FROM tracks WHERE id = ?', [trackId])
  if (!track?.latest_version_id) return
  await run('UPDATE track_versions SET bpm = ?, bpm_source = ? WHERE id = ?', [
    bpm,
    'manual',
    track.latest_version_id,
  ])
}

export async function moveToTrash(ids: string[]): Promise<TrackWithLatest[]> {
  if (ids.length === 0) return listTracks()
  const placeholders = ids.map(() => '?').join(',')
  await run(`UPDATE tracks SET trashed = 1 WHERE id IN (${placeholders})`, ids)
  return listTracks()
}

export async function restoreTracks(ids: string[]): Promise<TrackWithLatest[]> {
  if (ids.length === 0) return listTracks()
  const placeholders = ids.map(() => '?').join(',')
  await run(`UPDATE tracks SET trashed = 0 WHERE id IN (${placeholders})`, ids)
  return listTracks()
}

export async function purgeTracks(ids: string[]): Promise<TrackWithLatest[]> {
  if (ids.length === 0) return listTracks()
  const placeholders = ids.map(() => '?').join(',')
  await run(`DELETE FROM track_versions WHERE track_id IN (${placeholders})`, ids)
  await run(`DELETE FROM tracks WHERE id IN (${placeholders})`, ids)
  return listTracks()
}

export async function upsertScanResults(hits: ScanFileHit[]): Promise<TrackWithLatest[]> {
  if (hits.length === 0) return listTracks()
  await initDatabase()
  const db = getDb()

  const groupKeys = Array.from(new Set(hits.map((hit) => computeGroupKey(hit.filePath))))
  const existingRows = groupKeys.length
    ? await all(`SELECT * FROM tracks WHERE group_key IN (${groupKeys.map(() => '?').join(',')})`, groupKeys)
    : []

  const trackByGroup = new Map<string, LogicalTrack>()
  for (const row of existingRows) {
    const track = toLogicalTrack(row)
    trackByGroup.set(track.groupKey, track)
  }

  const now = Date.now()
  for (const hit of hits) {
    const groupKey = computeGroupKey(hit.filePath)
    if (!trackByGroup.has(groupKey)) {
      const trackId = randomUUID()
      const title = computeDisplayTitle(hit.filePath)
      const track: LogicalTrack = {
        id: trackId,
        groupKey,
        title,
        latestVersionId: null,
        rootPath: null,
        abletonProjectPath: null,
        dawFormat: (hit.ext as 'als' | 'flp' | 'ptx') ?? 'als',
        creationMode: 'blank',
        sourceTemplatePath: null,
        sourceTemplateName: null,
        projectTypeLabel: null,
        audioPath: null,
        backgroundImagePath: null,
        folderId: null,
        status: 'Idea',
        notes: '',
        noteId: null,
        notePreview: null,
        genre: null,
        trashed: false,
        createdAt: now,
        updatedAt: now,
      }
      trackByGroup.set(groupKey, track)
    }
  }

  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      const insertTrack = db.prepare(
        `
        INSERT OR IGNORE INTO tracks (
          id, group_key, title, latest_version_id, ableton_project_path, audio_path, background_image_path, folder_id, status, notes, trashed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      const upsertVersion = db.prepare(
        `
        INSERT INTO track_versions (
          id, track_id, file_path, saved_at, file_size, bpm, bpm_source, content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
          saved_at = excluded.saved_at,
          file_size = excluded.file_size,
          bpm = CASE WHEN excluded.bpm IS NOT NULL THEN excluded.bpm ELSE bpm END,
          bpm_source = CASE WHEN excluded.bpm IS NOT NULL THEN excluded.bpm_source ELSE bpm_source END
        `,
      )
      const updateTrackLatest = db.prepare(
        `
        UPDATE tracks SET latest_version_id = ?, ableton_project_path = ?, daw_format = ?, updated_at = ? WHERE id = ?
        `,
      )
      const updateTrackTitle = db.prepare(
        `
        UPDATE tracks SET title = ?, updated_at = ? WHERE id = ?
        `,
      )

      try {
        for (const track of trackByGroup.values()) {
          insertTrack.run([
            track.id,
            track.groupKey,
            track.title,
            track.latestVersionId,
            track.abletonProjectPath,
            track.audioPath,
            track.backgroundImagePath,
            track.folderId,
            track.status,
            track.notes,
            track.trashed ? 1 : 0,
            track.createdAt,
            track.updatedAt,
          ])
        }

        for (const hit of hits) {
          const groupKey = computeGroupKey(hit.filePath)
          const track = trackByGroup.get(groupKey)
          if (!track) continue
          const displayTitle = computeDisplayTitle(hit.filePath)
          if (displayTitle && displayTitle !== track.title) {
            updateTrackTitle.run([displayTitle, now, track.id])
            track.title = displayTitle
          }
          const parsedVersion = parseAbletonVersionFile(hit.filePath)
          const savedAt = parsedVersion?.versionTimestampMs ?? hit.lastModifiedMs
          const versionId = randomUUID()
          upsertVersion.run([
            versionId,
            track.id,
            hit.filePath,
            savedAt,
            hit.fileSize,
            null,
            'auto',
            null,
            now,
          ])
        }

        const trackIds = Array.from(new Set(Array.from(trackByGroup.values()).map((track) => track.id)))
        for (const trackId of trackIds) {
          const latestRow = db.prepare(
            'SELECT id, file_path, saved_at FROM track_versions WHERE track_id = ? ORDER BY saved_at DESC LIMIT 1',
          ).get(trackId) as unknown as
            | { id: string; file_path: string; saved_at: number }
            | undefined
          if (latestRow && typeof latestRow.file_path === 'string') {
            const dawFormat = getDawFormatFromPath(latestRow.file_path)
            updateTrackLatest.run([latestRow.id, latestRow.file_path, dawFormat, now, trackId])
          } else if (latestRow) {
            console.warn('[trackStore] missing latest file_path during upsertScanResults', {
              trackId,
              latestVersionId: latestRow.id,
            })
          }
        }

        insertTrack.finalize()
        upsertVersion.finalize()
        updateTrackLatest.finalize()
        updateTrackTitle.finalize()
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })

  await run(
    `
    DELETE FROM track_versions
    WHERE LOWER(file_path) LIKE '%.flp'
      AND (
        LOWER(file_path) LIKE '%(overwritten%'
        OR LOWER(file_path) LIKE '%(autosaved%'
      )
    `,
    [],
  )

  await rebuildTracksFromVersions()
  return listTracks()
}

export async function createProjectRecord(input: CreateProjectDbInput): Promise<TrackWithLatest> {
  await initDatabase()
  const now = Date.now()
  const groupKey = computeGroupKey(input.dawProjectPath)
  const versionId = randomUUID()
  await run(
    `
    INSERT INTO tracks (
      id, group_key, title, latest_version_id, root_path, ableton_project_path, daw_format, creation_mode, source_template_path, source_template_name, project_type_label, audio_path, background_image_path, folder_id, status, notes, trashed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.projectId,
      groupKey,
      input.projectName,
      versionId,
      input.rootPath,
      input.dawProjectPath,
      input.dawFormat,
      input.creationMode,
      input.sourceTemplatePath,
      input.sourceTemplateName,
      input.projectTypeLabel,
      null,
      null,
      input.folderId,
      input.status,
      '',
      0,
      now,
      now,
    ],
  )
  await run(
    `
    INSERT INTO track_versions (
      id, track_id, file_path, saved_at, file_size, bpm, bpm_source, content_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      versionId,
      input.projectId,
      input.dawProjectPath,
      input.savedAt,
      input.fileSize,
      null,
      'auto',
      null,
      now,
    ],
  )
  const created = await listTracksWithLatest('WHERE t.id = ?', [input.projectId])
  if (!created[0]) {
    throw new Error('Project row was created but could not be loaded.')
  }
  return created[0]
}

export async function findVersionByPath(filePath: string): Promise<TrackVersion | null> {
  const row = await get('SELECT * FROM track_versions WHERE file_path = ?', [filePath])
  return row ? toTrackVersion(row) : null
}

export async function updateVersionBpm(
  versionId: string,
  bpm: number | null,
  source: string,
): Promise<TrackVersion | null> {
  await run('UPDATE track_versions SET bpm = ?, bpm_source = ? WHERE id = ?', [bpm, source, versionId])
  const row = await get('SELECT * FROM track_versions WHERE id = ?', [versionId])
  return row ? toTrackVersion(row) : null
}

export async function debugComputeBpmForFileName(
  fileName: string,
): Promise<TrackVersion | null> {
  const needle = fileName.toLowerCase()
  const row = await get(
    'SELECT * FROM track_versions WHERE LOWER(file_path) LIKE ? LIMIT 1',
    [`%${needle}`],
  )
  if (!row) return null
  const version = toTrackVersion(row)
  const bpm = await extractBpmFromAls(version.filePath)
  if (bpm === null) return null
  return updateVersionBpm(version.id, bpm, 'als')
}

async function rebuildTracksFromVersions(): Promise<void> {
  await initDatabase()
  const db = getDb()
  const tracks = await all('SELECT * FROM tracks', [])
  const versions = await all('SELECT * FROM track_versions', [])
  const trackById = new Map<string, Record<string, unknown>>()
  const trackByGroup = new Map<string, Record<string, unknown>>()

  for (const row of tracks) {
    trackById.set(row.id as string, row)
    if (row.group_key) {
      trackByGroup.set(row.group_key as string, row)
    }
  }

  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const version of versions) {
    const filePath = version.file_path as string
    const groupKey = computeGroupKey(filePath)
    const group = grouped.get(groupKey) ?? []
    group.push(version)
    grouped.set(groupKey, group)
  }

  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run('UPDATE tracks SET group_key = id')
      const updateVersionTrack = db.prepare(
        'UPDATE track_versions SET track_id = ? WHERE id = ?',
      )
      const updateTrack = db.prepare(
        `
        UPDATE tracks
        SET group_key = ?, title = ?, latest_version_id = ?, ableton_project_path = ?, daw_format = ?, audio_path = ?, background_image_path = ?, folder_id = ?, status = ?, notes = ?, trashed = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      const insertTrack = db.prepare(
        `
        INSERT INTO tracks (
        id, group_key, title, latest_version_id, root_path, ableton_project_path, daw_format, creation_mode, source_template_path, source_template_name, project_type_label, audio_path, background_image_path, folder_id, status, notes, trashed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )

      try {
        const usedTrackIds = new Set<string>()

        for (const [groupKey, groupVersions] of grouped.entries()) {
          const sorted = [...groupVersions].sort((a, b) => {
            const aIsBackup = parseAbletonVersionFile(a.file_path as string) !== null
            const bIsBackup = parseAbletonVersionFile(b.file_path as string) !== null
            // Always prefer the non-timestamped main file over Ableton backup copies
            if (!aIsBackup && bIsBackup) return -1
            if (aIsBackup && !bIsBackup) return 1
            return Number(b.saved_at) - Number(a.saved_at)
          })
          const latest = sorted[0]
          const latestFilePathRaw = latest.file_path
          if (typeof latestFilePathRaw !== 'string' || latestFilePathRaw.trim().length === 0) {
            console.warn('[trackStore] skipping grouped row with invalid file_path', { groupKey })
            continue
          }
          const latestFilePath = latestFilePathRaw
          const existingByGroup = trackByGroup.get(groupKey)
          const fallbackTrack = trackById.get(latest.track_id as string)
          const chosen = existingByGroup ?? fallbackTrack
          const trackId = (chosen?.id as string | undefined) ?? randomUUID()
          const title = computeDisplayTitle(latestFilePath)
          const folderId = (chosen?.folder_id as string | null | undefined) ?? null
          const status = (chosen?.status as string | null | undefined) ?? 'Idea'
          const notes = (chosen?.notes as string | null | undefined) ?? ''
          const trashed = Number(chosen?.trashed ?? 0)
          const audioPath = (chosen?.audio_path as string | null | undefined) ?? null
          const backgroundImagePath =
            (chosen?.background_image_path as string | null | undefined) ?? null
          const rootPath = (chosen?.root_path as string | null | undefined) ?? path.dirname(latestFilePath)
          const createdAt = Number(chosen?.created_at ?? Date.now())
          const updatedAt = Date.now()
          const latestVersionId = latest.id as string
          const dawFormat = getDawFormatFromPath(latestFilePath)
          const creationMode = (chosen?.creation_mode as string | null | undefined) ?? 'blank'
          const sourceTemplatePath = (chosen?.source_template_path as string | null | undefined) ?? null
          const sourceTemplateName = (chosen?.source_template_name as string | null | undefined) ?? null
          const projectTypeLabel = (chosen?.project_type_label as string | null | undefined) ?? null

          if (chosen) {
            updateTrack.run([
              groupKey,
              title,
              latestVersionId,
              latestFilePath,
              dawFormat,
              audioPath,
              backgroundImagePath,
              folderId,
              status,
              notes,
              trashed,
              updatedAt,
              trackId,
            ])
          } else {
            insertTrack.run([
              trackId,
              groupKey,
              title,
              latestVersionId,
              rootPath,
              latestFilePath,
              dawFormat,
              creationMode,
              sourceTemplatePath,
              sourceTemplateName,
              projectTypeLabel,
              audioPath,
              backgroundImagePath,
              folderId,
              status,
              notes,
              trashed,
              createdAt,
              updatedAt,
            ])
          }

          usedTrackIds.add(trackId)

          for (const version of groupVersions) {
            const versionId = version.id as string
            const currentTrackId = version.track_id as string
            if (currentTrackId !== trackId) {
              updateVersionTrack.run([trackId, versionId])
            }
          }
        }

        if (usedTrackIds.size > 0) {
          const placeholders = Array.from(usedTrackIds).map(() => '?').join(',')
          db.run(`DELETE FROM tracks WHERE id NOT IN (${placeholders})`, Array.from(usedTrackIds))
        }

        db.run(
          `
          UPDATE tracks
          SET latest_version_id = (
            SELECT id FROM track_versions
            WHERE track_versions.track_id = tracks.id
            ORDER BY saved_at DESC
            LIMIT 1
          ),
          ableton_project_path = (
            SELECT file_path FROM track_versions
            WHERE track_versions.track_id = tracks.id
            ORDER BY saved_at DESC
            LIMIT 1
          )
          `,
        )

        db.run(
          `
          DELETE FROM tracks
          WHERE id NOT IN (SELECT DISTINCT track_id FROM track_versions)
          `,
        )

        updateVersionTrack.finalize()
        updateTrack.finalize()
        insertTrack.finalize()
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}
