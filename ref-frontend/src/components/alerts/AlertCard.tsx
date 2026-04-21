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
}> = {
  critical: {
    border: 'border-l-red-500',
    pill: 'bg-red-50 border border-red-200 text-red-700',
    pillText: 'CRITICAL',
  },
  high: {
    border: 'border-l-orange-500',
    pill: 'bg-orange-50 border border-orange-200 text-orange-700',
    pillText: 'HIGH',
  },
  medium: {
    border: 'border-l-amber-400',
    pill: 'bg-amber-50 border border-amber-200 text-amber-700',
    pillText: 'MEDIUM',
  },
  info: {
    border: 'border-l-zinc-300',
    pill: 'bg-zinc-100 border border-zinc-200 text-zinc-600',
    pillText: 'INFO',
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

// Navigate to the right module based on alert type
function resolveAlertNav(alertType: string): string {
  switch (alertType) {
    case 'schema_error': return 'structured-data'
    case 'score_drop': return 'ai-visibility-scorecards'
    case 'citation_loss': return 'prompt-opportunities'
    case 'sov_drop': return 'share-of-voice'
    case 'competitor_citation_gain':
    case 'competitor_new_page': return 'competitor-reports'
    case 'crawl_fail': return 'crawler'
    case 'prompt_zero_visibility': return 'keyword-intelligence'
    default: return 'priority-alerts'
  }
}

export function AlertCard({ alert, onNavigate }: AlertCardProps) {
  const [expanded, setExpanded] = useState(false)
  // Optimistic local state — UI updates immediately, API confirms async
  const [localState, setLocalState] = useState<'active' | 'resolving' | 'snoozed' | 'dismissed'>('active')
  const [snoozeDate, setSnoozeDate] = useState<string | null>(null)

  const [dismissAlert, { isLoading: isDismissing }] = useDismissAlertMutation()
  const [resolveAlert, { isLoading: isResolving }] = useResolveAlertMutation()
  const [snoozeAlert, { isLoading: isSnoozing }] = useSnoozeAlertMutation()

  // Already handled — don't render
  if (localState === 'dismissed') return null

  const styles = SEVERITY_STYLES[alert.severity]
  const typeLabel = TYPE_LABELS[alert.alert_type] ?? alert.alert_type
  const daysUnresolved = alert.days_unresolved

  // Optimistic dismiss — hide immediately, fire API async, no revert (best-effort)
  const handleDismiss = () => {
    setLocalState('dismissed')
    dismissAlert(alert.id)
  }

  // Optimistic resolve — show resolved state immediately
  const handleResolve = async () => {
    setLocalState('resolving')
    try {
      await resolveAlert(alert.id).unwrap()
    } catch {
      // revert on failure
      setLocalState('active')
    }
  }

  // Optimistic snooze — hide and show snooze confirmation
  const handleSnooze = async () => {
    const snoozeUntil = new Date()
    snoozeUntil.setDate(snoozeUntil.getDate() + 7)
    setSnoozeDate(snoozeUntil.toLocaleDateString())
    setLocalState('snoozed')
    try {
      await snoozeAlert({ alertId: alert.id, days: 7 }).unwrap()
    } catch {
      setLocalState('active')
      setSnoozeDate(null)
    }
  }

  // Resolved state display
  if (localState === 'resolving') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        ✓ Alert marked as resolved. It will remain in your Alert History for audit purposes.
      </div>
    )
  }

  // Snoozed state display
  if (localState === 'snoozed') {
    return (
      <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)', color: 'var(--nd-text-secondary)' }}>
        <Clock className="h-4 w-4 shrink-0" style={{ color: 'var(--nd-text-muted)' }} />
        <span>Alert snoozed for 7 days. We'll re-notify you on {snoozeDate} if unresolved.</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border-l-4 overflow-hidden transition-all duration-200',
        styles.border,
      )}
      style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}
    >
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Severity + type */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5 flex-wrap">
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', styles.pill)}>
            {styles.pillText}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--nd-text-muted)' }}>{typeLabel}</span>
        </div>

        {/* Message — pre-formatted by backend, display as-is */}
        <p className="flex-1 text-[13px] leading-snug min-w-0" style={{ color: 'var(--nd-text-primary)' }}>{alert.message}</p>

        {/* Expand toggle (not for info severity) */}
        {alert.severity !== 'info' && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 transition-colors cursor-pointer"
            style={{ color: 'var(--nd-text-muted)' }}
          >
            {expanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* ── Tags + timestamp row ────────────────────────────────────────── */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        {alert.affected_metric && (
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)', color: 'var(--nd-text-secondary)' }}>
            {alert.affected_metric}
          </span>
        )}
        {alert.affected_model && (
          <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">
            {alert.affected_model}
          </span>
        )}

        {/* Days unresolved badge — shows after 3 days, red after 7 (PDF spec) */}
        {daysUnresolved >= 3 && (
          <span
            className={cn(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
              daysUnresolved >= 7
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-amber-50 border-amber-200 text-amber-700',
            )}
          >
            ONGOING — {daysUnresolved} day{daysUnresolved !== 1 ? 's' : ''}
          </span>
        )}

        <span className="text-[10px] ml-auto" style={{ color: 'var(--nd-text-muted)' }}>
          {new Date(alert.triggered_at).toLocaleDateString()}
        </span>
      </div>

      {/* ── Expanded recommendation ─────────────────────────────────────── */}
      {expanded && alert.recommendation && (
        <div className="px-4 pb-3 pt-3" style={{ borderTop: '1px solid var(--nd-border)' }}>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>{alert.recommendation}</p>
        </div>
      )}

      {/* ── Action buttons — optimistic updates ────────────────────────── */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap pt-2.5" style={{ borderTop: '1px solid var(--nd-border)' }}>
        {alert.severity !== 'info' && (
          <button
            onClick={() => onNavigate?.(resolveAlertNav(alert.alert_type))}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--nd-text-secondary)', background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
            <Eye className="h-3 w-3" />
            View Details
          </button>
        )}
        {alert.severity !== 'info' && (
          <button
            onClick={handleResolve}
            disabled={isResolving}
            className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50">
            <CheckCircle className="h-3 w-3" />
            Mark Resolved
          </button>
        )}
        {alert.severity !== 'info' && (
          <button
            onClick={handleSnooze}
            disabled={isSnoozing}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            style={{ color: 'var(--nd-text-muted)', background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
            <Clock className="h-3 w-3" />
            Snooze 7 Days
          </button>
        )}
        <button
          onClick={handleDismiss}
          disabled={isDismissing}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors cursor-pointer ml-auto disabled:opacity-50"
            style={{ color: 'var(--nd-text-muted)' }}>
          <X className="h-3 w-3" />
          Dismiss
        </button>
      </div>
    </div>
  )
}