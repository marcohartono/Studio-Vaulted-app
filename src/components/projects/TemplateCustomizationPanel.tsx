type TemplateCustomizationPanelProps = {
  selectedTemplateName: string | null
  selectedTemplatePath: string | null
  projectTypeLabel: string
  createStandardFolders: boolean
  openAfterCreate: boolean
  rememberRecentTemplate: boolean
  saveAsDefaults: boolean
  onProjectTypeLabelChange: (value: string) => void
  onCreateStandardFoldersChange: (checked: boolean) => void
  onOpenAfterCreateChange: (checked: boolean) => void
  onRememberRecentTemplateChange: (checked: boolean) => void
  onSaveAsDefaultsChange: (checked: boolean) => void
}

export function TemplateCustomizationPanel({
  selectedTemplateName,
  selectedTemplatePath,
  projectTypeLabel,
  createStandardFolders,
  openAfterCreate,
  rememberRecentTemplate,
  saveAsDefaults,
  onProjectTypeLabelChange,
  onCreateStandardFoldersChange,
  onOpenAfterCreateChange,
  onRememberRecentTemplateChange,
  onSaveAsDefaultsChange,
}: TemplateCustomizationPanelProps) {
  return (
    <section className="template-customization">
      <h4>Template Customization</h4>

      <div className="template-customization-block">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={createStandardFolders}
            onChange={(event) => onCreateStandardFoldersChange(event.target.checked)}
          />
          <span>Create standard project folders (Samples, Exports, Stems, Notes)</span>
        </label>
      </div>

      <div className="template-customization-block">
        <label>
          Project Type
          <input
            type="text"
            value={projectTypeLabel}
            onChange={(event) => onProjectTypeLabelChange(event.target.value)}
            placeholder="Idea, Mix, Sketch..."
          />
        </label>
        <div className="template-meta-preview">
          <p>Template: {selectedTemplateName ?? 'None selected'}</p>
          <small>{selectedTemplatePath ?? 'No template path selected.'}</small>
        </div>
      </div>

      <div className="template-customization-block">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={openAfterCreate}
            onChange={(event) => onOpenAfterCreateChange(event.target.checked)}
          />
          <span>Open in Ableton after creation</span>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={rememberRecentTemplate}
            onChange={(event) => onRememberRecentTemplateChange(event.target.checked)}
          />
          <span>Remember this template as recently used</span>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={saveAsDefaults}
            onChange={(event) => onSaveAsDefaultsChange(event.target.checked)}
          />
          <span>Save these customization defaults for next time</span>
        </label>
      </div>

      <div className="template-customization-block template-future-placeholder">
        <strong>Future Template Options</strong>
        <small>Reserved for tags, color, BPM, and notes defaults.</small>
      </div>
    </section>
  )
}
