import { safeStorage, app } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import crypto from 'node:crypto'

const MACHINE_ID_FILE = 'machine.id'

function getMachineIdPath(): string {
  return path.join(app.getPath('userData'), MACHINE_ID_FILE)
}

let cached: string | null = null

/**
 * Returns a stable machine identifier for this OS user account.
 *
 * - Generated once as a random UUID on first use.
 * - Stored encrypted via Electron safeStorage (macOS Keychain / Windows DPAPI).
 * - Because the encryption key is bound to the OS user, copying the file
 *   to another machine (or user account) renders it unreadable, so the app
 *   will generate a new ID and fail server verification.
 */
export async function getMachineId(): Promise<string> {
  if (cached) return cached

  const filePath = getMachineIdPath()
  const useEncryption = safeStorage.isEncryptionAvailable()

  try {
    if (useEncryption) {
      const encrypted = await fs.readFile(filePath)
      cached = safeStorage.decryptString(encrypted)
    } else {
      cached = await fs.readFile(filePath, 'utf8')
    }
    return cached!
  } catch {
    // First run or file missing — generate a new ID
    const id = crypto.randomUUID()
    try {
      if (useEncryption) {
        await fs.writeFile(filePath, safeStorage.encryptString(id))
      } else {
        await fs.writeFile(filePath, id, 'utf8')
      }
    } catch (writeErr) {
      console.error('[machineId] Failed to persist machine ID:', writeErr)
    }
    cached = id
    return id
  }
}
