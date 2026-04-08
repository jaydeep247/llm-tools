import { type LucideIcon, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'

type Accent = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan' | 'zinc'

const accentMap: Record<Accent, { iconBg: string; iconText: string; hoverBorder: string; hoverGlow: string }> = {
  blue:    { iconBg: 'bg-blue-50',    iconText: 'text-blue-600',    hoverBorder: 'hover:border-blue-500/30',    hoverGlow: 'group-hover:shadow-blue-500/10' },
  emerald: { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', hoverBorder: 'hover:border-emerald-500/30', hoverGlow: 'group-hover:shadow-emerald-500/10' },
  amber:   { iconBg: 'bg-amber-50',   iconText: 'text-amber-600',   hoverBorder: 'hover:border-amber-500/30',   hoverGlow: 'group-hover:shadow-amber-500/10' },
  rose:    { iconBg: 'bg-rose-50',    iconText: 'text-rose-600',    hoverBorder: 'hover:border-rose-500/30',    hoverGlow: 'group-hover:shadow-rose-500/10' },
  violet:  { iconBg: 'bg-violet-50',  iconText: 'text-violet-600',  hoverBorder: 'hover:border-violet-500/30',  hoverGlow: 'group-hover:shadow-violet-500/10' },
  cyan:    { iconBg: 'bg-cyan-50',    iconText: 'text-cyan-600',    hoverBorder: 'hover:border-cyan-500/30',    hoverGlow: 'group-hover:shadow-cyan-500/10' },
  zinc:    { iconBg: 'bg-secondary',   iconText: 'text-muted-foreground', hoverBorder: 'hover:border-border',       hoverGlow: 'group-hover:shadow-sm' },
}

export interface StatCardProps {
  label: string
  value: string | number
  subtext?: string
  /** Tooltip shown next to the top-right arrow icon */
  description?: string
  icon: LucideIcon
  accent?: Accent
  trend?: 'up' | 'down' | 'neutral'
  /** Renders a thin progress bar below the value */
  progress?: number
  onClick?: () => void
  className?: string
}

/**
 * Unified stat card used across dashboard/page.tsx, usage/page.tsx,
 * and module_E/DashboardOverview.tsx.
 */
export function StatCard({
  label,
  value,
  subtext,
  description,
  icon: Icon,
  accent = 'zinc',
  trend,
  progress,
  onClick,
  className,
}: StatCardProps) {
  const s = accentMap[accent]

  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-2xl bg-card border border-border p-5 text-left shadow-sm',
        'transition-all duration-300 hover:border-border hover:shadow-md',
        s.hoverBorder,
        s.hoverGlow,
        onClick && 'cursor-pointer w-full',
        className,
      )}
    >
      {/* Icon row */}
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', s.iconBg)}>
          <Icon className={cn('h-5 w-5', s.iconText)} />
        </div>
        {onClick && (
          <div className="flex items-center gap-1">
            <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            <FieldTooltip description={description ?? ''} />
          </div>
        )}
      </div>

      {/* Value block */}
      <div className="space-y-1">
        <p className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{value}</p>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        {subtext && (
          <div className="flex items-center gap-1.5 mt-2">
            {trend === 'up'   && <TrendingUp   className="h-3 w-3 text-emerald-600" />}
            {trend === 'down' && <TrendingDown  className="h-3 w-3 text-rose-600" />}
            <p
              className={cn(
                'text-[11px]',
                trend === 'up'   && 'text-emerald-600',
                trend === 'down' && 'text-rose-600',
                (!trend || trend === 'neutral') && 'text-muted-foreground',
              )}
            >
              {subtext}
            </p>
          </div>
        )}
      </div>

      {/* Optional progress bar */}
      {progress !== undefined && (
        <div className="mt-3 w-full bg-secondary rounded-full h-1.5 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', s.iconText.replace('text-', 'bg-'))}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </Tag>
  )
}

/** Four-column responsive grid wrapper */
export function StatCardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4', className)}>
      {children}
    </div>
  )
}
