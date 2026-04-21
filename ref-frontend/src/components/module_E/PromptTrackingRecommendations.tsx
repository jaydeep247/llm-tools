'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'
import {
  Lightbulb,
  ShieldAlert,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Wrench,
  Zap,
  Activity,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recommendation {
  priority: number
  category: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  issue: string
  fix: string
  impact: string
  fields_affected: string[]
}

interface RecommendationBlock {
  recommendations: Recommendation[]
  health_score: number
  summary: string
}

export type RecommendationSection =
  | 'tracked_prompts_recommendations'
  | 'citations_recommendations'
  | 'sov_recommendations'

interface PromptTrackingRecommendationsProps {
  jobId?: string
  section: RecommendationSection
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEVERITY_META = {
  critical: {
    icon: ShieldAlert,
    pill: 'bg-rose-50 text-rose-600 border border-rose-200',
    leftBorderColor: '#f43f5e',
    bg: 'bg-rose-50',
    label: 'Critical',
  },
  warning: {
    icon: AlertTriangle,
    pill: 'bg-amber-50 text-amber-600 border border-amber-200',
    leftBorderColor: '#f59e0b',
    bg: 'bg-amber-50',
    label: 'Warning',
  },
  info: {
    icon: Info,
    pill: 'bg-blue-50 text-blue-600 border border-blue-200',
    leftBorderColor: '#3b82f6',
    bg: 'bg-blue-50',
    label: 'Info',
  },
} as const

function healthColor(score: number) {
  if (score >= 80) return { ring: 'text-emerald-600', track: 'stroke-emerald-500', bg: 'bg-emerald-50' }
  if (score >= 50) return { ring: 'text-amber-600', track: 'stroke-amber-500', bg: 'bg-amber-50' }
  return { ring: 'text-rose-600', track: 'stroke-rose-500', bg: 'bg-rose-50' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const c = healthColor(score)
  const r = 28
  const circ = 2 * Math.PI * r
  const filled = circ * (score / 100)

  return (
    <div className={cn('relative flex items-center justify-center w-20 h-20 rounded-full shrink-0', c.bg)}>
      <svg className="absolute inset-0 w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--nd-border)" strokeWidth="4" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          className={c.track}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - filled}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className={cn('relative text-lg font-bold', c.ring)}>{score}</span>
    </div>
  )
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const [open, setOpen] = useState(false)
  const meta = SEVERITY_META[rec.severity]
  const SeverityIcon = meta.icon

  return (
    <div
      className="rounded-xl border border-l-4 overflow-hidden transition-colors"
      style={{
        background: 'var(--nd-card-bg)',
        borderColor: 'var(--nd-border)',
        borderLeftColor: meta.leftBorderColor,
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-black/5 transition-colors"
      >
        <SeverityIcon className={cn('w-4 h-4 mt-0.5 shrink-0', {
          'text-rose-600': rec.severity === 'critical',
          'text-amber-600': rec.severity === 'warning',
          'text-blue-600':  rec.severity === 'info',
        })} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--nd-text-primary)' }}>{rec.title}</span>
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider', meta.pill)}>
              {meta.label}
            </span>
          </div>
          <p className="text-[12px] mt-0.5 line-clamp-1" style={{ color: 'var(--nd-text-muted)' }}>{rec.issue}</p>
        </div>

        <div className="shrink-0 mt-0.5" style={{ color: 'var(--nd-text-muted)' }}>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'var(--nd-border)' }}>
          {/* Issue */}
          <div className="pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--nd-text-muted)' }}>
              <AlertTriangle className="w-3 h-3" /> Issue
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>{rec.issue}</p>
          </div>

          {/* Fix */}
          <div className="rounded-lg border p-3" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--nd-text-muted)' }}>
              <Wrench className="w-3 h-3" /> How to fix
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--nd-text-primary)' }}>{rec.fix}</p>
          </div>

          {/* Impact */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--nd-text-muted)' }}>
              <Zap className="w-3 h-3 text-amber-500" /> Expected impact
            </p>
            <p className="text-[13px] leading-relaxed text-emerald-600">{rec.impact}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── section labels ───────────────────────────────────────────────────────────

const SECTION_LABEL: Record<RecommendationSection, string> = {
  tracked_prompts_recommendations: 'Tracked Prompts',
  citations_recommendations: 'Citations Tracker',
  sov_recommendations: 'Share of Voice',
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PromptTrackingRecommendations({
  jobId,
  section,
}: PromptTrackingRecommendationsProps) {
  const { data: moduleEData, isLoading } = useGetModuleEResultQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const result = moduleEData?.data

  // Per-section data-readiness: only show recommendations when the
  // underlying analysis has actually been computed with real data.
  const rankingRows = result?.ranking_analysis?.ranking_position_per_prompt ?? []
  const hasRankingData = rankingRows.length > 0
  const hasSovData =
    result?.ai_share_of_voice?.overall_sov !== undefined &&
    result?.ai_share_of_voice?.overall_sov !== null

  const sectionDataReady =
    section === 'sov_recommendations' ? hasSovData : hasRankingData

  const block: RecommendationBlock | undefined = (result as any)?.[section]

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-xl border p-5 space-y-3 animate-pulse" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg" style={{ background: 'var(--nd-border)' }} />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-48 rounded" style={{ background: 'var(--nd-border)' }} />
            <div className="h-3 w-72 rounded" style={{ background: 'var(--nd-border)' }} />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl" style={{ background: 'var(--nd-border)' }} />
        ))}
      </div>
    )
  }

  // ── Analysis not yet run ─────────────────────────────────────────────────────
  if (!isLoading && !sectionDataReady) {
    return null
  }

  // ── Recommendations not yet stored (analysis ran but recs weren't saved) ────
  if (!isLoading && sectionDataReady && !block) {
    return (
      <div className="rounded-xl border border-dashed p-6 flex items-start gap-4" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
        <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
          <Lightbulb className="w-5 h-5" style={{ color: 'var(--nd-text-muted)' }} />
        </div>
        <div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--nd-text-primary)' }}>
            {SECTION_LABEL[section]} Recommendations
          </p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--nd-text-muted)' }}>
            Re-run the analysis to compute recommendations for this section.
          </p>
        </div>
      </div>
    )
  }

  if (!block) return null

  const recs = block.recommendations ?? []
  const criticalCount = recs.filter((r) => r.severity === 'critical').length
  const warningCount  = recs.filter((r) => r.severity === 'warning').length
  const infoCount     = recs.filter((r) => r.severity === 'info').length
  const c = healthColor(block.health_score)

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--nd-border)' }}>
      {/* ── Panel header ── */}
      <div className="flex items-center gap-4 px-5 py-4 border-b" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
        {/* Icon */}
        <div className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
          <Lightbulb className="w-4 h-4" style={{ color: 'var(--nd-purple)' }} />
        </div>

        {/* Title + summary */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--nd-text-primary)' }}>
            {SECTION_LABEL[section]} — Recommendations
          </h3>
          <p className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--nd-text-secondary)' }}>{block.summary}</p>
        </div>

        {/* Health gauge */}
        <HealthGauge score={block.health_score} />
      </div>

      {/* ── Stat pills ── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b flex-wrap" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
        <span className="text-[12px] font-medium" style={{ color: 'var(--nd-text-muted)' }}>
          <Activity className="inline w-3.5 h-3.5 mr-1" style={{ color: 'var(--nd-text-muted)' }} />
          {recs.length} recommendation{recs.length !== 1 ? 's' : ''}
        </span>

        {criticalCount > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
            {criticalCount} Critical
          </span>
        )}
        {warningCount > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            {warningCount} Warning{warningCount !== 1 ? 's' : ''}
          </span>
        )}
        {infoCount > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
            {infoCount} Info
          </span>
        )}

        {/* Health label */}
        <span className={cn('ml-auto text-[11px] font-semibold', c.ring)}>
          Health {block.health_score}/100
        </span>
      </div>

      {/* ── Recommendations list ── */}
      <div className="p-4 space-y-2" style={{ background: 'var(--nd-bg)' }}>
        {recs.length === 0 ? (
          <div className="flex items-center gap-3 py-4 px-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-[13px]" style={{ color: 'var(--nd-text-secondary)' }}>
              No issues found — this section is performing well. Keep up the great work!
            </p>
          </div>
        ) : (
          recs.map((rec, idx) => <RecommendationCard key={idx} rec={rec} />)
        )}
      </div>
    </div>
  )
}
