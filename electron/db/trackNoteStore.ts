import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { app } from 'electron'
import { getDb, initDatabase } from './sqlite'

export type NoteMediaType = 'image' | 'audio'

export type TrackNote = {
  id: string
  trackId: string
  contentJson: string
  plainTextPreview: string
  createdAt: number
  updatedAt: number
}

export type NoteMedia = {
  id: string
  noteId: string
  type: NoteMediaType
  filePath: string
  originalName: string
  sizeBytes: number
  createdAt: number
}

function getNotesMediaRoot(): string {
  return path.join(app.getPath('userData'), 'notes_media')
}

export function getNotesMediaRootPath(): string {
  return getNotesMediaRoot()
}

function toTrackNote(row: Record<string, unknown>): TrackNote {
  return {
    id: row.id as string,
    trackId: row.track_id as string,
    contentJson: (row.content_json as string | null) ?? '{"type":"doc","html":""}',
    plainTextPreview: (row.plain_text_preview as string | null) ?? '',
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function toNoteMedia(row: Record<string, unknown>): NoteMedia {
  return {
    id: row.id as string,
    noteId: row.note_id as string,
    type: row.type as NoteMediaType,
    filePath: row.file_path as string,
    originalName: row.original_name as string,
    sizeBytes: Number(row.size_bytes),
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

async function getRow<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
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

async function allRows<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await initDatabase()
  const db = getDb()
  return await new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err)
        return
      }
      resolve((rows as T[]) ?? [])
    })
  })
}

function sanitizeHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
}

export function derivePlainTextPreview(contentJson: string, maxLength = 100): string {
  try {
    const parsed = JSON.parse(contentJson) as { html?: string }
    const html = typeof parsed.html === 'string' ? parsed.html : ''
    const plain = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return plain.slice(0, maxLength)
  } catch {
    return ''
  }
}

function normalizeContentJson(raw: string): string {
  let html = ''
  try {
    const parsed = JSON.parse(raw) as { html?: string }
    if (typeof parsed.html === 'string') {
      html = parsed.html
    }
  } catch {
    // ignore invalid payload
  }
  return JSON.stringify({
    type: 'doc',
    version: 1,
    html: sanitizeHtml(html),
  })
}

export async function getTrackNoteByTrackId(trackId: string): Promise<TrackNote | null> {
  if (!trackId) return null
  const row = await getRow('SELECT * FROM track_notes WHERE track_id = ?', [trackId])
  return row ? toTrackNote(row) : null
}

export async function createTrackNote(trackId: string): Promise<TrackNote> {
  const existing = await getTrackNoteByTrackId(trackId)
  if (existing) return existing
  const now = Date.now()
  const noteId = randomUUID()
  const emptyContent = JSON.stringify({ type: 'doc', version: 1, html: '' })
  await run(
    `
    INSERT INTO track_notes (id, track_id, content_json, plain_text_preview, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [noteId, trackId, emptyContent, '', now, now],
  )
  await ensureTrackMediaDir(trackId)
  const row = await getRow('SELECT * FROM track_notes WHERE id = ?', [noteId])
  if (!row) throw new Error('Failed to create note.')
  return toTrackNote(row)
}

export async function updateTrackNoteContent(
  trackId: string,
  contentJson: string,
): Promise<TrackNote> {
  const note = await createTrackNote(trackId)
  const normalized = normalizeContentJson(contentJson)
  const preview = derivePlainTextPreview(normalized)
  const now = Date.now()
  await run(
    'UPDATE track_notes SET content_json = ?, plain_text_preview = ?, updated_at = ? WHERE id = ?',
    [normalized, preview, now, note.id],
  )
  const updated = await getRow('SELECT * FROM track_notes WHERE id = ?', [note.id])
  if (!updated) throw new Error('Failed to update note.')
  return toTrackNote(updated)
}

export async function listNoteMedia(noteId: string): Promise<NoteMedia[]> {
  if (!noteId) return []
  const rows = await allRows(
    'SELECT * FROM note_media WHERE note_id = ? ORDER BY created_at DESC',
    [noteId],
  )
  return rows.map((row) => toNoteMedia(row))
}

export async function ensureTrackMediaDir(trackId: string): Promise<string> {
  const dirPath = path.join(getNotesMediaRoot(), trackId)
  await fs.mkdir(dirPath, { recursive: true })
  return dirPath
}

export async function saveNoteMediaFile(params: {
  trackId: string
  noteId: string
  type: NoteMediaType
  originalName: string
  bytes: Uint8Array
  extension: string
}): Promise<NoteMedia> {
  const note = await getRow('SELECT id, track_id FROM track_notes WHERE id = ?', [params.noteId])
  if (!note || (note as { track_id: string }).track_id !== params.trackId) {
    throw new Error('Note not found for track.')
  }
  const mediaId = randomUUID()
  const safeExt = params.extension.replace(/[^a-zA-Z0-9.]/g, '').replace(/^\.+/, '') || 'bin'
  const fileName = `${Date.now()}-${mediaId}.${safeExt}`
  const dirPath = await ensureTrackMediaDir(params.trackId)
  const filePath = path.join(dirPath, fileName)
  await fs.writeFile(filePath, params.bytes)
  const now = Date.now()
  await run(
    `
    INSERT INTO note_media (id, note_id, type, file_path, original_name, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [mediaId, params.noteId, params.type, filePath, params.originalName, params.bytes.byteLength, now],
  )
  const created = await getRow('SELECT * FROM note_media WHERE id = ?', [mediaId])
  if (!created) throw new Error('Failed to save note media metadata.')
  return toNoteMedia(created)
}

export async function deleteNoteMedia(mediaId: string): Promise<{ ok: boolean }> {
  if (!mediaId) return { ok: false }
  const row = await getRow('SELECT * FROM note_media WHERE id = ?', [mediaId])
  if (!row) return { ok: false }
  const media = toNoteMedia(row)
  await run('DELETE FROM note_media WHERE id = ?', [mediaId])
  try {
    await fs.unlink(media.filePath)
  } catch {
    // Ignore missing files.
  }
  return { ok: true }
}

export async function renameNoteMedia(
  mediaId: string,
  originalName: string,
): Promise<{ ok: boolean; media?: NoteMedia; error?: string }> {
  if (!mediaId) return { ok: false, error: 'Media id is required.' }
  const trimmed = originalName.trim()
  if (!trimmed) return { ok: false, error: 'Name cannot be empty.' }
  if (trimmed.length > 120) return { ok: false, error: 'Name is too long.' }
  const row = await getRow('SELECT * FROM note_media WHERE id = ?', [mediaId])
  if (!row) return { ok: false, error: 'Recording not found.' }
  await run('UPDATE note_media SET original_name = ? WHERE id = ?', [trimmed, mediaId])
  const updated = await getRow('SELECT * FROM note_media WHERE id = ?', [mediaId])
  if (!updated) return { ok: false, error: 'Failed to rename recording.' }
  return { ok: true, media: toNoteMedia(updated) }
}
