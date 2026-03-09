import { getDb, initDatabase } from './sqlite'
import { randomUUID } from 'node:crypto'

export interface Folder {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

function toFolder(row: Record<string, unknown>): Folder {
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
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

export async function listFolders(): Promise<Folder[]> {
  const rows = await all('SELECT * FROM folders ORDER BY updated_at DESC')
  return rows.map((row) => toFolder(row))
}

export async function createFolder(name: string): Promise<Folder[]> {
  const now = Date.now()
  const id = randomUUID()
  await run(
    'INSERT INTO folders (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, name, now, now],
  )
  return listFolders()
}

export async function renameFolder(id: string, name: string): Promise<Folder[]> {
  const now = Date.now()
  await run('UPDATE folders SET name = ?, updated_at = ? WHERE id = ?', [name, now, id])
  return listFolders()
}

export async function deleteFolder(id: string): Promise<Folder[]> {
  await run('UPDATE tracks SET folder_id = NULL WHERE folder_id = ?', [id])
  await run('DELETE FROM folders WHERE id = ?', [id])
  return listFolders()
}
