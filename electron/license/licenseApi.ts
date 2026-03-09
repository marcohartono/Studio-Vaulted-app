import { LICENSE_SERVER_URL } from './licenseConstants.js'

export interface ApiActivateResponse {
  success: boolean
  token?: string
  error?: string
}

export interface ApiDeactivateResponse {
  success: boolean
  error?: string
}

export interface ApiVerifyResponse {
  valid: boolean
}

async function post<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${LICENSE_SERVER_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`License server returned HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export function apiActivate(key: string, machineId: string): Promise<ApiActivateResponse> {
  return post('/activate', { key, machineId })
}

export function apiDeactivate(key: string, machineId: string, token: string): Promise<ApiDeactivateResponse> {
  return post('/deactivate', { key, machineId, token })
}

export function apiVerify(key: string, machineId: string, token: string): Promise<ApiVerifyResponse> {
  return post('/verify', { key, machineId, token })
}
