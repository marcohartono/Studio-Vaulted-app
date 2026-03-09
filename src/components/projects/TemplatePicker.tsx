import { useMemo } from 'react'

type TemplatePickerProps = {
  templates: TemplateRecord[]
  query: string
  selectedTemplatePath: string | null
  onQueryChange: (value: string) => void
  onSelectTemplate: (template: TemplateRecord) => void
  isLoading: boolean
}

export function TemplatePicker({
  templates,
  query,
  selectedTemplatePath,
  onQueryChange,
  onSelectTemplate,
  isLoading,
}: TemplatePickerProps) {
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return templates
    return templates.filter((item) => {
      const label = item.folderLabel ?? ''
      return (
        item.displayName.toLowerCase().includes(needle) ||
        label.toLowerCase().includes(needle) ||
        item.sourcePath.toLowerCase().includes(needle)
      )
    })
  }, [templates, query])

  return (
    <div className="template-picker">
      <label>
        Template Picker
        <input
          type="search"
          placeholder="Search templates..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <div className="template-picker-list" role="listbox" aria-label="Available templates">
        {isLoading ? (
          <div className="template-picker-empty">Loading templates...</div>
        ) : filtered.length === 0 ? (
          <div className="template-picker-empty">No templates match your search.</div>
        ) : (
          filtered.map((template) => (
            <button
              key={template.id}
              type="button"
              role="option"
              aria-selected={selectedTemplatePath === template.sourcePath}
              className={selectedTemplatePath === template.sourcePath ? 'active' : ''}
              onClick={() => onSelectTemplate(template)}
            >
              <span>{template.displayName}</span>
              {template.folderLabel ? <small>{template.folderLabel}</small> : null}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
