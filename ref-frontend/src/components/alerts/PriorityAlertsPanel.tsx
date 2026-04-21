'use client'

import { ShieldCheck, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetAlertsQuery } from '@/store/api/alertsApi'
import { AlertBanner } from './AlertBanner'
import { AlertCard } from './AlertCard'

interface PriorityAlertsPanelProps {
  jobId?: string | null
  onNavigate?: (tab: string) => void
}

export default function PriorityAlertsPanel({ jobId, onNavigate }: PriorityAlertsPanelProps) {
  const {
    data,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useGetAlertsQuery(jobId!, {
    skip: !jobId,
    // Poll every 5 min — keeps sidebar badge count current (PDF spec)
    pollingInterval: 5 * 60 * 1000,
    refetchOnMountOrArgChange: true,
  })

  if (!jobId) {
    return (
      <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--nd-text-muted)' }}>
        <AlertTriangle className="h-10 w-10 mb-3" style={{ color: 'var(--nd-border)' }} />
        <p className="text-sm">No job data available.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PanelHeader loading />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl p-4 animate-pulse" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
              <div className="h-4 w-2/3 rounded mb-2" style={{ background: 'var(--nd-border)' }} />
              <div className="h-3 w-1/2 rounded" style={{ background: 'var(--nd-bg)' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--nd-text-muted)' }}>
        <AlertTriangle className="h-10 w-10 mb-3 text-rose-500" />
        <p className="text-sm text-rose-700">Failed to load alerts.</p>
        <button
          onClick={() => refetch()}
          className="mt-3 text-xs transition-colors cursor-pointer"
          style={{ color: 'var(--nd-text-secondary)' }}
        >
          Retry
        </button>
      </div>
    )
  }

  const alerts = data?.alerts ?? []
  const activeAlerts = alerts.filter((a) => a.is_active)
  const criticals = activeAlerts.filter((a) => a.severity === 'critical')
  const highs = activeAlerts.filter((a) => a.severity === 'high')
  const mediums = activeAlerts.filter((a) => a.severity === 'medium')
  const infos = activeAlerts.filter((a) => a.severity === 'info')
  const snoozedOrPending = alerts.filter((a) => !a.is_active && !a.resolved_at && !a.is_dismissed)

  const allEmpty = activeAlerts.length === 0

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <PanelHeader
        activeCount={data?.active_count ?? 0}
        criticalCount={data?.critical_count ?? 0}
        highCount={data?.high_count ?? 0}
        mediumCount={data?.medium_count ?? 0}
        infoCount={data?.info_count ?? 0}
        isFetching={isFetching}
        onRefresh={refetch}
      />

      {/* ── Critical banners at top ──────────────────────────────────────── */}
      {criticals.length > 0 && (
        <AlertBanner alerts={criticals} onNavigate={onNavigate} />
      )}

      {/* ── All clear empty state ────────────────────────────────────────── */}
      {allEmpty && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-10 flex flex-col items-center gap-3">
          <ShieldCheck className="h-12 w-12 text-emerald-600" />
          <p className="text-base font-semibold text-emerald-800">
            All clear. No issues detected in the last 7 days.
          </p>
          <p className="text-sm text-center max-w-sm text-emerald-700">
            Your AI visibility is stable. We&apos;re watching 24/7 and will alert you at the first sign of change.
          </p>
        </div>
      )}

      {/* ── Critical ────────────────────────────────────────────────────── */}
      {criticals.length > 0 && (
        <AlertGroup label="Critical" count={criticals.length} colorClass="text-red-700">
          {criticals.map((a) => (
            <AlertCard key={a.id} alert={a} onNavigate={onNavigate} />
          ))}
        </AlertGroup>
      )}

      {/* ── High ────────────────────────────────────────────────────────── */}
      {highs.length > 0 && (
        <AlertGroup label="High Priority" count={highs.length} colorClass="text-orange-700">
          {highs.map((a) => (
            <AlertCard key={a.id} alert={a} onNavigate={onNavigate} />
          ))}
        </AlertGroup>
      )}

      {/* ── Medium ──────────────────────────────────────────────────────── */}
      {mediums.length > 0 && (
        <AlertGroup label="Medium Priority" count={mediums.length} colorClass="text-amber-700">
          {mediums.map((a) => (
            <AlertCard key={a.id} alert={a} onNavigate={onNavigate} />
          ))}
        </AlertGroup>
      )}

      {/* ── Info ────────────────────────────────────────────────────────── */}
      {infos.length > 0 && (
        <AlertGroup label="Informational" count={infos.length} colorClass="text-zinc-500">
          {infos.map((a) => (
            <AlertCard key={a.id} alert={a} onNavigate={onNavigate} />
          ))}
        </AlertGroup>
      )}

      {/* ── Snoozed count footer ────────────────────────────────────────── */}
      {snoozedOrPending.length > 0 && (
        <p className="text-[11px] text-center" style={{ color: 'var(--nd-text-muted)' }}>
          {snoozedOrPending.length} alert{snoozedOrPending.length !== 1 ? 's' : ''} snoozed or pending resolution.
        </p>
      )}
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function PanelHeader({
  loading = false,
  activeCount = 0,
  criticalCount = 0,
  highCount = 0,
  mediumCount = 0,
  infoCount = 0,
  isFetching = false,
  onRefresh,
}: {
  loading?: boolean
  activeCount?: number
  criticalCount?: number
  highCount?: number
  mediumCount?: number
  infoCount?: number
  isFetching?: boolean
  onRefresh?: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="nd-page-title flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Priority Alerts
          {!loading && activeCount > 0 && (
            <span className={cn(
              'ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full',
              criticalCount > 0
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200',
            )}>
              {activeCount} active
            </span>
          )}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--nd-text-secondary)' }}>
          Real-time monitoring for changes that affect your AI visibility.
        </p>
        {!loading && activeCount > 0 && (
          <div className="flex items-center gap-3 mt-2 text-[11px]">
            {criticalCount > 0 && <span className="text-red-600 font-semibold">{criticalCount} critical</span>}
            {highCount > 0 && <span className="text-orange-600 font-semibold">{highCount} high</span>}
            {mediumCount > 0 && <span className="text-amber-700">{mediumCount} medium</span>}
            {infoCount > 0 && <span style={{ color: 'var(--nd-text-muted)' }}>{infoCount} info</span>}
          </div>
        )}
      </div>
      {!loading && onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isFetching}
          className="shrink-0 p-2 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
          style={{ color: 'var(--nd-text-muted)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--nd-bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--nd-text-secondary)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--nd-text-muted)' }}
          title="Refresh alerts"
        >
          {isFetching
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />}
        </button>
      )}
    </div>
  )
}

function AlertGroup({
  label,
  count,
  colorClass,
  children,
}: {
  label: string
  count: number
  colorClass: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('text-[11px] font-semibold uppercase tracking-wider', colorClass)}>
          {label}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--nd-text-muted)' }}>({count})</span>
        <div className="flex-1 h-px" style={{ background: 'var(--nd-border)' }} />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}