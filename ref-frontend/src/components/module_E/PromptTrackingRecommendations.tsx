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
  | 'sov_recommendations'

interface PromptTrackingRecommendationsProps {
  jobId?: string
  section: RecommendationSection
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEVERITY_META = {
  critical: {
    icon: ShieldAlert,
    pill: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
    border: 'border-l-rose-500',
    bg: 'bg-rose-500/5',
    label: 'Critical',
  },
  warning: {
    icon: AlertTriangle,
    pill: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    border: 'border-l-amber-500',
    bg: 'bg-amber-500/5',
    label: 'Warning',
  },
  info: {
    icon: Info,
    pill: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    border: 'border-l-blue-500',
    bg: 'bg-blue-500/5',
    label: 'Info',
  },
} as const

function healthColor(score: number) {
  if (score >= 80) return { ring: 'text-emerald-400', track: 'stroke-emerald-500', bg: 'bg-emerald-500/10' }
  if (score >= 50) return { ring: 'text-amber-400', track: 'stroke-amber-500', bg: 'bg-amber-500/10' }
  return { ring: 'text-rose-400', track: 'stroke-rose-500', bg: 'bg-rose-500/10' }
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
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
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
      className={cn(
        'rounded-lg border border-zinc-800 border-l-2 overflow-hidden transition-colors',
        meta.border,
        meta.bg,
      )}
    >
      {/* Header row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/2 transition-colors"
      >
        <SeverityIcon className={cn('w-4 h-4 mt-0.5 shrink-0', {
          'text-rose-400': rec.severity === 'critical',
          'text-amber-400': rec.severity === 'warning',
          'text-blue-400':  rec.severity === 'info',
        })} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-zinc-100">{rec.title}</span>
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider', meta.pill)}>
              {meta.label}
            </span>
          </div>
          <p className="text-[12px] text-zinc-500 mt-0.5 line-clamp-1">{rec.issue}</p>
        </div>

        <div className="shrink-0 text-zinc-600 mt-0.5">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-800/60">
          {/* Issue */}
          <div className="pt-3">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Issue
            </p>
            <p className="text-[13px] text-zinc-300 leading-relaxed">{rec.issue}</p>
          </div>

          {/* Fix */}
          <div className="rounded-md bg-zinc-900/60 border border-zinc-800 p-3">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Wrench className="w-3 h-3" /> How to fix
            </p>
            <p className="text-[13px] text-zinc-200 leading-relaxed">{rec.fix}</p>
          </div>

          {/* Impact */}
          <div>
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" /> Expected impact
            </p>
            <p className="text-[13px] text-emerald-400 leading-relaxed">{rec.impact}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── section labels ───────────────────────────────────────────────────────────

const SECTION_LABEL: Record<RecommendationSection, string> = {
  tracked_prompts_recommendations: 'Tracked Prompts',
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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-48 bg-zinc-800 rounded" />
            <div className="h-3 w-72 bg-zinc-800 rounded" />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-zinc-800" />
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
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-6 flex items-start gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-800/60 border border-zinc-700 shrink-0">
          <Lightbulb className="w-5 h-5 text-zinc-500" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-zinc-300">
            {SECTION_LABEL[section]} Recommendations
          </p>
          <p className="text-[13px] text-zinc-500 mt-1">
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      {/* ── Panel header ── */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-zinc-800 bg-zinc-900/60">
        {/* Icon */}
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-800/80 border border-zinc-700 shrink-0">
          <Lightbulb className="w-4 h-4 text-cyan-400" />
        </div>

        {/* Title + summary */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-zinc-100">
            {SECTION_LABEL[section]} — Recommendations
          </h3>
          <p className="text-[12px] text-zinc-500 mt-0.5 truncate">{block.summary}</p>
        </div>

        {/* Health gauge */}
        <HealthGauge score={block.health_score} />
      </div>

      {/* ── Stat pills ── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800 flex-wrap">
        <span className="text-[12px] text-zinc-500 font-medium">
          <Activity className="inline w-3.5 h-3.5 mr-1 text-zinc-600" />
          {recs.length} recommendation{recs.length !== 1 ? 's' : ''}
        </span>

        {criticalCount > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/25">
            {criticalCount} Critical
          </span>
        )}
        {warningCount > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
            {warningCount} Warning{warningCount !== 1 ? 's' : ''}
          </span>
        )}
        {infoCount > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25">
            {infoCount} Info
          </span>
        )}

        {/* Health label */}
        <span className={cn('ml-auto text-[11px] font-semibold', c.ring)}>
          Health {block.health_score}/100
        </span>
      </div>

      {/* ── Recommendations list ── */}
      <div className="p-4 space-y-2">
        {recs.length === 0 ? (
          <div className="flex items-center gap-3 py-4 px-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-[13px] text-zinc-400">
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
