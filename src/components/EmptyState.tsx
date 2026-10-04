import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state motion-fade">
      <div className="empty-state__orb"><Icon aria-hidden="true" /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
