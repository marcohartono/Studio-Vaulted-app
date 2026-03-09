import { useCallback, useEffect, useState } from 'react'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !window.settings) return null
    setIsLoading(true)
    setError(null)
    try {
      const next = await window.settings.getAll()
      setSettings(next)
      return next
    } catch {
      setError('Failed to load settings.')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const update = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (typeof window === 'undefined' || !window.settings) return null
      setError(null)
      try {
        const next = await window.settings.update(patch)
        setSettings(next)
        return next
      } catch {
        setError('Failed to update settings.')
        return null
      }
    },
    [],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    settings,
    isLoading,
    error,
    refresh,
    update,
    setSettings,
  }
}
