type CreationMode = 'blank' | 'template'

type CreationModeToggleProps = {
  value: CreationMode
  onChange: (mode: CreationMode) => void
}

export function CreationModeToggle({ value, onChange }: CreationModeToggleProps) {
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
        className={value === 'template' ? 'active' : ''}
        onClick={() => onChange('template')}
      >
        Create from Template
      </button>
    </div>
  )
}
