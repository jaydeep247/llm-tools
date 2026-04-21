import { cn } from '@/lib/utils'

export interface UsageBarProps {
  /** Percentage 0–100 */
  value: number
  /** e.g. "65% of 40K monthly limit" */
  caption?: string
  /** Tailwind bg color class — defaults to nd-purple fill */
  fillClass?: string
  className?: string
}

/**
 * Thin labeled progress bar — Nexus light theme.
 * Uses CSS vars so it adapts inside .nexus-dashboard.
 */
export function UsageBar({ value, caption, fillClass, className }: UsageBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('space-y-1', className)}>
      <div
        className="w-full rounded-full h-1.5 overflow-hidden bg-(--nd-bg,#ECEDF3)"
      >
        {fillClass ? (
          <div
            className={cn('h-full rounded-full transition-all duration-700', fillClass)}
            style={{ width: `${clamped}%` }}
          />
        ) : (
          <div
            className="h-full rounded-full transition-all duration-700 bg-(--nd-purple,#5347CE)"
            style={{
              width: `${clamped}%`,
            }}
          />
        )}
      </div>
      {caption && (
        <p className="text-[10px] text-(--nd-text-muted,#9DA3B3)">
          {caption}
        </p>
      )}
    </div>
  )
}
