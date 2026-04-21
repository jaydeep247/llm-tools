'use client'

import { useState } from 'react'
import { X, AlertCircle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AlertItem } from '@/store/api/alertsApi'
import { useDismissAlertMutation } from '@/store/api/alertsApi'

interface AlertBannerProps {
  alerts: AlertItem[]
  onNavigate?: (tab: string) => void
}

export function AlertBanner({ alerts, onNavigate }: AlertBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [dismissAlert] = useDismissAlertMutation()

  const criticals = alerts.filter(
    (a) => a.severity === 'critical' && a.is_active && !dismissedIds.has(a.id),
  )

  if (criticals.length === 0) return null

  const top = criticals[0]

  const handleDismiss = () => {
    setDismissedIds((prev) => new Set(prev).add(top.id))
    dismissAlert(top.id)
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3 animate-fade-in">
      <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-800 leading-snug">{top.message}</p>
        {top.recommendation && (
          <p className="text-xs text-red-600 mt-0.5 leading-relaxed">{top.recommendation}</p>
        )}
        {criticals.length > 1 && (
          <p className="text-[11px] text-red-500 mt-1">
            +{criticals.length - 1} more critical alert{criticals.length - 1 !== 1 ? 's' : ''}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onNavigate?.('priority-alerts')}
          className="flex items-center gap-1 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          Fix Now
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 text-red-400 hover:text-red-600 rounded transition-colors cursor-pointer"
          title="Dismiss for this session"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
