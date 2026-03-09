type SaveLocationFieldProps = {
  value: string
  options: string[]
  onChange: (value: string) => void
  onBrowse: () => void
}

export function SaveLocationField({
  value,
  options,
  onChange,
  onBrowse,
}: SaveLocationFieldProps) {
  return (
    <div className="save-location-field">
      <label>
        Save To
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.length === 0 && <option value="">No root configured</option>}
          {options.map((root) => (
            <option key={root} value={root}>
              {root}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="ghost" onClick={onBrowse}>
        Choose Folder
      </button>
    </div>
  )
}
