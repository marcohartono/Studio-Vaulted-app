import { app } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const LICENSE_FILE = 'studio-vaulted.lic'

function getLicenseFilePath(): string {
  return path.join(app.getPath('userData'), LICENSE_FILE)
}

// Simple XOR obfuscation — prevents casual inspection of the license file on disk.
// The machineId is stored separately in machine.id (encrypted via safeStorage).
function xorObfuscate(input: string, secret: string): string {
  return input
    .split('')
    .map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ secret.charCodeAt(i % secret.length)))
    .join('')
}

function encode(data: object): string {
  return Buffer.from(xorObfuscate(JSON.stringify(data), LICENSE_FILE)).toString('base64')
}

function decode(encoded: string): unknown {
  try {
    const raw = Buffer.from(encoded, 'base64').toString('utf8')
    return JSON.parse(xorObfuscate(raw, LICENSE_FILE))
  } catch {
    return null
  }
}

export interface StoredLicense {
  key: string
  token: string
  machineId: string
  lastVerifiedAt: number
}

function isStoredLicense(v: unknown): v is StoredLicense {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as StoredLicense).key === 'string' &&
    typeof (v as StoredLicense).token === 'string' &&
    typeof (v as StoredLicense).machineId === 'string' &&
    typeof (v as StoredLicense).lastVerifiedAt === 'number'
  )
}

export async function saveLicense(data: StoredLicense): Promise<void> {
  await fs.writeFile(getLicenseFilePath(), encode(data), 'utf8')
}

export async function loadLicense(): Promise<StoredLicense | null> {
  try {
    const raw = await fs.readFile(getLicenseFilePath(), 'utf8')
    const decoded = decode(raw.trim())
    return isStoredLicense(decoded) ? decoded : null
  } catch {
    return null
  }
}

export async function clearLicense(): Promise<void> {
  try {
    await fs.unlink(getLicenseFilePath())
  } catch {
    // File may not exist — that's fine
  }
}
