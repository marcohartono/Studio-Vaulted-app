import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { createProject } from '../projectFactory'

test('createProject copies template, writes manifest, and creates standard folders', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'sv-project-factory-'))
  const templatePath = path.join(root, 'Template A.als')
  await fs.writeFile(templatePath, 'template-content', 'utf8')

  const result = await createProject(
    {
      projectName: 'My New Track',
      saveTo: root,
      dawFormat: 'als',
      folderId: null,
      initialStatus: 'Idea',
      templateOptions: {
        mode: 'template',
        templatePath,
        templateDisplayName: 'Template A',
        createStandardFolders: true,
        openAfterCreate: false,
        rememberRecentTemplate: true,
        saveAsDefaults: false,
        projectTypeLabel: 'Idea',
      },
    },
    {
      createProjectRecordImpl: async (input) => ({
        track: {
          id: input.projectId,
          groupKey: 'group',
          title: input.projectName,
          latestVersionId: 'version-id',
          rootPath: input.rootPath,
          abletonProjectPath: input.dawProjectPath,
          dawFormat: input.dawFormat,
          creationMode: input.creationMode,
          sourceTemplatePath: input.sourceTemplatePath,
          sourceTemplateName: input.sourceTemplateName,
          projectTypeLabel: input.projectTypeLabel,
          audioPath: null,
          backgroundImagePath: null,
          folderId: input.folderId,
          status: input.status,
          notes: '',
          noteId: null,
          notePreview: null,
          genre: null,
          trashed: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        latestVersion: null,
        versionCount: 1,
      }),
    },
  )

  const projectContent = await fs.readFile(result.projectFilePath, 'utf8')
  assert.equal(projectContent, 'template-content')

  const manifestRaw = await fs.readFile(path.join(result.projectFolderPath, '.studio-vaulted.json'), 'utf8')
  const manifest = JSON.parse(manifestRaw) as { mode: string; templateDisplayName: string }
  assert.equal(manifest.mode, 'template')
  assert.equal(manifest.templateDisplayName, 'Template A')

  for (const folder of ['Samples', 'Exports', 'Stems', 'Notes']) {
    const stat = await fs.stat(path.join(result.projectFolderPath, folder))
    assert.equal(stat.isDirectory(), true)
  }
})

test('createProject uses unique folder naming with parenthetical suffix', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'sv-project-factory-unique-'))
  await fs.mkdir(path.join(root, 'My New Track'), { recursive: true })

  const result = await createProject(
    {
      projectName: 'My New Track',
      saveTo: root,
      dawFormat: 'als',
      folderId: null,
      initialStatus: 'Idea',
      templateOptions: {
        mode: 'blank',
        createStandardFolders: false,
        openAfterCreate: false,
        rememberRecentTemplate: false,
        saveAsDefaults: false,
      },
    },
    {
      createProjectRecordImpl: async (input) => ({
        track: {
          id: input.projectId,
          groupKey: 'group',
          title: input.projectName,
          latestVersionId: 'version-id',
          rootPath: input.rootPath,
          abletonProjectPath: input.dawProjectPath,
          dawFormat: input.dawFormat,
          creationMode: input.creationMode,
          sourceTemplatePath: input.sourceTemplatePath,
          sourceTemplateName: input.sourceTemplateName,
          projectTypeLabel: input.projectTypeLabel,
          audioPath: null,
          backgroundImagePath: null,
          folderId: input.folderId,
          status: input.status,
          notes: '',
          noteId: null,
          notePreview: null,
          genre: null,
          trashed: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        latestVersion: null,
        versionCount: 1,
      }),
    },
  )

  assert.ok(result.projectFolderPath.endsWith('My New Track (1)'))
  assert.ok(result.projectFilePath.endsWith(path.join('My New Track (1)', 'My New Track.als')))
})
