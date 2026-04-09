'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Eye, CheckCircle, BellOff, X, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AlertItem, AlertSeverity } from '@/store/api/alertsApi'
import {
  useDismissAlertMutation,
  useResolveAlertMutation,
  useSnoozeAlertMutation,
} from '@/store/api/alertsApi'

interface AlertCardProps {
  alert: AlertItem
  onNavigate?: (tab: string) => void
}

const SEVERITY_STYLES: Record<AlertSeverity, {
  border: string
  pill: string
  pillText: string
  label: string
}> = {
  critical: {
    border: 'border-l-red-500',
    pill: 'bg-red-500/15 border border-red-500/30 text-red-400',
    pillText: 'CRITICAL',
    label: 'text-red-400',
  },
  high: {
    border: 'border-l-orange-400',
    pill: 'bg-orange-500/15 border border-orange-500/30 text-orange-400',
    pillText: 'HIGH',
    label: 'text-orange-400',
  },
  medium: {
    border: 'border-l-amber-400',
    pill: 'bg-amber-500/15 border border-amber-500/30 text-amber-400',
    pillText: 'MEDIUM',
    label: 'text-amber-400',
  },
  info: {
    border: 'border-l-zinc-500',
    pill: 'bg-zinc-700/40 border border-zinc-600/40 text-zinc-400',
    pillText: 'INFO',
    label: 'text-zinc-400',
  },
}

const TYPE_LABELS: Record<string, string> = {
  score_drop: 'AIVS Score Drop',
  citation_loss: 'Citation Drop',
  crawl_fail: 'Crawl Failure',
  competitor_citation_gain: 'Competitor Gain',
  schema_error: 'Schema Error',
  prompt_zero_visibility: 'Zero Visibility',
  sov_drop: 'SOV Drop',
  competitor_new_page: 'New Competitor',
}

export function AlertCard({ alert, onNavigate }: AlertCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const [dismissAlert] = useDismissAlertMutation()
  const [resolveAlert] = useResolveAlertMutation()
  const [snoozeAlert] = useSnoozeAlertMutation()

  if (dismissed) return null

  const styles = SEVERITY_STYLES[alert.severity]
  const typeLabel = TYPE_LABELS[alert.alert_type] ?? alert.alert_type

  const handleDismiss = () => {
    setDismissed(true)
    dismissAlert(alert.id)
  }

  const handleResolve = () => {
    resolveAlert(alert.id)
    setDismissed(true)
  }

  const handleSnooze = () => {
    snoozeAlert({ alertId: alert.id, days: 7 })
    setDismissed(true)
  }

  const daysUnresolved = alert.days_unresolved

  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-800 bg-[#111113] border-l-4 overflow-hidden transition-all duration-200',
        styles.border,
      )}
    >
      {/* Header row */}
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Severity + type */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', styles.pill)}>
            {styles.pillText}
          </span>
          <span className="text-[11px] text-zinc-500">{typeLabel}</span>
        </div>

        {/* Message */}
        <p className="flex-1 text-[13px] text-zinc-200 leading-snug min-w-0">{alert.message}</p>

        {/* Expand toggle (not info) */}
        {alert.severity !== 'info' && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            {expanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Tags + timestamp row */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        {alert.affected_metric && (
          <span className="text-[10px] bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 px-2 py-0.5 rounded-full">
            {alert.affected_metric}
          </span>
        )}
        {alert.affected_model && (
          <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">
            {alert.affected_model}
          </span>
        )}

        {/* Days unresolved badge */}
        {daysUnresolved >= 3 && (
          <span
            className={cn(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full border ml-auto',
              daysUnresolved >= 7
                ? 'bg-red-500/15 border-red-500/30 text-red-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400',
            )}
          >
            ONGOING — {daysUnresolved} day{daysUnresolved !== 1 ? 's' : ''}
          </span>
        )}

        <span className="text-[10px] text-zinc-600 ml-auto">
          {new Date(alert.triggered_at).toLocaleDateString()}
        </span>
      </div>

      {/* Expanded recommendation */}
      {expanded && alert.recommendation && (
        <div className="px-4 pb-3 border-t border-zinc-800/60 pt-3">
          <p className="text-[12px] text-zinc-400 leading-relaxed">{alert.recommendation}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap border-t border-zinc-800/40 pt-2.5">
        {alert.severity !== 'info' && (
          <button
            onClick={() => onNavigate?.(alert.alert_type === 'schema_error' ? 'structured-data' : 'priority-alerts')}
            className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/40 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <Eye className="h-3 w-3" />
            View Details
          </button>
        )}
        {alert.severity !== 'info' && (
          <button
            onClick={handleResolve}
            className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <CheckCircle className="h-3 w-3" />
            Mark Resolved
          </button>
        )}
        {alert.severity !== 'info' && (
          <button
            onClick={handleSnooze}
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 bg-zinc-800/40 hover:bg-zinc-700/40 border border-zinc-700/30 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <Clock className="h-3 w-3" />
            Snooze 7 Days
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded-lg transition-colors cursor-pointer ml-auto"
        >
          <X className="h-3 w-3" />
          Dismiss
        </button>
      </div>
    </div>
  )
}
