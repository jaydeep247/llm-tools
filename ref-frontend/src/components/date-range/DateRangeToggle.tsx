'use client'

import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectDateRangePreset, setPreset, type DateRangePreset } from '@/store/slices/dateRangeSlice'

export function DateRangeToggle({ className }: { className?: string }) {
  const dispatch = useAppDispatch()
  const preset = useAppSelector((s: any) => selectDateRangePreset(s))

  const set = (p: DateRangePreset) => dispatch(setPreset(p))

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="inline-flex rounded-xl p-1"
        style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}
      >
        <button
          type="button"
          onClick={() => set('7d')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
            preset === '7d'
              ? 'shadow-sm'
              : 'hover:opacity-80',
          )}
          style={{
            background: preset === '7d' ? 'var(--nd-purple)' : 'transparent',
            color: preset === '7d' ? '#ffffff' : 'var(--nd-text-secondary)',
          }}
        >
          7 Days
        </button>
        <button
          type="button"
          onClick={() => set('30d')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
            preset === '30d'
              ? 'shadow-sm'
              : 'hover:opacity-80',
          )}
          style={{
            background: preset === '30d' ? 'var(--nd-purple)' : 'transparent',
            color: preset === '30d' ? '#ffffff' : 'var(--nd-text-secondary)',
          }}
        >
          30 Days
        </button>
      </div>
    </div>
  )
}

