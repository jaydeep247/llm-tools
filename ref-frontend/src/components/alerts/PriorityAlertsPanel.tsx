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
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <AlertTriangle className="h-10 w-10 mb-3 text-zinc-700" />
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
            <div key={i} className="rounded-xl border border-zinc-800 bg-[#111113] p-4 animate-pulse">
              <div className="h-4 w-2/3 bg-zinc-800 rounded mb-2" />
              <div className="h-3 w-1/2 bg-zinc-800/60 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <AlertTriangle className="h-10 w-10 mb-3 text-rose-700/60" />
        <p className="text-sm text-rose-400">Failed to load alerts.</p>
        <button
          onClick={() => refetch()}
          className="mt-3 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
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
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-950/10 px-6 py-10 flex flex-col items-center gap-3">
          <ShieldCheck className="h-12 w-12 text-emerald-500/60" />
          <p className="text-base font-semibold text-emerald-300">
            All clear. No issues detected in the last 7 days.
          </p>
          <p className="text-sm text-emerald-500/60 text-center max-w-sm">
            Your AI visibility is stable. We&apos;re watching 24/7 and will alert you at the first sign of change.
          </p>
        </div>
      )}

      {/* ── Critical ────────────────────────────────────────────────────── */}
      {criticals.length > 0 && (
        <AlertGroup label="Critical" count={criticals.length} colorClass="text-red-400">
          {criticals.map((a) => (
            <AlertCard key={a.id} alert={a} onNavigate={onNavigate} />
          ))}
        </AlertGroup>
      )}

      {/* ── High ────────────────────────────────────────────────────────── */}
      {highs.length > 0 && (
        <AlertGroup label="High Priority" count={highs.length} colorClass="text-orange-400">
          {highs.map((a) => (
            <AlertCard key={a.id} alert={a} onNavigate={onNavigate} />
          ))}
        </AlertGroup>
      )}

      {/* ── Medium ──────────────────────────────────────────────────────── */}
      {mediums.length > 0 && (
        <AlertGroup label="Medium Priority" count={mediums.length} colorClass="text-amber-400">
          {mediums.map((a) => (
            <AlertCard key={a.id} alert={a} onNavigate={onNavigate} />
          ))}
        </AlertGroup>
      )}

      {/* ── Info ────────────────────────────────────────────────────────── */}
      {infos.length > 0 && (
        <AlertGroup label="Informational" count={infos.length} colorClass="text-zinc-400">
          {infos.map((a) => (
            <AlertCard key={a.id} alert={a} onNavigate={onNavigate} />
          ))}
        </AlertGroup>
      )}

      {/* ── Snoozed count footer ────────────────────────────────────────── */}
      {snoozedOrPending.length > 0 && (
        <p className="text-[11px] text-zinc-600 text-center">
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
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          Priority Alerts
          {!loading && activeCount > 0 && (
            <span className={cn(
              'ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full',
              criticalCount > 0
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
            )}>
              {activeCount} active
            </span>
          )}
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Real-time monitoring for changes that affect your AI visibility.
        </p>
        {!loading && activeCount > 0 && (
          <div className="flex items-center gap-3 mt-2 text-[11px]">
            {criticalCount > 0 && <span className="text-red-400 font-semibold">{criticalCount} critical</span>}
            {highCount > 0 && <span className="text-orange-400 font-semibold">{highCount} high</span>}
            {mediumCount > 0 && <span className="text-amber-400">{mediumCount} medium</span>}
            {infoCount > 0 && <span className="text-zinc-500">{infoCount} info</span>}
          </div>
        )}
      </div>
      {!loading && onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isFetching}
          className="shrink-0 p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
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
        <span className="text-[10px] text-zinc-600">({count})</span>
        <div className="flex-1 h-px bg-zinc-800/60" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}