import { useLicense } from '../../hooks/useLicense'

export function PlanBadge() {
  const { plan, activatedKey, isLoading } = useLicense()

  if (isLoading) return null

  if (plan === 'paid') {
    return (
      <div className="plan-badge plan-badge--paid">
        <div className="plan-badge__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
        </div>
        <div className="plan-badge__text">
          <span className="plan-badge__label">Studio Vaulted</span>
          <span className="plan-badge__tier">Unlocked</span>
          {activatedKey && (
            <span className="plan-badge__key">{activatedKey}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="plan-badge plan-badge--free">
      <div className="plan-badge__icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <div className="plan-badge__text">
        <span className="plan-badge__label">Studio Vaulted</span>
        <span className="plan-badge__tier">Locked</span>
      </div>
      <button
        className="plan-badge__upgrade"
        onClick={() => window.open('https://studiovaulted.com/upgrade', '_blank')}
      >
        Upgrade
      </button>
    </div>
  )
}
