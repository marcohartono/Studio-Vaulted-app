type ScanOptionsCardProps = {
  scanSubfolders: boolean
  onToggleSubfolders: (next: boolean) => void
  onRescan: () => void
  isScanning?: boolean
  lastScanAt?: string | null
  lastFoundCount?: number | null
}

function formatLastScan(lastScanAt: string | null | undefined): string {
  if (!lastScanAt) return 'Never'
  const parsed = new Date(lastScanAt)
  if (!Number.isFinite(parsed.getTime())) return 'Never'
  return parsed.toLocaleString()
}

export function ScanOptionsCard({
  scanSubfolders,
  onToggleSubfolders,
  onRescan,
  isScanning = false,
  lastScanAt = null,
  lastFoundCount = null,
}: ScanOptionsCardProps) {
  return (
    <section className="settings-card">
      <h3>Scan Options</h3>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={scanSubfolders}
          onChange={(event) => onToggleSubfolders(event.target.checked)}
          disabled={isScanning}
        />
        <span>Scan subfolders</span>
      </label>
      <div className="settings-meta">
        <span>Last scan: {formatLastScan(lastScanAt)}</span>
        {lastFoundCount !== null && <span>Found: {lastFoundCount} projects</span>}
      </div>
      <div className="settings-actions">
        <button className="ghost" onClick={onRescan} disabled={isScanning}>
          {isScanning ? 'Scanning...' : 'Rescan now'}
        </button>
      </div>
    </section>
  )
}
