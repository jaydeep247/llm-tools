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
      <div className="inline-flex rounded-xl border border-zinc-800 bg-[#0F0F11] p-1">
        <button
          type="button"
          onClick={() => set('7d')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            preset === '7d' ? 'bg-yellow-400 text-black' : 'text-zinc-400 hover:text-white',
          )}
        >
          7 Days
        </button>
        <button
          type="button"
          onClick={() => set('30d')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            preset === '30d' ? 'bg-yellow-400 text-black' : 'text-zinc-400 hover:text-white',
          )}
        >
          30 Days
        </button>
      </div>
    </div>
  )
}

