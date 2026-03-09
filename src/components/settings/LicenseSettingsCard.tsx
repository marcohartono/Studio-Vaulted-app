import { useState } from 'react'
import { useLicense } from '../../hooks/useLicense'

export function LicenseSettingsCard() {
  const { plan, activatedKey, activate, deactivate } = useLicense()
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const handleActivate = async () => {
    const trimmed = keyInput.trim()
    if (!trimmed) return
    setError(null)
    setSuccess(false)
    setIsBusy(true)
    try {
      const result = await activate(trimmed)
      if (result.success) {
        setSuccess(true)
        setKeyInput('')
      } else {
        setError(result.error ?? 'Activation failed.')
      }
    } finally {
      setIsBusy(false)
    }
  }

  const handleDeactivate = async () => {
    setError(null)
    setSuccess(false)
    setIsBusy(true)
    try {
      await deactivate()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="settings-card">
      <h3>License</h3>

      {plan === 'paid' ? (
        <>
          <p>Studio Vaulted is <strong style={{ color: 'var(--primary-neon)' }}>Unlocked</strong>.</p>
          {activatedKey && (
            <div className="settings-path">{activatedKey}</div>
          )}
          <div className="settings-actions">
            <button className="ghost" onClick={handleDeactivate} disabled={isBusy}>
              {isBusy ? 'Working...' : 'Deactivate License'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Enter your license key to unlock all features.</p>
          <div className="license-key-row">
            <input
              type="text"
              placeholder="SVL-XXXXXXXX-YYYYYYYY"
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value)
                setError(null)
                setSuccess(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleActivate()
              }}
              spellCheck={false}
              autoComplete="off"
            />
            <button onClick={handleActivate} disabled={isBusy || !keyInput.trim()}>
              {isBusy ? 'Activating...' : 'Activate'}
            </button>
          </div>
          {error && <p className="license-key-error">{error}</p>}
          {success && <p className="license-key-success">License activated. Studio Vaulted is now Unlocked.</p>}
        </>
      )}
    </section>
  )
}
