export type Plan = 'free' | 'paid'
export type FeatureKey = 'notes' | 'templates'
export type LimitKey = 'folders' | 'groups'

export interface PlanDefinition {
  features: Record<FeatureKey, boolean>
  limits: Record<LimitKey, number>
}

export const PLANS: Record<Plan, PlanDefinition> = {
  free: {
    features: {
      notes: false,
      templates: false,
    },
    limits: {
      folders: 3,
      groups: 3,
    },
  },
  paid: {
    features: {
      notes: true,
      templates: true,
    },
    limits: {
      folders: Infinity,
      groups: Infinity,
    },
  },
}

// Key format: SVL-XXXXXXXX-YYYYYYYY
// XXXXXXXX = 8 hex char nonce
// YYYYYYYY = 8 hex char HMAC-SHA256 signature, checked only by the license server
export const LICENSE_KEY_REGEX = /^SVL-[0-9A-F]{8}-[0-9A-F]{8}$/

// License activation server base URL (no trailing slash)
export const LICENSE_SERVER_URL =
  (typeof process !== 'undefined' && process.env.LICENSE_SERVER_URL) ||
  'https://license.studiovaulted.com'

// How long the app trusts a cached activation before calling /verify again.
// If the server is unreachable during re-verification, grace is extended silently.
export const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
