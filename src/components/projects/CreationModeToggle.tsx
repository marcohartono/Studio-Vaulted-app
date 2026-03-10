type CreationMode = 'blank' | 'template'

type CreationModeToggleProps = {
  value: CreationMode
  canUseTemplates: boolean
  onChange: (mode: CreationMode) => void
}

export function CreationModeToggle({ value, canUseTemplates, onChange }: CreationModeToggleProps) {
  return (
    <div className="creation-mode-toggle" role="tablist" aria-label="Creation mode">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'blank'}
        className={value === 'blank' ? 'active' : ''}
        onClick={() => onChange('blank')}
      >
        Blank Project
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'template'}
        className={`${value === 'template' ? 'active' : ''} ${!canUseTemplates ? 'locked' : ''}`}
        disabled={!canUseTemplates}
        title={!canUseTemplates ? 'Templates require a license' : undefined}
        onClick={() => onChange('template')}
      >
        Create from Template {!canUseTemplates && '🔒'}
      </button>
    </div>
  )
}
