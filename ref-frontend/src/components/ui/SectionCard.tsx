import { cn } from '@/lib/utils'
import { CardHeader } from '@/components/ui/SectionHeader'

export interface SectionCardProps {
  title: string
  children: React.ReactNode
  onAction?: () => void
  /** Alias for onAction — accepted for compatibility */
  onClick?: () => void
  actionLabel?: string
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
  children,
  onAction,
  onClick,
  actionLabel,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden',
        'transition-all duration-300 hover:border-zinc-700',
        className,
      )}
    >
      <CardHeader title={title} onAction={onAction ?? onClick} actionLabel={actionLabel} />
      <div className={cn('p-5', contentClassName)}>{children}</div>
    </div>
  )
}
