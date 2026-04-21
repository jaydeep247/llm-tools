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
 * Light panel with accent header — Nexus theme.
 * Uses CSS vars so it adapts inside .nexus-dashboard scope.
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
        'rounded-2xl border overflow-hidden transition-all duration-200',
        'hover:shadow-sm',
        className,
      )}
      style={{
        background: 'var(--nd-card-bg, #FFFFFF)',
        borderColor: 'var(--nd-border, #E8E9EF)',
      }}
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
