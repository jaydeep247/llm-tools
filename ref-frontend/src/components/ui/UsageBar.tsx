import { cn } from '@/lib/utils'

export interface UsageBarProps {
  /** Percentage 0–100 */
  value: number
  /** e.g. "65% of 40K monthly limit" */
  caption?: string
  /** Tailwind bg color class — defaults to bg-white/60 */
  fillClass?: string
  className?: string
}

/**
 * Thin labeled progress bar used for resource usage stats across
 * dashboard/page.tsx and dashboard/usage/page.tsx.
 */
export function UsageBar({ value, caption, fillClass = 'bg-white/60', className }: UsageBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('space-y-1', className)}>
      <div className="w-full bg-zinc-800/50 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', fillClass)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {caption && <p className="text-[10px] text-zinc-500">{caption}</p>}
    </div>
  )
}
