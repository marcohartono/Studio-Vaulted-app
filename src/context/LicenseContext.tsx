import { createContext, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface LicenseContextValue {
  plan: LicensePlan
  activatedKey: string | null
  features: Record<LicenseFeatureKey, boolean>
  limits: Record<LicenseLimitKey, number>
  isLoading: boolean
  canUse: (feature: LicenseFeatureKey) => boolean
  getLimit: (limit: LicenseLimitKey) => number
  activate: (key: string) => Promise<ActivationResult>
  deactivate: () => Promise<void>
  refresh: () => Promise<void>
}

const DEFAULT_FREE_STATUS: LicenseStatus = {
  plan: 'free',
  activatedKey: null,
  features: { notes: false, templates: false },
  limits: { folders: 3, groups: 3 },
}

export const LicenseContext = createContext<LicenseContextValue | null>(null)

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus>(DEFAULT_FREE_STATUS)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const s = await window.license.getStatus()
      setStatus(s)
    } catch {
      setStatus(DEFAULT_FREE_STATUS)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const activate = useCallback(async (key: string): Promise<ActivationResult> => {
    const result = await window.license.activate(key)
    if (result.success) await refresh()
    return result
  }, [refresh])

  const deactivate = useCallback(async () => {
    await window.license.deactivate()
    await refresh()
  }, [refresh])

  const canUse = useCallback(
    (feature: LicenseFeatureKey) => status.features[feature],
    [status],
  )

  const getLimit = useCallback(
    (limit: LicenseLimitKey) => status.limits[limit],
    [status],
  )

  return (
    <LicenseContext.Provider
      value={{
        plan: status.plan,
        activatedKey: status.activatedKey,
        features: status.features,
        limits: status.limits,
        isLoading,
        canUse,
        getLimit,
        activate,
        deactivate,
        refresh,
      }}
    >
      {children}
    </LicenseContext.Provider>
  )
}
