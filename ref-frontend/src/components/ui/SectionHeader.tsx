import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface SectionHeaderProps {
  /** Lucide icon rendered in a pill */
  icon?: LucideIcon
  title: string
  description?: string
  /** Right-side CTA */
  action?: React.ReactNode
  className?: string
}

/**
 * Reusable section heading — icon pill + title + description + optional action.
 * Matches the pattern used in 15+ module components across module_C, module_E,
 * module_F, and crawl components.
 */
export function SectionHeader({ icon: Icon, title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="shrink-0 p-2 rounded-xl bg-white/10 border border-white/10">
            <Icon className="w-5 h-5 text-zinc-300" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-white truncate">{title}</h3>
          {description && <p className="text-xs text-white/60 mt-0.5">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Compact card-header variant — title + border-b divider + optional action link */
export function CardHeader({
  title,
  onAction,
  actionLabel = 'View all →',
  className,
}: {
  title: string
  onAction?: () => void
  actionLabel?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/60',
        className,
      )}
    >
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      {onAction && (
        <button
          onClick={onAction}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer font-medium"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
