import { BrowserWindow } from 'electron'
import { readAbletonBpm } from './abletonBpm'
import { findVersionByPath, updateVersionBpm } from '../db/trackStore'

const MAX_CONCURRENCY = 3
const queue: string[] = []
const queued = new Set<string>()
let active = 0

export function enqueueBpm(keys: string[]): number {
  let added = 0
  for (const key of keys) {
    if (queued.has(key)) continue
    queued.add(key)
    queue.push(key)
    added += 1
  }
  pump()
  return added
}

function pump(): void {
  while (active < MAX_CONCURRENCY && queue.length > 0) {
    const key = queue.shift()
    if (!key) break
    active += 1
    processKey(key)
      .catch(() => undefined)
      .finally(() => {
        active -= 1
        queued.delete(key)
        pump()
      })
  }
}

async function processKey(key: string): Promise<void> {
  const version = await findVersionByPath(key)
  if (!version) return
  if (!version.filePath.toLowerCase().endsWith('.als')) return
  if (version.bpm !== null && version.bpmSource === 'als') return

  const bpm = await readAbletonBpm(version.filePath)
  if (process.env.BPM_DEBUG === '1') {
    console.log('[bpm] queued', version.filePath, '->', bpm)
  }
  const updated = await updateVersionBpm(version.id, bpm, 'auto')
  if (!updated) return

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('bpmUpdated', { id: updated.id, bpm: updated.bpm })
  }
}
