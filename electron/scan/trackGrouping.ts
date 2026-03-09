import path from 'node:path'

export type ParsedVersion = {
  baseName: string
  versionTimestampMs: number
}

const VERSION_REGEX =
  /^(.*?)[\s_-]*\[(\d{4})\s(\d{2})\s(\d{2})\s(\d{6})\]\.als$/i

export type ParsedFlpVersion = {
  baseName: string
}

export function parseAbletonVersionFile(filePath: string): ParsedVersion | null {
  const fileName = path.basename(filePath)
  const match = fileName.match(VERSION_REGEX)
  if (!match) return null
  const baseName = match[1].trim()
  const year = Number(match[2])
  const month = Number(match[3])
  const day = Number(match[4])
  const time = match[5]
  if (!baseName || time.length !== 6) return null
  const hour = Number(time.slice(0, 2))
  const minute = Number(time.slice(2, 4))
  const second = Number(time.slice(4, 6))
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null
  }
  const versionTimestampMs = new Date(year, month - 1, day, hour, minute, second).getTime()
  if (!Number.isFinite(versionTimestampMs)) return null
  return { baseName, versionTimestampMs }
}

export function parseFlpVersionFile(filePath: string): ParsedFlpVersion | null {
  const fileName = path.basename(filePath)
  const match = fileName.match(/^(.*)\s\(([^)]+)\)\.flp$/i)
  if (!match) return null
  const suffix = match[2].toLowerCase()
  if (suffix.includes('overwritten') || suffix.includes('autosaved')) {
    return null
  }
  const baseName = match[1].trim()
  if (!baseName) return null
  return { baseName }
}

export function normalizeTrackName(name: string): string {
  // Examples:
  // "MySong_v1" -> "mysong"
  // "MySong v02" -> "mysong"
  // "MySong_final_FINAL" -> "mysong"
  // "MySong (copy 2)" -> "mysong"
  // "MySong_2026-01-14" -> "mysong"
  // "MySong_01-14-26" -> "mysong"
  // "MySong [2024 01 14 235959]" -> "mysong"
  let cleaned = name.toLowerCase().trim()
  cleaned = cleaned.replace(/[_\-.]+/g, ' ')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  const suffixPatterns = [
    /\b(v|ver|version|rev|r)\s?\d+\b$/i,
    /\bfinal\s?\d*\b$/i,
    /\bcopy\s?\d*\b$/i,
    /\bduplicate\s?\d*\b$/i,
    /\(\s*copy\s*\d*\s*\)$/i,
    /\[\s*\d{4}[-_/ ]\d{1,2}[-_/ ]\d{1,2}\s*\]$/i,
    /\[\s*\d{1,2}[-_/ ]\d{1,2}[-_/ ]\d{2,4}\s*\]$/i,
    /\[\s*\d{4}\s\d{2}\s\d{2}\s\d{6}\s*\]$/i,
    /\b\d{4}[-_]\d{1,2}[-_]\d{1,2}\b$/i,
    /\b\d{1,2}[-_]\d{1,2}[-_]\d{2,4}\b$/i,
  ]

  let stripped = cleaned
  let changed = true
  while (changed) {
    changed = false
    for (const pattern of suffixPatterns) {
      const next = stripped.replace(pattern, '').trim()
      if (next !== stripped) {
        stripped = next
        changed = true
      }
    }
    stripped = stripped.replace(/\s+/g, ' ').trim()
  }

  return stripped
}

export function computeGroupKey(filePath: string): string {
  const parentDir = path.dirname(filePath)
  const parsedAls = parseAbletonVersionFile(filePath)
  const parsedFlp = parseFlpVersionFile(filePath)
  const baseName = parsedAls
    ? parsedAls.baseName
    : parsedFlp
      ? parsedFlp.baseName
      : path.basename(filePath, path.extname(filePath))
  const normalized = normalizeTrackName(baseName)
  return `${parentDir}::${normalized}`
}

export function computeDisplayTitle(filePath: string): string {
  const parsedAls = parseAbletonVersionFile(filePath)
  const parsedFlp = parseFlpVersionFile(filePath)
  const baseName = parsedAls
    ? parsedAls.baseName
    : parsedFlp
      ? parsedFlp.baseName
      : path.basename(filePath, path.extname(filePath))
  const cleaned = baseName.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
  const suffixPatterns = [
    /\b(v|ver|version|rev|r)\s?\d+\b$/i,
    /\bfinal\s?\d*\b$/i,
    /\bcopy\s?\d*\b$/i,
    /\bduplicate\s?\d*\b$/i,
    /\(\s*copy\s*\d*\s*\)$/i,
    /\[\s*\d{4}[-_/ ]\d{1,2}[-_/ ]\d{1,2}\s*\]$/i,
    /\[\s*\d{1,2}[-_/ ]\d{1,2}[-_/ ]\d{2,4}\s*\]$/i,
    /\[\s*\d{4}\s\d{2}\s\d{2}\s\d{6}\s*\]$/i,
    /\b\d{4}[-_]\d{1,2}[-_]\d{1,2}\b$/i,
    /\b\d{1,2}[-_]\d{1,2}[-_]\d{2,4}\b$/i,
  ]

  let stripped = cleaned
  let changed = true
  while (changed) {
    changed = false
    for (const pattern of suffixPatterns) {
      const next = stripped.replace(pattern, '').trim()
      if (next !== stripped) {
        stripped = next
        changed = true
      }
    }
    stripped = stripped.replace(/\s+/g, ' ').trim()
  }

  return stripped || cleaned || baseName
}
