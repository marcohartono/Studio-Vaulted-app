import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '../../data/activations.db')

mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS activations (
    key         TEXT    PRIMARY KEY,
    machine_id  TEXT    NOT NULL,
    token       TEXT    NOT NULL,
    activated_at INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL
  )
`)
