import { useMemo, useState } from 'react'
import { CreationModeToggle } from './CreationModeToggle'
import { SaveLocationField } from './SaveLocationField'
import { TemplatePicker } from './TemplatePicker'
import { TemplateCustomizationPanel } from './TemplateCustomizationPanel'

export type StartNewProjectFormState = {
  projectName: string
  saveTo: string
  dawFormat: 'als' | 'flp' | 'ptx'
  folderId?: string | null
  initialStatus: 'Idea' | 'Potential' | 'Finished'
  creationMode: 'blank' | 'template'
  selectedTemplatePath?: string | null
  selectedTemplateName?: string | null
  createStandardFolders: boolean
  openAfterCreate: boolean
  rememberRecentTemplate: boolean
  saveAsDefaults: boolean
  projectTypeLabel?: string | null
}

type StartNewProjectModalProps = {
  value: StartNewProjectFormState
  projectRootOptions: string[]
  folderOptions: Array<{ id: string; name: string }>
  templates: TemplateRecord[]
  templatesLoading: boolean
  onChange: (next: StartNewProjectFormState) => void
  onCancel: () => void
  onSubmit: () => Promise<void>
  onChooseSaveDirectory: () => Promise<void>
  onRefreshTemplates: () => Promise<void>
  onChooseTemplateFolder: () => Promise<void>
  onOpenSettings: () => void
  submitting: boolean
  error: string | null
}

const DAW_FORMAT_OPTIONS = [
  { value: 'als', label: 'Ableton Live (.als)' },
  { value: 'flp', label: 'FL Studio (.flp)' },
  { value: 'ptx', label: 'Pro Tools (.ptx)' },
] as const

export function StartNewProjectModal({
  value,
  projectRootOptions,
  folderOptions,
  templates,
  templatesLoading,
  onChange,
  onCancel,
  onSubmit,
  onChooseSaveDirectory,
  onRefreshTemplates,
  onChooseTemplateFolder,
  onOpenSettings,
  submitting,
  error,
}: StartNewProjectModalProps) {
  const [templateQuery, setTemplateQuery] = useState('')

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.sourcePath === value.selectedTemplatePath) ?? null,
    [templates, value.selectedTemplatePath],
  )

  const isValid = Boolean(value.projectName.trim()) &&
    Boolean(value.saveTo.trim()) &&
    (value.creationMode === 'blank' || Boolean(value.selectedTemplatePath))
  const validationError = !value.projectName.trim()
    ? 'Project name is required.'
    : !value.saveTo.trim()
      ? 'Save location is required.'
      : value.creationMode === 'template' && !value.selectedTemplatePath
        ? 'Select a template to continue.'
        : null

  const canSubmit = isValid && !submitting

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card project-create-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Start New Project</h3>

        <CreationModeToggle
          value={value.creationMode}
          onChange={(creationMode) => {
            const nextFormat = creationMode === 'template' ? 'als' : value.dawFormat
            onChange({ ...value, creationMode, dawFormat: nextFormat })
          }}
        />

        <label>
          Project Name
          <input
            type="text"
            value={value.projectName}
            onChange={(event) => onChange({ ...value, projectName: event.target.value })}
            placeholder="My New Track"
          />
        </label>

        <SaveLocationField
          value={value.saveTo}
          options={projectRootOptions}
          onChange={(saveTo) => onChange({ ...value, saveTo })}
          onBrowse={onChooseSaveDirectory}
        />

        <label>
          DAW Format
          <select
            value={value.dawFormat}
            onChange={(event) =>
              onChange({
                ...value,
                dawFormat: event.target.value as 'als' | 'flp' | 'ptx',
              })
            }
            disabled={value.creationMode === 'template'}
          >
            {DAW_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Folder
          <select
            value={value.folderId ?? ''}
            onChange={(event) => onChange({ ...value, folderId: event.target.value })}
          >
            {folderOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Initial Status
          <select
            value={value.initialStatus}
            onChange={(event) =>
              onChange({
                ...value,
                initialStatus: event.target.value as 'Idea' | 'Potential' | 'Finished',
              })
            }
          >
            <option value="Idea">Idea</option>
            <option value="Potential">Potential</option>
            <option value="Finished">Finished</option>
          </select>
        </label>

        {value.creationMode === 'template' && (
          <section className="template-mode-section">
            <div className="template-mode-header">
              <h4>Template Selection</h4>
              <div className="template-mode-actions">
                <button type="button" className="ghost" onClick={() => void onRefreshTemplates()}>
                  Refresh Templates
                </button>
                <button type="button" className="ghost" onClick={() => void onChooseTemplateFolder()}>
                  Manage Template Folders
                </button>
              </div>
            </div>

            {templates.length === 0 && !templatesLoading ? (
              <div className="template-empty-state">
                <p>No Ableton templates found. Add a template folder in Settings.</p>
                <div className="empty-state-actions">
                  <button type="button" className="ghost" onClick={onOpenSettings}>
                    Open Settings
                  </button>
                  <button type="button" className="ghost" onClick={() => void onChooseTemplateFolder()}>
                    Choose Folder
                  </button>
                </div>
              </div>
            ) : (
              <>
                <TemplatePicker
                  templates={templates}
                  query={templateQuery}
                  selectedTemplatePath={value.selectedTemplatePath ?? null}
                  onQueryChange={setTemplateQuery}
                  onSelectTemplate={(template) =>
                    onChange({
                      ...value,
                      selectedTemplatePath: template.sourcePath,
                      selectedTemplateName: template.displayName,
                      dawFormat: 'als',
                    })
                  }
                  isLoading={templatesLoading}
                />
                <TemplateCustomizationPanel
                  selectedTemplateName={selectedTemplate?.displayName ?? value.selectedTemplateName ?? null}
                  selectedTemplatePath={selectedTemplate?.sourcePath ?? value.selectedTemplatePath ?? null}
                  projectTypeLabel={value.projectTypeLabel ?? ''}
                  createStandardFolders={value.createStandardFolders}
                  openAfterCreate={value.openAfterCreate}
                  rememberRecentTemplate={value.rememberRecentTemplate}
                  saveAsDefaults={value.saveAsDefaults}
                  onProjectTypeLabelChange={(projectTypeLabel) =>
                    onChange({ ...value, projectTypeLabel })
                  }
                  onCreateStandardFoldersChange={(createStandardFolders) =>
                    onChange({ ...value, createStandardFolders })
                  }
                  onOpenAfterCreateChange={(openAfterCreate) => onChange({ ...value, openAfterCreate })}
                  onRememberRecentTemplateChange={(rememberRecentTemplate) =>
                    onChange({ ...value, rememberRecentTemplate })
                  }
                  onSaveAsDefaultsChange={(saveAsDefaults) => onChange({ ...value, saveAsDefaults })}
                />
              </>
            )}
          </section>
        )}

        {error ? <p className="error">{error}</p> : validationError ? <p className="error">{validationError}</p> : null}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!canSubmit} onClick={() => void onSubmit()}>
            {submitting ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
