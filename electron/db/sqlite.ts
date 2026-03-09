import path from 'node:path'
import sqlite3 from 'sqlite3'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { computeDisplayTitle, computeGroupKey } from '../scan/trackGrouping'

let db: sqlite3.Database | null = null
let initPromise: Promise<void> | null = null

function getDbPath(): string {
  return path.join(app.getPath('userData'), 'studio-vaulted.db')
}

function openDatabase(): sqlite3.Database {
  if (!db) {
    db = new sqlite3.Database(getDbPath())
    db.exec('PRAGMA foreign_keys = ON;')
  }
  return db
}

export async function initDatabase(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = new Promise<void>((resolve, reject) => {
    const instance = openDatabase()
    instance.exec(
      `
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        group_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        latest_version_id TEXT,
        root_path TEXT,
        ableton_project_path TEXT,
        daw_format TEXT NOT NULL DEFAULT 'als',
        creation_mode TEXT NOT NULL DEFAULT 'blank',
        source_template_path TEXT,
        source_template_name TEXT,
        project_type_label TEXT,
        audio_path TEXT,
        background_image_path TEXT,
        folder_id TEXT,
        status TEXT NOT NULL DEFAULT 'Idea',
        genre TEXT,
        notes TEXT NOT NULL DEFAULT '',
        trashed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS track_versions (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        saved_at INTEGER NOT NULL,
        file_size INTEGER NOT NULL,
        bpm INTEGER,
        bpm_source TEXT NOT NULL DEFAULT 'auto',
        content_hash TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_track_versions_track_saved
        ON track_versions (track_id, saved_at DESC);

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS track_notes (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL UNIQUE,
        content_json TEXT NOT NULL,
        plain_text_preview TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_track_notes_track_id
        ON track_notes (track_id);

      CREATE TABLE IF NOT EXISTS note_media (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('image', 'audio')),
        file_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(note_id) REFERENCES track_notes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_note_media_note_id
        ON note_media (note_id);
      `,
      async (err) => {
        if (err) {
          reject(err)
          return
        }
        try {
          await maybeMigrateLegacyTracks(instance)
          await maybeAddColumn(instance, 'tracks', 'root_path', 'TEXT')
          await maybeAddColumn(instance, 'tracks', 'audio_path', 'TEXT')
          await maybeAddColumn(instance, 'tracks', 'ableton_project_path', 'TEXT')
          await maybeAddColumn(instance, 'tracks', 'daw_format', "TEXT NOT NULL DEFAULT 'als'")
          await maybeAddColumn(instance, 'tracks', 'creation_mode', "TEXT NOT NULL DEFAULT 'blank'")
          await maybeAddColumn(instance, 'tracks', 'source_template_path', 'TEXT')
          await maybeAddColumn(instance, 'tracks', 'source_template_name', 'TEXT')
          await maybeAddColumn(instance, 'tracks', 'project_type_label', 'TEXT')
          await maybeAddColumn(instance, 'tracks', 'genre', 'TEXT')
          await maybeAddColumn(instance, 'tracks', 'background_image_path', 'TEXT')
          await new Promise<void>((resolveIndex, rejectIndex) => {
            instance.exec(
              `
              CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_ableton_project_path_unique
                ON tracks (ableton_project_path)
                WHERE ableton_project_path IS NOT NULL;
              `,
              (indexErr) => {
                if (indexErr) {
                  rejectIndex(indexErr)
                  return
                }
                resolveIndex()
              },
            )
          })
          resolve(undefined)
        } catch (error) {
          reject(error)
        }
      },
    )
  }).catch((error) => {
    initPromise = null
    throw error
  })
  return initPromise as Promise<void>
}

export function getDb(): sqlite3.Database {
  return openDatabase()
}

function getTableColumns(
  dbInstance: sqlite3.Database,
  table: string,
): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    dbInstance.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) {
        reject(err)
        return
      }
      const cols = new Set<string>()
      for (const row of rows as Array<{ name: string }>) {
        cols.add(row.name)
      }
      resolve(cols)
    })
  })
}

async function maybeAddColumn(
  dbInstance: sqlite3.Database,
  table: string,
  column: string,
  columnType: string,
): Promise<void> {
  const columns = await getTableColumns(dbInstance, table)
  if (columns.has(column)) return
  await new Promise<void>((resolve, reject) => {
    dbInstance.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnType}`, (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

async function maybeMigrateLegacyTracks(dbInstance: sqlite3.Database): Promise<void> {
  const columns = await getTableColumns(dbInstance, 'tracks')
  if (columns.has('group_key')) {
    return
  }

  const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
    dbInstance.all('SELECT * FROM tracks', (err, data) => {
      if (err) {
        reject(err)
        return
      }
      resolve((data as Record<string, unknown>[]) ?? [])
    })
  })

  await new Promise<void>((resolve, reject) => {
    dbInstance.serialize(() => {
      dbInstance.exec(
        `
        DROP TABLE IF EXISTS tracks_new;

        CREATE TABLE IF NOT EXISTS track_versions (
          id TEXT PRIMARY KEY,
          track_id TEXT NOT NULL,
          file_path TEXT NOT NULL UNIQUE,
          saved_at INTEGER NOT NULL,
          file_size INTEGER NOT NULL,
          bpm INTEGER,
          bpm_source TEXT NOT NULL DEFAULT 'auto',
          content_hash TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_track_versions_track_saved
          ON track_versions (track_id, saved_at DESC);

        CREATE TABLE tracks_new (
          id TEXT PRIMARY KEY,
          group_key TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          latest_version_id TEXT,
          audio_path TEXT,
          folder_id TEXT,
          status TEXT NOT NULL DEFAULT 'Idea',
          notes TEXT NOT NULL DEFAULT '',
          trashed INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        `,
        (err) => {
          if (err) {
            reject(err)
            return
          }

          const grouped = new Map<
            string,
            {
              trackId: string
              title: string
              folderId: string | null
              status: string
              notes: string
              trashed: number
              latestSavedAt: number
              latestVersionId: string | null
              metaSavedAt: number
              createdAt: number
              updatedAt: number
            }
          >()

          const insertTrack = dbInstance.prepare(
            `
            INSERT INTO tracks_new (
              id, group_key, title, latest_version_id, audio_path, folder_id,
              status, notes, trashed, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          const insertVersion = dbInstance.prepare(
            `
            INSERT OR IGNORE INTO track_versions (
              id, track_id, file_path, saved_at, file_size,
              bpm, bpm_source, content_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )

          for (const row of rows) {
            const filePath = (row.file_path ?? row.filePath) as string | undefined
            if (!filePath) continue
            const savedAt = Number(row.last_modified_ms ?? row.lastModifiedMs ?? Date.now())
            const fileSize = Number(row.file_size ?? row.fileSize ?? 0)
            const bpm = row.bpm === null || row.bpm === undefined ? null : Number(row.bpm)
            const folderId = (row.folder_id ?? row.folderId ?? null) as string | null
            const status = (row.status as string | undefined) ?? 'Idea'
            const notes = (row.notes as string | undefined) ?? ''
            const trashed = Number(row.trashed ?? 0)

            const groupKey = computeGroupKey(filePath)
            const title = computeDisplayTitle(filePath)
            let group = grouped.get(groupKey)
            if (!group) {
              group = {
                trackId: randomUUID(),
                title,
                folderId,
                status,
                notes,
                trashed,
                latestSavedAt: savedAt,
                latestVersionId: null,
                metaSavedAt: savedAt,
                createdAt: savedAt,
                updatedAt: Date.now(),
              }
              grouped.set(groupKey, group)
            } else {
              if (!group.folderId && folderId) {
                group.folderId = folderId
                group.metaSavedAt = savedAt
              }
              if (!group.notes && notes) {
                group.notes = notes
                group.metaSavedAt = savedAt
              }
              if (!group.status && status) {
                group.status = status
                group.metaSavedAt = savedAt
              }
              if (trashed) {
                group.trashed = 1
              }
            }

            const versionId = randomUUID()
            insertVersion.run([
              versionId,
              group.trackId,
              filePath,
              savedAt,
              fileSize,
              bpm,
              'auto',
              null,
              Date.now(),
            ])

            if (savedAt >= group.latestSavedAt) {
              group.latestSavedAt = savedAt
              group.latestVersionId = versionId
              group.title = title || group.title
            }
          }

          for (const [groupKey, group] of grouped.entries()) {
            insertTrack.run([
              group.trackId,
              groupKey,
              group.title,
              group.latestVersionId,
              null,
              group.folderId,
              group.status || 'Idea',
              group.notes || '',
              group.trashed,
              group.createdAt,
              group.updatedAt,
            ])
          }

          insertVersion.finalize()
          insertTrack.finalize()

          dbInstance.exec(
            `
            DROP TABLE tracks;
            ALTER TABLE tracks_new RENAME TO tracks;
            `,
            (dropErr) => {
              if (dropErr) {
                reject(dropErr)
                return
              }
              resolve()
            },
          )
        },
      )
    })
  })
}
