import { type LucideIcon, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'

type Accent = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan' | 'zinc'

const accentMap: Record<Accent, { iconBg: string; iconText: string; hoverBorder: string }> = {
  blue:    { iconBg: 'bg-[#EEF4FF]',  iconText: 'text-[#4896FE]', hoverBorder: 'hover:border-[#4896FE]/30' },
  emerald: { iconBg: 'bg-emerald-50',  iconText: 'text-emerald-600', hoverBorder: 'hover:border-emerald-200' },
  amber:   { iconBg: 'bg-amber-50',    iconText: 'text-amber-600',   hoverBorder: 'hover:border-amber-200' },
  rose:    { iconBg: 'bg-rose-50',     iconText: 'text-rose-600',    hoverBorder: 'hover:border-rose-200' },
  violet:  { iconBg: 'bg-[#EEEDFC]',   iconText: 'text-[#5347CE]',   hoverBorder: 'hover:border-[#887CFD]/30' },
  cyan:    { iconBg: 'bg-teal-50',     iconText: 'text-[#16C8C7]',   hoverBorder: 'hover:border-[#16C8C7]/30' },
  zinc:    { iconBg: 'bg-[#F5F5FA]',   iconText: 'text-[#6B7188]',   hoverBorder: 'hover:border-[#D0D2DC]' },
}

export interface StatCardProps {
  label: string
  value: string | number
  subtext?: string
  description?: string
  labelAction?: ReactNode
  icon: LucideIcon
  accent?: Accent
  trend?: 'up' | 'down' | 'neutral'
  progress?: number
  delta?: number | null
  deltaLabel?: string
  onClick?: () => void
  className?: string
}

/**
 * Unified stat card — Nexus light theme.
 * Used across dashboard/page.tsx, usage/page.tsx, and module_E/DashboardOverview.tsx.
 */
export function StatCard({
  label,
  value,
  subtext,
  description,
  labelAction,
  icon: Icon,
  accent = 'zinc',
  trend,
  progress,
  delta,
  deltaLabel = 'vs last period',
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
        'group relative overflow-hidden rounded-2xl p-5 text-left border border-(--nd-border,#E8E9EF) bg-(--nd-card-bg,#FFFFFF)',
        'transition-all duration-200 hover:shadow-md',
        s.hoverBorder,
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
            <ArrowUpRight
              className="w-4 h-4 transition-colors text-(--nd-text-muted,#9DA3B3)"
            />
            <FieldTooltip description={description ?? ''} />
          </div>
        )}
      </div>

      {/* Value block */}
      <div className="space-y-1">
        <p
          className="text-2xl sm:text-3xl font-bold tracking-tight text-(--nd-text-primary,#1A1D2B)"
        >
          {value}
        </p>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p
            className="text-xs font-semibold uppercase tracking-wider min-w-0 text-(--nd-text-muted,#9DA3B3)"
          >
            {label}
          </p>
          {labelAction ? <div className="shrink-0">{labelAction}</div> : null}
        </div>
        {subtext && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {trend === 'up'   && <TrendingUp   className="h-3 w-3 text-emerald-500" />}
            {trend === 'down' && <TrendingDown  className="h-3 w-3 text-rose-500" />}
            <p
              className={cn(
                'text-[11px] font-medium',
                trend === 'up'   && 'text-emerald-600',
                trend === 'down' && 'text-rose-600',
                (!trend || trend === 'neutral') && 'text-(--nd-text-muted,#9DA3B3)',
              )}
            >
              {subtext}
            </p>
          </div>
        )}

        {/* Delta badge */}
        {typeof delta !== 'undefined' && (
          <div className="mt-1.5">
            {delta === null ? (
              <span className="text-[10px] text-(--nd-text-muted,#9DA3B3)">
                — no prior data
              </span>
            ) : (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-[11px] font-medium',
                  delta > 0 && 'text-emerald-600',
                  delta < 0 && 'text-rose-600',
                  delta === 0 && 'text-(--nd-text-muted,#9DA3B3)',
                )}
              >
                {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}{' '}
                {delta > 0 ? '+' : ''}{delta.toFixed(1)}%{' '}
                <span className="font-normal text-(--nd-text-muted,#9DA3B3)">
                  {deltaLabel}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Optional progress bar */}
      {progress !== undefined && (
        <div
          className="mt-3 w-full rounded-full h-1.5 overflow-hidden bg-(--nd-bg,#ECEDF3)"
        >
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
