import express from 'express'
import crypto from 'node:crypto'
import { db } from './db.js'

const SERVER_SECRET = process.env.LICENSE_SERVER_SECRET
if (!SERVER_SECRET) throw new Error('LICENSE_SERVER_SECRET env var is required')

// Must match the client's APP_SECRET — used only to validate key format
const APP_SECRET = process.env.APP_SECRET ?? 'sv-2025-k9x#mLp!qR7nWz'
const LICENSE_KEY_REGEX = /^SVL-[0-9A-F]{8}-[0-9A-F]{8}$/
const PORT = Number(process.env.PORT ?? 3001)

const app = express()
app.use(express.json())

// ─── Helpers ───────────────────────────────────────────────────────────────

function validateKeyHmac(normalizedKey: string): boolean {
  const parts = normalizedKey.split('-')
  if (parts.length !== 3) return false
  const [, nonce, sig] = parts
  const expected = crypto
    .createHmac('sha256', APP_SECRET)
    .update(nonce)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase()
  return sig === expected
}

function isValidKey(key: string): boolean {
  const normalized = key.trim().toUpperCase()
  return LICENSE_KEY_REGEX.test(normalized) && validateKeyHmac(normalized)
}

function makeToken(key: string, machineId: string): string {
  return crypto
    .createHmac('sha256', SERVER_SECRET!)
    .update(`${key}:${machineId}`)
    .digest('hex')
}

interface ActivationRow {
  machine_id: string
  token: string
}

// ─── Routes ────────────────────────────────────────────────────────────────

// POST /activate  { key, machineId }
// Registers a key to a machine. Returns a token used to prove activation.
// Rejects if the key is already active on a *different* machine.
app.post('/activate', (req, res) => {
  const { key, machineId } = (req.body ?? {}) as Record<string, unknown>

  if (typeof key !== 'string' || typeof machineId !== 'string' || !key || !machineId) {
    res.json({ success: false, error: 'Missing key or machineId.' })
    return
  }

  const normalized = key.trim().toUpperCase()

  if (!isValidKey(normalized)) {
    res.json({ success: false, error: 'License key is not valid.' })
    return
  }

  const existing = db
    .prepare('SELECT machine_id, token FROM activations WHERE key = ?')
    .get(normalized) as ActivationRow | undefined

  if (existing && existing.machine_id !== machineId) {
    res.json({
      success: false,
      error: 'This key is already active on another machine. Deactivate it there first.',
    })
    return
  }

  const token = makeToken(normalized, machineId)
  const now = Date.now()

  db.prepare(`
    INSERT INTO activations (key, machine_id, token, activated_at, last_seen)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET token = excluded.token, last_seen = excluded.last_seen
  `).run(normalized, machineId, token, now, now)

  res.json({ success: true, token })
})

// POST /deactivate  { key, machineId, token }
// Releases a key so it can be activated on a new machine.
app.post('/deactivate', (req, res) => {
  const { key, machineId, token } = (req.body ?? {}) as Record<string, unknown>

  if (
    typeof key !== 'string' ||
    typeof machineId !== 'string' ||
    typeof token !== 'string'
  ) {
    res.json({ success: false, error: 'Missing parameters.' })
    return
  }

  const normalized = key.trim().toUpperCase()
  const row = db
    .prepare('SELECT machine_id, token FROM activations WHERE key = ?')
    .get(normalized) as ActivationRow | undefined

  if (!row || row.machine_id !== machineId || row.token !== token) {
    res.json({ success: false, error: 'Not authorized.' })
    return
  }

  db.prepare('DELETE FROM activations WHERE key = ?').run(normalized)
  res.json({ success: true })
})

// POST /verify  { key, machineId, token }
// Checks whether a stored activation is still valid. Called periodically by the app.
app.post('/verify', (req, res) => {
  const { key, machineId, token } = (req.body ?? {}) as Record<string, unknown>

  if (
    typeof key !== 'string' ||
    typeof machineId !== 'string' ||
    typeof token !== 'string'
  ) {
    res.json({ valid: false })
    return
  }

  const normalized = key.trim().toUpperCase()
  const row = db
    .prepare('SELECT machine_id, token FROM activations WHERE key = ?')
    .get(normalized) as ActivationRow | undefined

  const valid = !!(row && row.machine_id === machineId && row.token === token)

  if (valid) {
    db.prepare('UPDATE activations SET last_seen = ? WHERE key = ?').run(Date.now(), normalized)
  }

  res.json({ valid })
})

// ─── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Studio Vaulted license server running on port ${PORT}`)
})
