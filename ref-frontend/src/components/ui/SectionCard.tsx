import { cn } from '@/lib/utils'
import { CardHeader } from '@/components/ui/SectionHeader'
import { type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface SectionCardProps {
  title: string
  description?: string
  children: React.ReactNode
  onAction?: () => void
  /** Alias for onAction — accepted for compatibility */
  onClick?: () => void
  actionLabel?: string
  actionIcon?: LucideIcon
  /** Custom right-side header slot (replaces onAction when set) */
  actionSlot?: ReactNode
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
  actionSlot,
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
      <CardHeader
        title={title}
        description={description}
        onAction={actionSlot ? undefined : onAction ?? onClick}
        actionLabel={actionLabel}
        actionIcon={actionIcon}
        actionSlot={actionSlot}
      />
      <div className={cn('p-5', contentClassName)}>{children}</div>
    </div>
  )
}
