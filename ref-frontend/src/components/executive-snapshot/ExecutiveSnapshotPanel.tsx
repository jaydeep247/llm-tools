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
import { useAppSelector } from '@/store/hooks'
import { selectDateRangePreset } from '@/store/slices/dateRangeSlice'

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
    containerClass: 'border-emerald-200 bg-emerald-50',
    pillClass: 'bg-emerald-100 border border-emerald-200 text-emerald-700',
    textClass: 'text-emerald-700',
    iconClass: 'text-emerald-600',
  },
  NEEDS_ATTENTION: {
    label: 'NEEDS ATTENTION',
    copy: 'Some areas need work. Review your priority actions below.',
    icon: AlertTriangle,
    containerClass: 'border-amber-200 bg-amber-50',
    pillClass: 'bg-amber-100 border border-amber-200 text-amber-700',
    textClass: 'text-amber-700',
    iconClass: 'text-amber-600',
  },
  AT_RISK: {
    label: 'AT RISK',
    copy: 'Critical issues detected. Take action today to stop visibility loss.',
    icon: AlertCircle,
    containerClass: 'border-rose-200 bg-rose-50',
    pillClass: 'bg-rose-100 border border-rose-200 text-rose-700',
    textClass: 'text-rose-700',
    iconClass: 'text-rose-600',
  },
}

const IMPACT_CONFIG: Record<ImpactLevel, { label: string; class: string }> = {
  HIGH:   { label: 'HIGH',   class: 'bg-rose-50 text-rose-700 border-rose-200' },
  MEDIUM: { label: 'MEDIUM', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  LOW:    { label: 'LOW',    class: 'bg-blue-50 text-blue-700 border-blue-200' },
}

const EFFORT_CONFIG: Record<EffortLevel, { label: string; class: string }> = {
  LOW:    { label: 'LOW',    class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MEDIUM: { label: 'MEDIUM', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  HIGH:   { label: 'HIGH',   class: 'bg-rose-50 text-rose-700 border-rose-200' },
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: 'var(--nd-text-muted)' }}>
        <Minus className="h-3 w-3" />
        flat vs last week
      </span>
    )
  }
  const isUp = delta > 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[11px] font-medium',
      isUp ? 'text-emerald-600' : 'text-rose-600',
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
          <p className="text-sm font-medium" style={{ color: 'var(--nd-text-primary)' }}>{cfg.copy}</p>
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
        'group relative rounded-2xl p-5 text-left transition-all duration-200',
        onClick && 'cursor-pointer',
      )}
      style={{
        border: '1px solid var(--nd-border)',
        background: 'var(--nd-card-bg)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={onClick ? (e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(83,71,206,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--nd-purple-light)' } : undefined}
      onMouseLeave={onClick ? (e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--nd-border)' } : undefined}
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
            <ArrowUpRight className="h-4 w-4 transition-colors" style={{ color: 'var(--nd-text-muted)' }} />
          )}
        </div>
      </div>

      {/* Value */}
      <p className="text-3xl font-bold tracking-tight mb-1" style={{ color: 'var(--nd-text-primary)' }}>{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--nd-text-secondary)' }}>{label}</p>

      {/* Delta */}
      <DeltaBadge delta={delta} />

      {/* Progress bar for scores */}
      {score !== null && score !== undefined && (
        <div className="mt-3 w-full rounded-full h-1.5 overflow-hidden" style={{ background: 'var(--nd-border)' }}>
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
      className="group w-full flex items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-all duration-200"
      style={{
        border: '1px solid var(--nd-border)',
        background: 'var(--nd-bg)',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--nd-border-hover)'; (e.currentTarget as HTMLElement).style.background = 'var(--nd-card-bg)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--nd-border)'; (e.currentTarget as HTMLElement).style.background = 'var(--nd-bg)' }}
      title={`Impact: ${action.impact} | Effort: ${action.effort} | Urgency: ${action.urgency}`}
    >
      {/* Severity indicator */}
      <div className={cn(
        'shrink-0 w-2 h-2 rounded-full',
        action.severity === 'critical' ? 'bg-rose-500' :
        action.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-400',
      )} />

      {/* Title block */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--nd-text-primary)' }}>{action.title}</p>
        {action.page_count > 1 && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--nd-text-muted)' }}>
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
        <ChevronRight className="h-4 w-4 ml-1 transition-colors" style={{ color: 'var(--nd-text-muted)' }} />
      </div>
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Skeleton                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 animate-pulse" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl" style={{ background: 'var(--nd-border)' }} />
      </div>
      <div className="h-8 w-20 rounded-lg mb-2" style={{ background: 'var(--nd-border)' }} />
      <div className="h-3 w-28 rounded mb-3" style={{ background: 'var(--nd-border)' }} />
      <div className="h-3 w-24 rounded" style={{ background: 'var(--nd-border)' }} />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Empty State                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function EmptyState({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}
      >
        <Activity className="h-8 w-8" style={{ color: 'var(--nd-text-muted)' }} />
      </div>
      <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--nd-text-primary)' }}>
        Your first snapshot is being generated
      </h3>
      <p className="text-sm max-w-xs mb-6" style={{ color: 'var(--nd-text-secondary)' }}>
        Check back in 10 minutes after your first crawl completes.
      </p>
      <button
        onClick={() => onNavigate?.('crawler')}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
        style={{ background: 'var(--nd-purple)', color: '#ffffff', border: '1px solid var(--nd-purple)' }}
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
  const period = useAppSelector((s: any) => selectDateRangePreset(s))
  const {
    data: snapshot,
    isLoading,
    isError,
    refetch,
  } = useGetExecutiveSnapshotQuery({ jobId: jobId ?? '', period }, {
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
        <div className="rounded-2xl h-14 animate-pulse" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }} />

        {/* Section label */}
        <p className="text-[11px] font-semibold uppercase tracking-widest px-0.5" style={{ color: 'var(--nd-text-muted)' }}>
          Analysing your AI visibility...
        </p>

        {/* KPI cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>

        {/* Actions skeleton */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--nd-border)' }}>
            <div className="h-4 w-40 rounded animate-pulse" style={{ background: 'var(--nd-border)' }} />
          </div>
          <div className="p-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--nd-border)' }} />
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
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#FFF1F1', border: '1px solid #FECACA' }}>
          <AlertCircle className="h-7 w-7 text-rose-600" />
        </div>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--nd-text-primary)' }}>We could not load your snapshot.</p>
        <p className="text-xs mb-5" style={{ color: 'var(--nd-text-secondary)' }}>Retry or contact support if the issue persists.</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
            style={{ background: 'var(--nd-purple)', color: '#ffffff' }}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          <a
            href="mailto:support@colytics.ai"
            className="text-xs underline underline-offset-2 transition-colors"
            style={{ color: 'var(--nd-text-secondary)' }}
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
          <h2 className="nd-page-title">Executive Snapshot</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--nd-text-muted)' }}>
            Updated {new Date(snapshot.snapshot_date).toLocaleString(undefined, {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-xl transition-all duration-200"
          style={{ color: 'var(--nd-text-muted)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--nd-bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--nd-text-secondary)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--nd-text-muted)' }}
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
          iconBg="bg-violet-50"
          iconClass="text-violet-600"
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
          iconBg="bg-emerald-50"
          iconClass="text-emerald-600"
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
          iconBg="bg-cyan-50"
          iconClass="text-cyan-600"
          onClick={() => onNavigate?.('prompt-opportunities')}
        />

        {/* Share of Voice */}
        <KpiCard
          label="AI Share of Voice"
          value={snapshot.sov_percent !== null ? `${snapshot.sov_percent}%` : '—'}
          delta={snapshot.sov_delta}
          icon={PieChart}
          iconBg="bg-amber-50"
          iconClass="text-amber-600"
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
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--nd-border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Zap className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Top Priority Actions</h3>
              <p className="text-[11px]" style={{ color: 'var(--nd-text-muted)' }}>IEU-ranked — highest Impact × Urgency / Effort first</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate?.('recommendations')}
            className="text-[11px] flex items-center gap-1 transition-colors"
            style={{ color: 'var(--nd-text-secondary)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nd-purple)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nd-text-secondary)' }}
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
                <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>No critical actions at this time.</p>
                <p className="text-xs mt-1" style={{ color: 'var(--nd-text-muted)' }}>Run a full audit to get recommendations.</p>
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
          { label: 'Full Audit',      icon: BarChart3,  tab: 'recommendations'           },
          { label: 'AI Visibility',   icon: Brain,      tab: 'ai-visibility-scorecards'  },
          { label: 'Brand Mentions',  icon: Activity,   tab: 'prompt-difficulty'         },
          { label: 'Crawl Report',    icon: Clock,      tab: 'technical-audit'           },
        ].map(({ label, icon: Icon, tab }) => (
          <button
            key={tab}
            onClick={() => onNavigate?.(tab)}
            className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200"
            style={{
              border: '1px solid var(--nd-border)',
              background: 'var(--nd-card-bg)',
              color: 'var(--nd-text-secondary)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nd-purple)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--nd-purple)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--nd-purple-subtle)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nd-border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--nd-text-secondary)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--nd-card-bg)' }}
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--nd-text-muted)' }} />
            {label}
            <ChevronRight className="h-3.5 w-3.5 ml-auto" style={{ color: 'var(--nd-text-muted)' }} />
          </button>
        ))}
      </div>
    </div>
  )
}
