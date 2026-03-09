import { useContext } from 'react'
import { LicenseContext } from '../context/LicenseContext'

export function useLicense() {
  const ctx = useContext(LicenseContext)
  if (!ctx) throw new Error('useLicense must be used inside <LicenseProvider>')
  return ctx
}
