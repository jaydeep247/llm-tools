import { Info, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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
          <div className="shrink-0 p-2 rounded-xl bg-secondary border border-border">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-foreground truncate">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Compact card-header variant — title + border-b divider + optional action link */
export function CardHeader({
  title,
  description,
  onAction,
  actionLabel = 'View all →',
  actionIcon: ActionIcon,
  className,
}: {
  title: string
  description?: string
  onAction?: () => void
  actionLabel?: string
  actionIcon?: LucideIcon
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-5 py-3.5 border-b border-border',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus:outline-none shrink-0 cursor-help"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Section description"
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="start"
                sideOffset={10}
                className="max-w-57.5 bg-card border border-border text-foreground text-[11px] leading-relaxed rounded-2xl px-3 py-2.5"
              >
                {description}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer font-medium shrink-0"
        >
          {actionLabel}
          {ActionIcon && <ActionIcon className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  )
}
