import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { cleanAbletonDisplayName, scanAbletonProjects } from '../projectScanner'

test('cleanAbletonDisplayName strips Ableton timestamp suffix', () => {
  assert.equal(
    cleanAbletonDisplayName('Track A [2026 03 04 120000]'),
    'Track A',
  )
  assert.equal(cleanAbletonDisplayName('NoSuffix Track'), 'NoSuffix Track')
})

test('scanAbletonProjects respects recursive option and ignored dirs', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'sv-scan-test-'))
  await fs.writeFile(path.join(root, 'TopLevel.als'), '')
  await fs.mkdir(path.join(root, 'nested'))
  await fs.writeFile(path.join(root, 'nested', 'Deep.als'), '')
  await fs.mkdir(path.join(root, '.git'))
  await fs.writeFile(path.join(root, '.git', 'Ignored.als'), '')

  const shallow = await scanAbletonProjects(root, { recursive: false })
  assert.equal(shallow.length, 1)
  assert.ok(shallow[0].filePath.endsWith('TopLevel.als'))

  const deep = await scanAbletonProjects(root, { recursive: true })
  assert.equal(deep.length, 2)
  assert.ok(deep.some((item) => item.filePath.endsWith(path.join('nested', 'Deep.als'))))
  assert.ok(!deep.some((item) => item.filePath.endsWith(path.join('.git', 'Ignored.als'))))
})
