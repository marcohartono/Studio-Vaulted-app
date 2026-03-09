import { promises as fs } from 'node:fs'
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { XMLParser } from 'fast-xml-parser'

const gunzipAsync = promisify(gunzip)
const debug = process.env.BPM_DEBUG === '1'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  allowBooleanAttributes: true,
})

export async function extractBpmFromAls(filePath: string): Promise<number | null> {
  try {
    const data = await fs.readFile(filePath)
    let xmlText: string
    try {
      const unzipped = await gunzipAsync(data)
      xmlText = unzipped.toString('utf8')
    } catch {
      xmlText = data.toString('utf8')
    }

    const regexTempo = extractTempoFromXmlText(xmlText)
    if (regexTempo !== null) {
      if (debug) console.log('[bpm] regex tempo', regexTempo, filePath)
      return clampBpm(regexTempo)
    }

    const parsed = parser.parse(xmlText) as Record<string, unknown>
    const direct = extractDirectTempo(parsed)
    if (direct !== null) {
      if (debug) console.log('[bpm] direct tempo', direct, filePath)
      return clampBpm(direct)
    }
    const liveSet = findLiveSet(parsed)
    const fallback = liveSet ? findTempoRecursive(liveSet) : findTempoRecursive(parsed)
    if (debug && fallback !== null) {
      console.log('[bpm] fallback tempo', fallback, filePath)
    }
    return clampBpm(fallback)
  } catch (error) {
    if (debug) {
      console.log('[bpm] failed to parse', filePath, error)
    }
    return null
  }
}

export async function debugExtractBpm(filePath: string): Promise<void> {
  const bpm = await extractBpmFromAls(filePath)
  console.log(`[bpm] ${filePath} -> ${bpm ?? 'null'}`)
}

function clampBpm(value: number | null): number | null {
  if (value === null) return null
  if (!Number.isFinite(value)) return null
  if (value < 20 || value > 400) return null
  return value
}

function extractDirectTempo(parsed: Record<string, unknown>): number | null {
  const liveSet = findLiveSet(parsed)
  const masterTrack = getFirst(liveSet, 'MasterTrack')
  const deviceChain = getFirst(masterTrack, 'DeviceChain')
  const mixer = getFirst(deviceChain, 'Mixer')
  const tempo = getFirst(mixer, 'Tempo')
  const manual = getFirst(tempo, 'Manual')
  const value = getAttributeValue(manual, 'Value')
  return value === null ? null : Number(value)
}

function extractTempoFromXmlText(xmlText: string): number | null {
  const tempoBlockRegex = /<Tempo\b[^>]*>([\s\S]*?)<\/Tempo>/gi
  let blockMatch: RegExpExecArray | null
  const tempoCandidates: number[] = []

  while ((blockMatch = tempoBlockRegex.exec(xmlText)) !== null) {
    const block = blockMatch[1]
    const manualMatch = block.match(/<Manual[^>]*Value="([0-9]+(?:\.[0-9]+)?)"/i)
    if (!manualMatch) continue
    const bpm = Number(manualMatch[1])
    if (Number.isFinite(bpm) && bpm >= 20 && bpm <= 400) {
      tempoCandidates.push(bpm)
    }
  }

  if (tempoCandidates.length > 0) {
    return tempoCandidates[0]
  }

  const values: number[] = []
  const regex = /<Manual[^>]*Value="([0-9]+(?:\.[0-9]+)?)"/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(xmlText)) !== null) {
    const bpm = Number(match[1])
    if (Number.isFinite(bpm)) values.push(bpm)
  }

  if (debug && values.length > 0) {
    console.log('[bpm] manual values found', values.slice(0, 20), 'total', values.length)
  }

  const ranged = values.filter((value) => value >= 20 && value <= 400)
  if (ranged.length === 0) return null
  return ranged[ranged.length - 1]
}

function findTempoRecursive(node: unknown): number | null {
  if (node === null || node === undefined) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findTempoRecursive(item)
      if (found !== null) return found
    }
    return null
  }
  if (typeof node !== 'object') return null

  const record = node as Record<string, unknown>
  if (record.Tempo && typeof record.Tempo === 'object') {
    const manual = getFirst(record.Tempo, 'Manual')
    const value = getAttributeValue(manual, 'Value')
    if (value !== null) return Number(value)
  }

  for (const key of Object.keys(record)) {
    const found = findTempoRecursive(record[key])
    if (found !== null) return found
  }
  return null
}

function findLiveSet(root: Record<string, unknown>): Record<string, unknown> | null {
  const direct = getFirst(root, 'LiveSet')
  if (direct && typeof direct === 'object') return direct as Record<string, unknown>
  const ableton = getFirst(root, 'Ableton')
  if (ableton && typeof ableton === 'object') {
    const liveSet = getFirst(ableton, 'LiveSet')
    if (liveSet && typeof liveSet === 'object') return liveSet as Record<string, unknown>
  }
  return null
}

function getFirst(node: unknown, key: string): unknown {
  if (!node || typeof node !== 'object') return null
  const record = node as Record<string, unknown>
  const value = record[key]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function getAttributeValue(node: unknown, key: string): number | string | null {
  if (!node || typeof node !== 'object') return null
  const record = node as Record<string, unknown>
  const value = record[key]
  if (value === null || value === undefined) return null
  return value as number | string
}
