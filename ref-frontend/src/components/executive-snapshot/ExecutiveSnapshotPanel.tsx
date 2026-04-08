'use client'

import { useRouter } from 'next/navigation'
import {
  Brain,
  Shield,
  Quote,
  PieChart,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Zap,
  Activity,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetExecutiveSnapshotQuery } from '@/store/api/executiveSnapshotApi'
import type { ExecutiveSnapshotData, TopAction, KpiStatus, ImpactLevel, EffortLevel } from '@/store/api/executiveSnapshotApi'
import { CrawlStatusBanner } from '@/components/crawl/CrawlStatusBanner'

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Types                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

interface ExecutiveSnapshotPanelProps {
  jobId?: string | null
  sessionId?: string
  projectId?: string
  onNavigate?: (tab: string) => void
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<KpiStatus, {
  label: string
  copy: string
  icon: React.ElementType
  containerClass: string
  pillClass: string
  textClass: string
  iconClass: string
}> = {
  HEALTHY: {
    label: 'HEALTHY',
    copy: 'Your AI visibility is strong. Keep your content and schema current.',
    icon: CheckCircle,
    containerClass: 'border-emerald-500/20 bg-emerald-950/20',
    pillClass: 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400',
    textClass: 'text-emerald-400',
    iconClass: 'text-emerald-400',
  },
  NEEDS_ATTENTION: {
    label: 'NEEDS ATTENTION',
    copy: 'Some areas need work. Review your priority actions below.',
    icon: AlertTriangle,
    containerClass: 'border-amber-500/20 bg-amber-950/20',
    pillClass: 'bg-amber-500/15 border border-amber-500/25 text-amber-400',
    textClass: 'text-amber-400',
    iconClass: 'text-amber-400',
  },
  AT_RISK: {
    label: 'AT RISK',
    copy: 'Critical issues detected. Take action today to stop visibility loss.',
    icon: AlertCircle,
    containerClass: 'border-rose-500/20 bg-rose-950/20',
    pillClass: 'bg-rose-500/15 border border-rose-500/25 text-rose-400',
    textClass: 'text-rose-400',
    iconClass: 'text-rose-400',
  },
}

const IMPACT_CONFIG: Record<ImpactLevel, { label: string; class: string }> = {
  HIGH:   { label: 'HIGH',   class: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
  MEDIUM: { label: 'MEDIUM', class: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  LOW:    { label: 'LOW',    class: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
}

const EFFORT_CONFIG: Record<EffortLevel, { label: string; class: string }> = {
  LOW:    { label: 'LOW',    class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  MEDIUM: { label: 'MEDIUM', class: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  HIGH:   { label: 'HIGH',   class: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-zinc-400">
        <Minus className="h-3 w-3" />
        flat vs last week
      </span>
    )
  }
  const isUp = delta > 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[11px] font-medium',
      isUp ? 'text-emerald-400' : 'text-rose-400',
    )}>
      {isUp
        ? <ArrowUpRight className="h-3 w-3" />
        : <ArrowDownRight className="h-3 w-3" />}
      {isUp ? '+' : ''}{delta} since last week
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Status Banner                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function StatusBanner({ status }: { status: KpiStatus }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <div className={cn(
      'rounded-2xl border p-4 flex items-center gap-3',
      cfg.containerClass,
    )}>
      <Icon className={cn('h-5 w-5 shrink-0', cfg.iconClass)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wider border',
            cfg.pillClass,
          )}>
            <Icon className="h-3 w-3" />
            {cfg.label}
          </span>
          <p className="text-sm text-zinc-300">{cfg.copy}</p>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  KPI Card                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

interface KpiCardProps {
  label: string
  value: string | number
  delta: number | null
  icon: React.ElementType
  iconClass: string
  iconBg: string
  score?: number | null
  statusBadge?: KpiStatus | null
  onClick?: () => void
  extra?: React.ReactNode
}

function KpiCard({ label, value, delta, icon: Icon, iconClass, iconBg, score, statusBadge, onClick, extra }: KpiCardProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative rounded-2xl border border-zinc-800 bg-[#111113] p-5 text-left',
        'transition-all duration-200 hover:border-zinc-700 hover:shadow-lg hover:shadow-black/20',
        onClick && 'cursor-pointer',
      )}
    >
      {/* Icon row */}
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', iconBg)}>
          <Icon className={cn('h-5 w-5', iconClass)} />
        </div>
        <div className="flex items-center gap-2">
          {statusBadge && (
            <span className={cn(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
              STATUS_CONFIG[statusBadge].pillClass,
            )}>
              {statusBadge === 'HEALTHY' ? '●' : statusBadge === 'NEEDS_ATTENTION' ? '◆' : '▲'} {STATUS_CONFIG[statusBadge].label}
            </span>
          )}
          {onClick && (
            <ArrowUpRight className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
          )}
        </div>
      </div>

      {/* Value */}
      <p className="text-3xl font-bold text-white tracking-tight mb-1">{value}</p>
      <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3">{label}</p>

      {/* Delta */}
      <DeltaBadge delta={delta} />

      {/* Progress bar for scores */}
      {score !== null && score !== undefined && (
        <div className="mt-3 w-full bg-zinc-800/60 rounded-full h-1.5 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500',
            )}
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </div>
      )}

      {extra}
    </Tag>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Priority Actions                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

function ActionChip({ action, onNavigate }: { action: TopAction; onNavigate?: (tab: string) => void }) {
  const impactCfg = IMPACT_CONFIG[action.impact]
  const effortCfg = EFFORT_CONFIG[action.effort]

  return (
    <button
      onClick={() => onNavigate?.(action.module_link)}
      className="group w-full flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/60 hover:border-zinc-700 px-4 py-3.5 text-left transition-all duration-200"
      title={`Impact: ${action.impact} | Effort: ${action.effort} | Urgency: ${action.urgency}`}
    >
      {/* Severity indicator */}
      <div className={cn(
        'shrink-0 w-2 h-2 rounded-full',
        action.severity === 'critical' ? 'bg-rose-400' :
        action.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-400',
      )} />

      {/* Title block */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{action.title}</p>
        {action.page_count > 1 && (
          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
            Affects {action.page_count} page{action.page_count !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={cn(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
          impactCfg.class,
        )}>
          {impactCfg.label}
        </span>
        <span className={cn(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
          effortCfg.class,
        )}>
          {effortCfg.label}
        </span>
        <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300 transition-colors ml-1" />
      </div>
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Skeleton                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-zinc-800" />
      </div>
      <div className="h-8 w-20 bg-zinc-800 rounded-lg mb-2" />
      <div className="h-3 w-28 bg-zinc-800/60 rounded mb-3" />
      <div className="h-3 w-24 bg-zinc-800/40 rounded" />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Empty State                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function EmptyState({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center mb-5">
        <Activity className="h-8 w-8 text-zinc-500" />
      </div>
      <h3 className="text-base font-semibold text-white mb-2">
        Your first snapshot is being generated
      </h3>
      <p className="text-sm text-zinc-400 max-w-xs mb-6">
        Check back in 10 minutes after your first crawl completes.
      </p>
      <button
        onClick={() => onNavigate?.('crawler')}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium border border-white/10 transition-all duration-200"
      >
        <Zap className="h-4 w-4" />
        Run Your First Crawl
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Main Panel                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function ExecutiveSnapshotPanel({
  jobId,
  sessionId,
  projectId,
  onNavigate,
}: ExecutiveSnapshotPanelProps) {
  const {
    data: snapshot,
    isLoading,
    isError,
    refetch,
  } = useGetExecutiveSnapshotQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  /* ── Derive overall status from worst KPI ─── */
  const overallStatus: KpiStatus = (() => {
    if (!snapshot) return 'NEEDS_ATTENTION'
    const statuses = [snapshot.aivs_status, snapshot.health_status]
    if (statuses.includes('AT_RISK')) return 'AT_RISK'
    if (statuses.includes('NEEDS_ATTENTION')) return 'NEEDS_ATTENTION'
    return 'HEALTHY'
  })()

  /* ── Loading state — shimmer all 5 cards ─── */
  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Banner skeleton */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 h-14 animate-pulse" />

        {/* Section label */}
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest px-0.5">
          Analysing your AI visibility...
        </p>

        {/* KPI cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>

        {/* Actions skeleton */}
        <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <div className="h-4 w-40 bg-zinc-800 rounded animate-pulse" />
          </div>
          <div className="p-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-zinc-800/50 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ── Error state ─── */
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <AlertCircle className="h-10 w-10 text-rose-400 mb-4" />
        <p className="text-sm font-medium text-white mb-1">We could not load your snapshot.</p>
        <p className="text-xs text-zinc-400 mb-5">Retry or contact support if the issue persists.</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium border border-white/10 transition-all duration-200"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          <a
            href="mailto:support@colytics.ai"
            className="text-xs text-zinc-400 hover:text-zinc-300 underline underline-offset-2 transition-colors"
          >
            Contact support
          </a>
        </div>
      </div>
    )
  }

  /* ── No data yet (job exists but modules haven't produced data) ─── */
  if (!snapshot || !snapshot.has_data) {
    return <EmptyState onNavigate={onNavigate} />
  }

  /* ── Map snapshot crawl_status → CrawlStatusBanner's CrawlStatus ─── */
  const crawlBannerStatus =
    snapshot.crawl_status === 'success'  ? 'completed' :
    snapshot.crawl_status === 'pending'  ? null :
    (snapshot.crawl_status as 'running' | 'failed' | 'cancelled' | null) ?? null

  return (
    <div className="space-y-6">
      {/* ── 1. Overall Status Banner ─── */}
      <StatusBanner status={overallStatus} />

      {/* ── Section Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Executive Snapshot</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Updated {new Date(snapshot.snapshot_date).toLocaleString(undefined, {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all duration-200"
          title="Refresh snapshot"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* ── 2. KPI Cards Grid (4 cards) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* AIVS Score */}
        <KpiCard
          label="AI Visibility Score"
          value={snapshot.aivs_score ?? '—'}
          delta={snapshot.aivs_delta}
          icon={Brain}
          iconBg="bg-violet-500/15"
          iconClass="text-violet-400"
          score={snapshot.aivs_score}
          statusBadge={snapshot.aivs_status}
          onClick={() => onNavigate?.('ai-visibility-scorecards')}
        />

        {/* Health Score */}
        <KpiCard
          label="Website Health"
          value={snapshot.health_score !== null ? `${snapshot.health_score}` : '—'}
          delta={snapshot.health_delta}
          icon={Shield}
          iconBg="bg-emerald-500/15"
          iconClass="text-emerald-400"
          score={snapshot.health_score}
          statusBadge={snapshot.health_status}
          onClick={() => onNavigate?.('technical-audit')}
        />

        {/* Citation Count */}
        <KpiCard
          label="Total Citations"
          value={snapshot.citation_count !== null ? snapshot.citation_count.toLocaleString() : '—'}
          delta={snapshot.citation_delta}
          icon={Quote}
          iconBg="bg-cyan-500/15"
          iconClass="text-cyan-400"
          onClick={() => onNavigate?.('prompt-opportunities')}
        />

        {/* Share of Voice */}
        <KpiCard
          label="AI Share of Voice"
          value={snapshot.sov_percent !== null ? `${snapshot.sov_percent}%` : '—'}
          delta={snapshot.sov_delta}
          icon={PieChart}
          iconBg="bg-amber-500/15"
          iconClass="text-amber-400"
          onClick={() => onNavigate?.('share-of-voice')}
        />

      </div>

      {/* ── 2b. Crawl Status Banner ─── */}
      <CrawlStatusBanner
        jobId={jobId ?? null}
        initialStatus={crawlBannerStatus}
        pagesCrawled={snapshot.pages_crawled ?? 0}
        crawlCompletedAt={snapshot.last_crawl}
        componentTitle="Last Crawl"
        onViewPages={() => onNavigate?.('technical-audit')}
      />

      {/* ── 3. Priority Actions ─── */}
      <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Zap className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Top Priority Actions</h3>
              <p className="text-[11px] text-zinc-500">IEU-ranked — highest Impact × Urgency / Effort first</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate?.('recommendations')}
            className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            See all
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Action chips */}
        <div className="p-5 space-y-2.5">
          {snapshot.top_actions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-center">
              <div>
                <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">No critical actions at this time.</p>
                <p className="text-xs text-zinc-500 mt-1">Run a full audit to get recommendations.</p>
              </div>
            </div>
          ) : (
            snapshot.top_actions.map((action, i) => (
              <ActionChip key={i} action={action} onNavigate={onNavigate} />
            ))
          )}
        </div>
      </div>

      {/* ── 4. Quick navigation row ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Full Audit',      icon: BarChart3,  tab: 'recommendations',          accent: 'border-zinc-800 hover:border-zinc-700' },
          { label: 'AI Visibility',   icon: Brain,      tab: 'ai-visibility-scorecards',   accent: 'border-zinc-800 hover:border-zinc-700' },
          { label: 'Brand Mentions',  icon: Activity,   tab: 'prompt-difficulty',          accent: 'border-zinc-800 hover:border-zinc-700' },
          { label: 'Crawl Report',    icon: Clock,      tab: 'technical-audit',            accent: 'border-zinc-800 hover:border-zinc-700' },
        ].map(({ label, icon: Icon, tab, accent }) => (
          <button
            key={tab}
            onClick={() => onNavigate?.(tab)}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border bg-zinc-900/40 hover:bg-zinc-800/60 px-4 py-3',
              'text-sm font-medium text-zinc-300 hover:text-white transition-all duration-200',
              accent,
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
            {label}
            <ChevronRight className="h-3.5 w-3.5 ml-auto text-zinc-600" />
          </button>
        ))}
      </div>
    </div>
  )
}
