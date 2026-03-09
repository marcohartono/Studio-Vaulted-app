import { useCallback, useRef, useState } from 'react'

export function getScanErrorMessage(error?: ScanRootResult['error']): string | null {
  if (!error) return null
  if (error === 'root-not-set') return 'Project Root Folder is not set.'
  if (error === 'root-not-directory') return 'Project Root Folder is not a directory.'
  if (error === 'root-missing') return 'Project Root Folder no longer exists.'
  if (error === 'root-permission-denied') return 'Permission denied for Project Root Folder.'
  if (error === 'scan-permission-denied') return 'Permission denied while scanning folder contents.'
  return 'Scan failed. Check permissions and try again.'
}

export function useProjectScan() {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFoundCount, setLastFoundCount] = useState<number | null>(null)
  const pendingRef = useRef<Promise<ScanRootResult | null> | null>(null)
  const pendingKeyRef = useRef<string | null>(null)

  const scanRoot = useCallback(
    async (options?: { root?: string | null; scanSubfolders?: boolean }) => {
      if (typeof window === 'undefined' || !window.projects) return null
      const requestKey = JSON.stringify({
        root: options?.root ?? null,
        scanSubfolders: options?.scanSubfolders ?? null,
      })

      if (pendingRef.current) {
        if (pendingKeyRef.current === requestKey) return pendingRef.current
        await pendingRef.current.catch(() => null)
      }

      setIsScanning(true)
      setError(null)
      const run: Promise<ScanRootResult | null> = window.projects
        .scanRoot(options)
        .then((result) => {
          if (result.error) {
            console.warn('[useProjectScan] scanRoot error:', result.error, options ?? {})
          } else {
            console.info('[useProjectScan] scanRoot success:', {
              found: result.found,
              root: options?.root ?? null,
              scanSubfolders: options?.scanSubfolders ?? null,
            })
          }
          const message = getScanErrorMessage(result.error)
          setError(message)
          setLastFoundCount(result.found)
          return result
        })
        .catch(() => {
          console.error('[useProjectScan] scanRoot invoke failed', options ?? {})
          setError('Scan failed. Check permissions and try again.')
          return null
        })
        .finally(() => {
          setIsScanning(false)
          pendingRef.current = null
          pendingKeyRef.current = null
        })

      pendingRef.current = run
      pendingKeyRef.current = requestKey
      return run
    },
    [],
  )

  return {
    scanRoot,
    isScanning,
    error,
    lastFoundCount,
  }
}
