import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { cleanTemplateDisplayName, discoverTemplates } from '../templateDiscovery'

test('cleanTemplateDisplayName strips extension and Ableton timestamp suffix', () => {
  assert.equal(cleanTemplateDisplayName('House Starter [2025 11 27 015200].als'), 'House Starter')
  assert.equal(cleanTemplateDisplayName('Simple Template.als'), 'Simple Template')
})

test('discoverTemplates scans roots, dedupes paths, and ignores hidden directories', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'sv-template-discovery-'))
  const userTemplates = path.join(root, 'templates')
  const nested = path.join(userTemplates, 'Ideas')
  await fs.mkdir(nested, { recursive: true })
  await fs.mkdir(path.join(userTemplates, '.hidden'), { recursive: true })

  const alpha = path.join(userTemplates, 'Alpha.als')
  const beta = path.join(nested, 'Beta [2025 11 27 015200].als')
  const hidden = path.join(userTemplates, '.hidden', 'Ignored.als')
  await fs.writeFile(alpha, '')
  await fs.writeFile(beta, '')
  await fs.writeFile(hidden, '')

  const templates = await discoverTemplates({
    templateRootDirs: [userTemplates, userTemplates],
    scanTemplateSubfolders: true,
    recentTemplatePaths: [beta],
  })

  assert.equal(templates.length, 2)
  assert.equal(templates[0].sourcePath, beta)
  assert.equal(templates[0].displayName, 'Beta')
  assert.ok(templates.some((item) => item.sourcePath === alpha))
  assert.ok(!templates.some((item) => item.sourcePath === hidden))
})
