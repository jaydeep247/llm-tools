import { Info, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface SectionHeaderProps {
  /** Lucide icon rendered in a pill */
  icon?: LucideIcon
  title: string
  description?: string
  /** Right-side CTA */
  action?: ReactNode
  className?: string
}

/**
 * Reusable section heading — Nexus light theme variant.
 */
export function SectionHeader({ icon: Icon, title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div
            className="shrink-0 p-2 rounded-xl border bg-(--nd-purple-subtle,#EEEDFC) border-(--nd-border,#E8E9EF)"
          >
            <Icon className="w-5 h-5 text-(--nd-purple,#5347CE)" />
          </div>
        )}
        <div className="min-w-0">
          <h3
            className="text-base sm:text-lg font-semibold truncate text-(--nd-text-primary,#1A1D2B)"
          >
            {title}
          </h3>
          {description && (
            <p className="text-xs mt-0.5 text-(--nd-text-secondary,#6B7188)">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Compact card-header variant — Nexus light theme */
export function CardHeader({
  title,
  description,
  onAction,
  actionLabel = 'View all →',
  actionIcon: ActionIcon,
  actionSlot,
  className,
}: {
  title: string
  description?: string
  onAction?: () => void
  actionLabel?: string
  actionIcon?: LucideIcon
  actionSlot?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-5 py-3.5 border-b border-(--nd-border,#E8E9EF)',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h3
            className="text-sm font-semibold text-(--nd-text-primary,#1A1D2B)"
          >
            {title}
          </h3>
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center transition-colors focus:outline-none shrink-0 cursor-help text-(--nd-text-muted,#9DA3B3)"
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
                className="max-w-57.5 bg-white border border-(--nd-border,#E8E9EF) text-(--nd-text-primary,#1A1D2B) text-[11px] leading-relaxed rounded-xl px-3 py-2.5 shadow-lg"
              >
                {description}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {actionSlot ? (
        <div className="shrink-0 flex items-center gap-2">{actionSlot}</div>
      ) : onAction ? (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer hover:underline shrink-0 text-(--nd-purple,#5347CE)"
        >
          {actionLabel}
          {ActionIcon && <ActionIcon className="w-3.5 h-3.5" />}
        </button>
      ) : null}
    </div>
  )
}
