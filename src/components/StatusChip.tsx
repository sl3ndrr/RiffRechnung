import { useLayoutEffect, useState, type ReactNode } from 'react'

// Crossfade the old colour layer; no colour/background interpolation.
export function StatusChip({ status, children, className = '' }: { status: string; children: ReactNode; className?: string }) {
  const [appearance, setAppearance] = useState({ status, previous: '' })
  if (appearance.status !== status) setAppearance({ status, previous: appearance.status })
  useLayoutEffect(() => {
    if (!appearance.previous) return
    const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-fast')) || 0
    const timer = window.setTimeout(() => setAppearance((current) => ({ ...current, previous: '' })), duration)
    return () => window.clearTimeout(timer)
  }, [appearance.previous, status])
  return <span className={`status-chip status-chip--${status} ${className}`}>
    <span className="status-chip__label">{children}</span>
    {appearance.previous && <span key={status} aria-hidden="true" className={`status-chip__previous status-chip--${appearance.previous}`} />}
  </span>
}
