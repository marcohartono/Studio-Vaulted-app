type ProjectRootSettingCardProps = {
  projectRootDir: string | null
  onChooseFolder: () => void
  onReset: () => void
  isBusy?: boolean
}

function shortPathLabel(filePath: string): string {
  const normalized = filePath.split(/[/\\]+/)
  if (normalized.length <= 4) return filePath
  return `.../${normalized.slice(-4).join('/')}`
}

export function ProjectRootSettingCard({
  projectRootDir,
  onChooseFolder,
  onReset,
  isBusy = false,
}: ProjectRootSettingCardProps) {
  return (
    <section className="settings-card">
      <h3>Project Root Folder</h3>
      <p>Studio Vaulted will scan this folder for Ableton projects.</p>
      <div className="settings-path">
        {projectRootDir ? shortPathLabel(projectRootDir) : 'Not set'}
      </div>
      <div className="settings-actions">
        <button className="ghost" onClick={onChooseFolder} disabled={isBusy}>
          {isBusy ? 'Working...' : 'Choose Folder...'}
        </button>
        <button className="ghost" onClick={onReset} disabled={isBusy || !projectRootDir}>
          Reset to default
        </button>
      </div>
    </section>
  )
}
