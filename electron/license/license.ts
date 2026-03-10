import crypto from 'node:crypto'
import {
  APP_SECRET,
  LICENSE_KEY_REGEX,
  OFFLINE_GRACE_MS,
  PLANS,
  type FeatureKey,
  type LimitKey,
  type Plan,
} from './licenseConstants.js'
import { clearLicense, loadLicense, saveLicense } from './licenseStore.js'
import { getMachineId } from './machineId.js'
import { apiActivate, apiDeactivate, apiVerify } from './licenseApi.js'

export interface LicenseStatus {
  plan: Plan
  activatedKey: string | null
  features: Record<FeatureKey, boolean>
  limits: Record<LimitKey, number>
}

export interface ActivationResult {
  success: boolean
  error?: string
}

let currentPlan: Plan = 'free'
let activatedKey: string | null = null

function maskKey(key: string): string {
  const parts = key.split('-')
  if (parts.length !== 3) return '***'
  return `${parts[0]}-${parts[1]}-********`
}

function validateKeyFormat(key: string): boolean {
  return LICENSE_KEY_REGEX.test(key.trim().toUpperCase())
}

function validateKeySignature(key: string): boolean {
  const normalized = key.trim().toUpperCase()
  const parts = normalized.split('-')
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

export async function initLicense(): Promise<void> {
  const stored = await loadLicense()

  if (!stored) {
    currentPlan = 'free'
    activatedKey = null
    return
  }

  // Sanity-check stored key before trusting it
  if (!validateKeyFormat(stored.key) || !validateKeySignature(stored.key)) {
    currentPlan = 'free'
    activatedKey = null
    await clearLicense()
    return
  }

  const age = Date.now() - stored.lastVerifiedAt

  if (age <= OFFLINE_GRACE_MS) {
    // Within grace period — trust the cached activation
    currentPlan = 'paid'
    activatedKey = stored.key
    return
  }

  // Grace period expired — re-verify with server
  try {
    const result = await apiVerify(stored.key, stored.machineId, stored.token)
    if (result.valid) {
      // Refresh timestamp so the grace clock resets
      await saveLicense({ ...stored, lastVerifiedAt: Date.now() })
      currentPlan = 'paid'
      activatedKey = stored.key
    } else {
      // Server explicitly rejected (key moved to another machine, revoked, etc.)
      currentPlan = 'free'
      activatedKey = null
      await clearLicense()
    }
  } catch {
    // Server unreachable — extend grace silently so offline users aren't locked out
    currentPlan = 'paid'
    activatedKey = stored.key
  }
}

export async function activateLicense(key: string): Promise<ActivationResult> {
  const normalized = key.trim().toUpperCase()

  if (!validateKeyFormat(normalized)) {
    return { success: false, error: 'Invalid key format. Expected SVL-XXXXXXXX-YYYYYYYY.' }
  }

  if (!validateKeySignature(normalized)) {
    return { success: false, error: 'License key is not valid.' }
  }

  let machineId: string
  try {
    machineId = await getMachineId()
  } catch {
    return { success: false, error: 'Could not identify this machine. Please try again.' }
  }

  // DEV BYPASS: skip server activation
  if (process.env.NODE_ENV === 'development') {
    await saveLicense({ key: normalized, token: 'dev-token', machineId, lastVerifiedAt: Date.now() })
    currentPlan = 'paid'
    activatedKey = normalized
    return { success: true }
  }

  try {
    const result = await apiActivate(normalized, machineId)
    if (!result.success || !result.token) {
      return { success: false, error: result.error ?? 'Activation failed.' }
    }
    await saveLicense({ key: normalized, token: result.token, machineId, lastVerifiedAt: Date.now() })
    currentPlan = 'paid'
    activatedKey = normalized
    return { success: true }
  } catch {
    return {
      success: false,
      error: 'Could not reach the activation server. Check your internet connection and try again.',
    }
  }
}

export async function deactivateLicense(): Promise<void> {
  const stored = await loadLicense()

  if (stored) {
    try {
      await apiDeactivate(stored.key, stored.machineId, stored.token)
    } catch {
      // Server unreachable — deactivate locally anyway so the user can move to a new machine.
      // The server record will remain until they activate again (which will overwrite it).
    }
  }

  await clearLicense()
  currentPlan = 'free'
  activatedKey = null
}

export function getPlan(): Plan {
  return currentPlan
}

export function canUse(feature: FeatureKey): boolean {
  return PLANS[currentPlan].features[feature]
}

export function getLimit(limit: LimitKey): number {
  return PLANS[currentPlan].limits[limit]
}

export function getLicenseStatus(): LicenseStatus {
  const plan = PLANS[currentPlan]
  return {
    plan: currentPlan,
    activatedKey: activatedKey ? maskKey(activatedKey) : null,
    features: { ...plan.features },
    limits: { ...plan.limits },
  }
}
