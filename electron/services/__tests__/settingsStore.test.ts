import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  writeSettingsAtomicForPath,
} from '../settingsStore'

test('normalizeSettings applies defaults and sanitizes roots', () => {
  const next = normalizeSettings({
    projectRootDir: '/Users/test/Music',
    scanSubfolders: false,
    recentProjectRoots: ['/tmp/a', '/tmp/a', '', 42],
  })
  assert.equal(next.scanSubfolders, false)
  assert.equal(next.projectRootDir, path.resolve('/Users/test/Music'))
  assert.deepEqual(next.recentProjectRoots, [
    path.resolve('/Users/test/Music'),
    path.resolve('/tmp/a'),
  ])
  assert.deepEqual(next.templateRootDirs, [])
  assert.equal(next.scanTemplateSubfolders, true)
  assert.deepEqual(next.recentTemplatePaths, [])
})

test('normalizeSettings fallback on invalid payload', () => {
  const next = normalizeSettings(null)
  assert.deepEqual(next, DEFAULT_SETTINGS)
})

test('writeSettingsAtomicForPath writes JSON file', async () => {
  const base = await fs.mkdtemp(path.join(tmpdir(), 'sv-settings-test-'))
  const filePath = path.join(base, 'settings.json')
  await writeSettingsAtomicForPath(filePath, {
    projectRootDir: '/tmp/music',
    scanSubfolders: true,
    lastScanAt: null,
    recentProjectRoots: ['/tmp/music'],
    templateRootDirs: ['/tmp/templates'],
    scanTemplateSubfolders: true,
    recentTemplatePaths: ['/tmp/templates/Default.als'],
    newProjectDefaults: {
      createStandardFolders: true,
      openAfterCreate: false,
      lastUsedTemplatePath: '/tmp/templates/Default.als',
    },
  })
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as { projectRootDir: string }
  assert.equal(parsed.projectRootDir, '/tmp/music')
})
