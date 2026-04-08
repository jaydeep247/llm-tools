import { cn } from '@/lib/utils'
import { CardHeader } from '@/components/ui/SectionHeader'
import { type LucideIcon } from 'lucide-react'

export interface SectionCardProps {
  title: string
  description?: string
  children: React.ReactNode
  onAction?: () => void
  /** Alias for onAction — accepted for compatibility */
  onClick?: () => void
  actionLabel?: string
  actionIcon?: LucideIcon
  className?: string
  /** Extra classes for the inner content area */
  contentClassName?: string
}

/**
 * Dark panel with accent header — used across module_E DashboardOverview,
 * crawl components, and any "sub-section" inside a report page.
 */
export function SectionCard({
  title,
  description,
  children,
  onAction,
  onClick,
  actionLabel,
  actionIcon,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card overflow-hidden shadow-sm',
        'transition-all duration-300 hover:shadow-md',
        className,
      )}
    >
      <CardHeader
        title={title}
        description={description}
        onAction={onAction ?? onClick}
        actionLabel={actionLabel}
        actionIcon={actionIcon}
      />
      <div className={cn('p-5', contentClassName)}>{children}</div>
    </div>
  )
}
