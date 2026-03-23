'use client'

// CompetitorRecommendations.tsx
// MOAT 4 Recommendation Engine — fully structured UI
// 8 numbered sections so users understand WHAT they see and WHY before acting.

import { useState, useMemo } from 'react'
import {
  Lightbulb, AlertTriangle, TrendingDown, TrendingUp, Minus,
  ChevronDown, ChevronUp, CheckCircle2, Clock, Zap, Target,
  Globe, Link2, Star, BarChart2, ShieldAlert, Eye, ArrowUp,
  ArrowDown, Info, BookOpen, Layers, Flame, Trophy,
  FileText, BarChart, CheckCheck
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import {
  type ModuleFResult,
  type ModuleFAlert,
  type ModuleFRecommendations,
  type ModuleFGapOpportunity,
  type ModuleFSourceAnalysis,
  type ModuleFCompareVisibilityAgainstCompetitors,
  type ModuleFCompareVisibilityEntityRow,
  type Moat4Recommendations,
  type Moat4RoleOutput,
  type Moat4Action,
  type Moat4DeltaClass as DeltaClass,
  type Moat4GapType as GapType,
  resolveMoat4Recommendations,
  resolveGapAnalysis,
  resolveRecommendations,
  resolveAlerts,
  normaliseMetricRec,
} from '@/store/api/module_F/moduleFApi'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface CompetitorRecommendationsProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
  jobId?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Config maps
// ─────────────────────────────────────────────────────────────────────────────

const DELTA_CONFIG: Record<DeltaClass, {
  label: string; desc: string; color: string; bg: string; border: string; icon: React.ReactNode
}> = {
  competitor_threat: {
    label: 'Competitor Threat',
    desc: 'A competitor has surged or flipped prompts away from your brand. Act within 7 days.',
    color: 'text-rose-300', bg: 'bg-rose-500/10', border: 'border-rose-500/30',
    icon: <ShieldAlert className="w-5 h-5" />,
  },
  critical_drop: {
    label: 'Critical Drop',
    desc: 'Your benchmark score dropped more than 15 pts since the last run. Immediate action required.',
    color: 'text-rose-300', bg: 'bg-rose-500/10', border: 'border-rose-500/30',
    icon: <TrendingDown className="w-5 h-5" />,
  },
  significant_drop: {
    label: 'Significant Drop',
    desc: 'Benchmark or visibility dropped 8–15 pts. Prioritise content fixes this sprint.',
    color: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30',
    icon: <TrendingDown className="w-5 h-5" />,
  },
  plateau: {
    label: 'Plateau',
    desc: 'Score has been flat 21+ days while competitors win prompts. Expand your content coverage.',
    color: 'text-sky-300', bg: 'bg-sky-500/10', border: 'border-sky-500/30',
    icon: <Minus className="w-5 h-5" />,
  },
  improvement: {
    label: 'Improving',
    desc: 'Benchmark improved +5 pts or more. Defend winning prompts and push for further gains.',
    color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30',
    icon: <TrendingUp className="w-5 h-5" />,
  },
  stable: {
    label: 'Stable',
    desc: 'No significant movement. Use this time to build uncontested territory before a competitor does.',
    color: 'text-zinc-400', bg: 'bg-zinc-800/60', border: 'border-zinc-700',
    icon: <Minus className="w-5 h-5" />,
  },
}

const GAP_CONFIG: Partial<Record<GapType, { label: string; cls: string; desc: string }>> = {
  uncontested:        { label: 'Uncontested ★',   desc: 'No competitor ranks — own it now',                cls: 'bg-amber-500/10 text-amber-300 border-amber-500/25' },
  priority_fix:       { label: 'Priority Fix',     desc: 'Competitor outranks you by 30+ pts',             cls: 'bg-rose-500/10 text-rose-300 border-rose-500/25' },
  comparison_page:    { label: 'Comparison Page',  desc: 'Build a dedicated vs-competitor page',           cls: 'bg-purple-500/10 text-purple-300 border-purple-500/25' },
  near_uncontested:   { label: 'Near-Uncontested', desc: 'Weak competitor hold — easy to overtake',        cls: 'bg-amber-500/10 text-amber-300 border-amber-500/25' },
  competitor_surge:   { label: 'Competitor Surge', desc: 'Competitor visibility jumped +5 pts',            cls: 'bg-rose-500/10 text-rose-300 border-rose-500/25' },
  win_rate:           { label: 'Win Rate Fix',      desc: 'You win fewer than 30% of tracked prompts',    cls: 'bg-sky-500/10 text-sky-300 border-sky-500/25' },
  citation_gap:       { label: 'Citation Gap',      desc: 'Earn a high-DA citation competitors already have', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' },
  schema:             { label: 'Add Schema',        desc: 'Add FAQ/HowTo schema for AI crawlability',      cls: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25' },
  score_drop:         { label: 'Score Recovery',    desc: 'Benchmark dropped — find the flipped prompts',  cls: 'bg-rose-500/10 text-rose-300 border-rose-500/25' },
  entity_consistency: { label: 'Entity Signals',    desc: 'Strengthen brand name consistency site-wide',   cls: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/25' },
  model_gap:          { label: 'Model Gap',          desc: 'Good rank on one AI model, poor on another',   cls: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25' },
}

const ROLE_CONFIG = [
  { id: 'all',             label: 'All',     icon: <Layers className="w-3.5 h-3.5" />,   hint: 'Full list, all roles' },
  { id: 'cxo',             label: 'CXO',     icon: <Trophy className="w-3.5 h-3.5" />,   hint: 'Top 3, executive brief' },
  { id: 'cmo',             label: 'CMO',     icon: <BarChart className="w-3.5 h-3.5" />, hint: 'Top 5, content ROI' },
  { id: 'seo_manager',     label: 'SEO',     icon: <Target className="w-3.5 h-3.5" />,   hint: 'Up to 10, sprint backlog' },
  { id: 'content_manager', label: 'Content', icon: <FileText className="w-3.5 h-3.5" />, hint: 'Up to 7, content briefs' },
]

const METRIC_META: Record<string, { label: string; icon: React.ReactNode }> = {
  visibility_score:     { label: 'AI Visibility Score',    icon: <Eye className="w-3.5 h-3.5" /> },
  market_share:         { label: 'Market Share',            icon: <Layers className="w-3.5 h-3.5" /> },
  brand_win_rate:       { label: 'Brand Win Rate',          icon: <Target className="w-3.5 h-3.5" /> },
  competitor_win_rate:  { label: 'Competitor Win Rate',     icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  content_gap_score:    { label: 'Content Gap Score',       icon: <BookOpen className="w-3.5 h-3.5" /> },
  missing_prompts:      { label: 'Missing Prompts',         icon: <Minus className="w-3.5 h-3.5" /> },
  potential_gain:       { label: 'Potential Gain',          icon: <TrendingUp className="w-3.5 h-3.5" /> },
  source_influence:     { label: 'Source Influence',        icon: <Link2 className="w-3.5 h-3.5" /> },
  avg_domain_authority: { label: 'Avg Domain Authority',    icon: <Globe className="w-3.5 h-3.5" /> },
  total_citations:      { label: 'Total Citations',         icon: <Star className="w-3.5 h-3.5" /> },
  rank_delta:           { label: 'Rank Δ vs Brand',         icon: <BarChart2 className="w-3.5 h-3.5" /> },
}

const CT_COLOR: Record<string, string> = {
  comparison: 'bg-purple-500/10 text-purple-300 border-purple-500/25',
  guide:      'bg-sky-500/10 text-sky-300 border-sky-500/25',
  blog:       'bg-zinc-700/40 text-zinc-400 border-zinc-600/25',
  tool:       'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  faq:        'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
  page:       'bg-zinc-800 text-zinc-500 border-zinc-700',
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper — consistent labelling with step number
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  step, title, subtitle, children,
}: {
  step: number; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-500 shrink-0 mt-0.5">
          {step}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{subtitle}</p>
        </div>
      </div>
      <div className="ml-9">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert banner
// ─────────────────────────────────────────────────────────────────────────────

function AlertBanner({ alerts }: { alerts: ModuleFAlert[] }) {
  const [gone, setGone] = useState(false)
  if (!alerts.length || gone) return null
  const top  = alerts[0]
  const isUp = top.alertType === 'improvement'
  const isDn = top.alertType === 'drop'
  return (
    <div className={cn(
      'rounded-xl border p-4 flex items-start gap-3',
      isUp ? 'bg-emerald-500/8 border-emerald-500/25' : isDn ? 'bg-rose-500/8 border-rose-500/25' : 'bg-amber-500/8 border-amber-500/25'
    )}>
      <div className={cn('p-1.5 rounded-lg shrink-0', isUp ? 'bg-emerald-500/15' : isDn ? 'bg-rose-500/15' : 'bg-amber-500/15')}>
        {isUp ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-bold uppercase tracking-wide mb-0.5',
          isUp ? 'text-emerald-400' : isDn ? 'text-rose-400' : 'text-amber-400'
        )}>
          {isUp ? 'Rank Improved' : isDn ? 'Score Dropped' : 'Rank Changed'} — {top.entityName}
        </p>
        <p className="text-sm text-zinc-200">{top.message}</p>
        <div className="flex gap-4 mt-1.5">
          {top.scoreDelta !== 0 && (
            <span className={cn('text-xs font-mono font-medium', top.scoreDelta > 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {top.scoreDelta > 0 ? '+' : ''}{top.scoreDelta.toFixed(1)} pts
            </span>
          )}
          {top.rankMove !== 0 && (
            <span className={cn('text-xs font-mono font-medium', top.rankMove > 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {top.rankMove > 0 ? '↑' : '↓'} {Math.abs(top.rankMove)} rank
            </span>
          )}
          {top.benchmarkScore != null && (
            <span className="text-xs text-zinc-600 font-mono">score: {top.benchmarkScore.toFixed(1)}</span>
          )}
        </div>
      </div>
      {alerts.length > 1 && <span className="text-[10px] text-zinc-600 shrink-0 mt-1">+{alerts.length - 1} more</span>}
      <button onClick={() => setGone(true)} className="text-zinc-700 hover:text-zinc-400 shrink-0 mt-0.5 transition-colors">
        <Minus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Status bar
// ─────────────────────────────────────────────────────────────────────────────

function StatusBar({ deltaClass, summary }: { deltaClass: DeltaClass; summary?: string }) {
  const cfg = DELTA_CONFIG[deltaClass]
  return (
    <div className={cn('rounded-xl border p-5 flex items-start gap-4', cfg.bg, cfg.border)}>
      <div className={cn('p-2.5 rounded-xl border shrink-0', cfg.bg, cfg.border)}>
        <span className={cfg.color}>{cfg.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={cn('text-base font-bold', cfg.color)}>{cfg.label}</span>
          <Badge className={cn('border text-[10px] font-semibold tracking-wide', cfg.bg, cfg.color, cfg.border)}>
            {deltaClass.replace(/_/g, ' ').toUpperCase()}
          </Badge>
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed">{cfg.desc}</p>
        {summary && summary.length > 10 && (
          <p className="text-xs text-zinc-500 mt-2 pt-2 border-t border-zinc-700/40 leading-relaxed">{summary}</p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Stat cards
// ─────────────────────────────────────────────────────────────────────────────

function StatCards({ p1, p2, p3, done, total }: {
  p1: number; p2: number; p3: number; done: number; total: number
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: 'Act Now',    sub: 'Priority ≥ 8.0',    val: p1,   color: 'text-rose-400',    bg: 'bg-rose-500/6',    border: 'border-rose-500/20',    icon: <Flame className="w-4 h-4 text-rose-400" />,    tip: 'Critical actions — competitor threat or score drop detected.' },
        { label: 'This Sprint', sub: 'Score 6.5–8.0',    val: p2,   color: 'text-amber-400',   bg: 'bg-amber-500/6',   border: 'border-amber-500/20',   icon: <Zap className="w-4 h-4 text-amber-400" />,     tip: 'High-impact — complete within the next 2-week sprint.' },
        { label: 'Ongoing',    sub: 'Score < 6.5',       val: p3,   color: 'text-zinc-300',    bg: 'bg-zinc-800/40',   border: 'border-zinc-700/50',    icon: <Target className="w-4 h-4 text-zinc-500" />,   tip: 'Medium-term — add to regular content cadence.' },
        { label: 'Completed',  sub: `${pct}% done`,      val: done, color: 'text-emerald-400', bg: 'bg-emerald-500/6', border: 'border-emerald-500/20', icon: <CheckCheck className="w-4 h-4 text-emerald-400" />, tip: 'Actions marked done in this session.' },
      ].map(c => (
        <div key={c.label} className={cn('rounded-xl border p-4 flex flex-col gap-2', c.bg, c.border)} title={c.tip}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">{c.label}</span>
            {c.icon}
          </div>
          <p className={cn('text-3xl font-bold tabular-nums', c.color)}>{c.val}</p>
          <p className="text-[10px] text-zinc-600">{c.sub}</p>
          {c.label === 'Completed' && total > 0 && (
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Leaderboard delta
// ─────────────────────────────────────────────────────────────────────────────

function LeaderboardDelta({ comparison }: { comparison: ModuleFCompareVisibilityAgainstCompetitors | null }) {
  if (!comparison) return null
  const all = [comparison.brand, ...(comparison.competitors ?? [])].filter(Boolean) as ModuleFCompareVisibilityEntityRow[]
  if (!all.some(e => (e.score_delta != null && e.score_delta !== 0) || e.rank_move)) return null
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 bg-zinc-900/60 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-200">Score movement vs last run</span>
          <div className="ml-auto flex items-center gap-4 text-[10px] text-zinc-600">
            <span>Score</span><span>Δ pts</span><span>Rank</span>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">
          Positive Δ = improved. Negative = dropped. Rank ↑ = moved up the leaderboard.
        </p>
      </div>
      <div className="divide-y divide-zinc-800/40">
        {all.map((e, i) => {
          const delta = e.score_delta ?? 0
          const move  = e.rank_move  ?? 0
          const isBrand = i === 0
          return (
            <div key={e.name} className={cn('flex items-center gap-3 px-4 py-3', isBrand && 'bg-amber-500/4')}>
              <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                isBrand ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-500'
              )}>
                {e.rank_position ?? i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <span className={cn('text-sm truncate', isBrand ? 'text-amber-200 font-semibold' : 'text-zinc-300')}>
                  {e.name}
                </span>
                {isBrand && <span className="text-[10px] text-amber-500/40 ml-1.5">your brand</span>}
              </div>
              <span className="text-xs font-mono text-zinc-500 w-12 text-right">{e.benchmark_score?.toFixed(1) ?? '—'}</span>
              <span className={cn('text-xs font-mono font-medium w-16 text-right flex items-center justify-end gap-0.5',
                delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-zinc-700'
              )}>
                {delta > 0 ? <ArrowUp className="w-3 h-3" /> : delta < 0 ? <ArrowDown className="w-3 h-3" /> : null}
                {delta !== 0 ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : '—'}
              </span>
              <span className={cn('text-[10px] w-12 text-right font-medium',
                move > 0 ? 'text-emerald-400' : move < 0 ? 'text-rose-400' : 'text-zinc-700'
              )}>
                {move !== 0 ? `${move > 0 ? '↑' : '↓'} ${Math.abs(move)}` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Uncontested gaps
// ─────────────────────────────────────────────────────────────────────────────

function UncontestedGaps({ gapAnalysis }: { gapAnalysis: ModuleFGapOpportunity[] }) {
  const items = gapAnalysis
    .flatMap(g =>
      (g.opportunities ?? [])
        .filter(o => o.rank == null && (o.opportunityScore ?? 0) >= 90)
        .map(o => ({ prompt: o.prompt, competitor: g.competitor, score: o.opportunityScore }))
    )
    .slice(0, 6)
  if (!items.length) return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 px-4 py-5 text-center">
      <p className="text-xs text-zinc-600">No uncontested prompts found — all opportunities have some competitor presence.</p>
    </div>
  )
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/4 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-500/15 flex items-center gap-2">
        <div className="p-1 bg-amber-500/15 rounded">
          <Star className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <span className="text-xs font-semibold text-amber-300">Uncontested — no competitor ranks here</span>
        <Badge className="ml-auto bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[10px]">
          {items.length} prompt{items.length !== 1 ? 's' : ''}
        </Badge>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5">
            <Star className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs text-zinc-200 leading-snug">"{item.prompt}"</p>
              <p className="text-[10px] text-zinc-500 mt-1">
                vs <span className="text-zinc-400">{item.competitor}</span>
                <span className="mx-1.5 text-zinc-700">·</span>
                opportunity <span className="text-amber-400 font-mono">{item.score}</span>/100
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Action queue
// ─────────────────────────────────────────────────────────────────────────────

function PriorityBar({ score }: { score: number }) {
  const pct  = Math.min(100, Math.round((score / 10) * 100))
  const fill = score >= 8 ? 'bg-rose-500' : score >= 6.5 ? 'bg-amber-500' : 'bg-zinc-600'
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', fill)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-zinc-600 shrink-0">{score.toFixed(1)}</span>
    </div>
  )
}

function ModelGapDetail({ detail }: { detail: NonNullable<Moat4Action['model_detail']> }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-3 text-center">
        <p className="text-[10px] text-emerald-400/60 uppercase tracking-wide mb-1">Best rank</p>
        <p className="text-xl font-bold text-emerald-300">#{detail.best_rank}</p>
        <p className="text-[10px] text-zinc-500 capitalize mt-0.5">{detail.best_model}</p>
      </div>
      <div className="bg-rose-500/8 border border-rose-500/20 rounded-lg p-3 text-center">
        <p className="text-[10px] text-rose-400/60 uppercase tracking-wide mb-1">Weakest rank</p>
        <p className="text-xl font-bold text-rose-300">#{detail.worst_rank}</p>
        <p className="text-[10px] text-zinc-500 capitalize mt-0.5">{detail.worst_model}</p>
      </div>
    </div>
  )
}

function ActionCard({
  action, index, onStatusChange,
}: {
  action: Moat4Action; index: number
  onStatusChange: (recId: string, status: 'completed' | 'dismissed') => void
}) {
  const [open, setOpen] = useState(false)
  const gap     = action.gap_type ? GAP_CONFIG[action.gap_type] : null
  const done    = action.status === 'completed'
  const dismiss = action.status === 'dismissed'

  const effortLabel = action.effort_hours ? `~${action.effort_hours}h`
    : action.effort_score >= 8 ? 'Quick win'
    : action.effort_score >= 5 ? 'Medium effort'
    : 'Large project'
  const effortCls = action.effort_score >= 8 ? 'text-emerald-400'
    : action.effort_score >= 5 ? 'text-amber-400'
    : 'text-zinc-500'

  const accentLeft = done ? 'border-l-2 border-l-emerald-500/50'
    : dismiss ? ''
    : action.priority_score >= 8 ? 'border-l-2 border-l-rose-500'
    : action.priority_score >= 6.5 ? 'border-l-2 border-l-amber-400/60'
    : ''

  return (
    <div className={cn(
      'rounded-xl border border-zinc-800 bg-zinc-900/40 transition-all',
      accentLeft, done && 'opacity-60', dismiss && 'opacity-30'
    )}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Index */}
          <div className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 border',
            action.priority_score >= 8   ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            : action.priority_score >= 6.5 ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
            : 'bg-zinc-800 border-zinc-700 text-zinc-500'
          )}>
            {index + 1}
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            {/* Title */}
            <p className={cn('text-sm font-medium leading-snug', done ? 'line-through text-zinc-500' : 'text-zinc-100')}>
              {action.action_title}
            </p>
            {/* Tags */}
            <div className="flex flex-wrap items-center gap-1.5">
              {gap && (
                <span className={cn('text-[10px] font-medium border rounded px-2 py-0.5', gap.cls)} title={gap.desc}>
                  {gap.label}
                </span>
              )}
              {action.competitor && (
                <span className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 rounded px-2 py-0.5">
                  vs {action.competitor}
                </span>
              )}
              <span className={cn('text-[10px] font-medium ml-auto', effortCls)}>{effortLabel}</span>
            </div>
            {/* IEU row */}
            <div className="flex items-center gap-4">
              {[
                { l: 'Impact',  v: action.impact_score,  c: 'text-purple-400' },
                { l: 'Effort',  v: action.effort_score,  c: 'text-sky-400' },
                { l: 'Urgency', v: action.urgency_score, c: 'text-amber-400' },
              ].map(({ l, v, c }) => (
                <div key={l} className="text-center">
                  <p className={cn('text-xs font-bold tabular-nums', c)}>{v.toFixed(1)}</p>
                  <p className="text-[9px] text-zinc-700 uppercase tracking-wide">{l}</p>
                </div>
              ))}
              <div className="flex-1">
                <PriorityBar score={action.priority_score} />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            {!done && !dismiss && (
              <>
                <button onClick={() => onStatusChange(action.rec_id, 'completed')}
                  title="Mark done"
                  className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-zinc-700 hover:text-emerald-400 transition-colors">
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button onClick={() => onStatusChange(action.rec_id, 'dismissed')}
                  title="Dismiss"
                  className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-700 hover:text-zinc-400 transition-colors">
                  <Clock className="w-4 h-4" />
                </button>
              </>
            )}
            <button onClick={() => setOpen(!open)}
              className="p-1.5 text-zinc-700 hover:text-zinc-300 transition-colors">
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expanded detail */}
        {open && (
          <div className="mt-4 ml-10 space-y-3">
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/70 p-3.5">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold mb-2">Implementation steps</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{action.action_detail}</p>
            </div>
            {action.gap_type === 'model_gap' && action.model_detail && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold mb-1.5">Model breakdown</p>
                <ModelGapDetail detail={action.model_detail} />
              </div>
            )}
            {(action.affected_urls?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold mb-1.5">Affected pages</p>
                <div className="flex flex-wrap gap-1.5">
                  {action.affected_urls.map((u, i) => (
                    <code key={i} className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-1 rounded">{u}</code>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TierGroup({
  label, sublabel, labelColor, icon, emptyMsg, actions, offset, onStatusChange,
}: {
  label: string; sublabel: string; labelColor: string; icon: React.ReactNode; emptyMsg: string
  actions: Moat4Action[]; offset: number
  onStatusChange: (recId: string, status: 'completed' | 'dismissed') => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={cn('flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest', labelColor)}>
          {icon}{label}
        </span>
        <span className="text-[10px] text-zinc-700">— {sublabel}</span>
        <div className="flex-1 h-px bg-zinc-800/60" />
        <span className="text-[10px] text-zinc-700">{actions.length}</span>
      </div>
      {actions.length === 0
        ? <p className="text-xs text-zinc-700 py-2 pl-1">{emptyMsg}</p>
        : actions.map((a, i) => (
            <ActionCard key={a.rec_id} action={a} index={offset + i} onStatusChange={onStatusChange} />
          ))
      }
    </div>
  )
}

function CXOBrief({
  roleOutput, deltaClass, onStatusChange,
}: {
  roleOutput: Moat4RoleOutput; deltaClass: DeltaClass
  onStatusChange: (recId: string, status: 'completed' | 'dismissed') => void
}) {
  const cfg = DELTA_CONFIG[deltaClass] ?? DELTA_CONFIG.stable
  return (
    <div className="space-y-4">
      <div className={cn('rounded-xl border p-4', cfg.bg, cfg.border)}>
        <p className={cn('text-xs font-bold uppercase tracking-wide mb-1.5', cfg.color)}>{roleOutput.headline}</p>
        <p className="text-sm text-zinc-300 leading-relaxed">{roleOutput.summary}</p>
        {roleOutput.top_risk && (
          <div className="mt-3 border-t border-zinc-700/40 pt-3">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Top risk</p>
            <p className="text-xs text-zinc-200">{roleOutput.top_risk}</p>
          </div>
        )}
      </div>
      {(roleOutput.actions ?? []).length > 0 ? (
        <div className="space-y-2">
          {(roleOutput.actions ?? []).map((a, i) => (
            <ActionCard key={a.rec_id} action={a} index={i} onStatusChange={onStatusChange} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-700 text-center py-4">No CXO-level actions at this time.</p>
      )}
    </div>
  )
}

function ActionQueue({
  moat4, allActions, onStatusChange,
}: {
  moat4: Moat4Recommendations; allActions: Moat4Action[]
  onStatusChange: (recId: string, status: 'completed' | 'dismissed') => void
}) {
  const [role, setRole] = useState('all')

  const getRoleActions = (r: string): Moat4Action[] => {
    if (r === 'all')             return allActions
    if (r === 'cxo')             return allActions.filter(a => (a.role_visibility ?? []).includes('cxo')).slice(0, 3)
    if (r === 'cmo')             return allActions.filter(a => (a.role_visibility ?? []).includes('cmo')).slice(0, 5)
    if (r === 'seo_manager')     return allActions.filter(a => (a.role_visibility ?? []).includes('seo_manager')).slice(0, 10)
    if (r === 'content_manager') return allActions.filter(a => (a.role_visibility ?? []).includes('content_manager')).slice(0, 7)
    return allActions
  }

  const filtered = getRoleActions(role)
  const p1 = filtered.filter(a => a.priority_score >= 8)
  const p2 = filtered.filter(a => a.priority_score >= 6.5 && a.priority_score < 8)
  const p3 = filtered.filter(a => a.priority_score < 6.5)

  const ROLE_HINTS: Record<string, string> = {
    all:             'All actions sorted by priority score — best for analysts and daily users.',
    cxo:             'Top 3 actions formatted as an executive brief. Designed for a 5-minute board review.',
    cmo:             'Top 5 content investment priorities with business impact context.',
    seo_manager:     'Up to 10 sprint-ready actions with effort estimates and team ownership.',
    content_manager: 'Up to 7 execution-ready content briefs with entity and structure guidance.',
  }

  return (
    <Card className="bg-zinc-900/30 border-zinc-800">
      <CardHeader className="pb-4 border-b border-zinc-800">
        <div className="space-y-3">
          <div>
            <CardTitle className="text-sm font-semibold text-zinc-100 mb-0.5">Action Queue</CardTitle>
            <p className="text-xs text-zinc-500">
              Select your role to filter and reformat the action list. Expand any row to see full implementation steps.
            </p>
          </div>
          {/* Role tabs */}
          <div className="flex flex-wrap gap-1.5">
            {ROLE_CONFIG.map(rc => (
              <button
                key={rc.id}
                onClick={() => setRole(rc.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  role === rc.id
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                    : 'bg-transparent border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700'
                )}
              >
                <span className={cn(role === rc.id ? 'text-amber-400' : 'text-zinc-600')}>{rc.icon}</span>
                {rc.label}
              </button>
            ))}
          </div>
          {/* Role hint */}
          <div className="flex items-start gap-1.5 bg-zinc-800/30 rounded-lg px-3 py-2 border border-zinc-800">
            <Info className="w-3 h-3 text-zinc-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-zinc-600 leading-relaxed">{ROLE_HINTS[role]}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-6">
        {role === 'cxo' && moat4.role_output ? (
          <CXOBrief roleOutput={moat4.role_output} deltaClass={moat4.delta_class as DeltaClass} onStatusChange={onStatusChange} />
        ) : filtered.length === 0 ? (
          <p className="text-xs text-zinc-700 text-center py-8">No actions found for this role view.</p>
        ) : (
          <>
            <TierGroup label="P1 — Act now"    sublabel="this week, critical" labelColor="text-rose-400"    icon={<Flame className="w-3 h-3" />} emptyMsg="No critical actions — healthy sign."      actions={p1} offset={0}              onStatusChange={onStatusChange} />
            <TierGroup label="P2 — This sprint" sublabel="within 2 weeks"    labelColor="text-amber-400"   icon={<Zap className="w-3 h-3" />}   emptyMsg="No sprint-priority actions right now."  actions={p2} offset={p1.length}      onStatusChange={onStatusChange} />
            <TierGroup label="P3 — Ongoing"     sublabel="regular cadence"   labelColor="text-zinc-500"    icon={<Target className="w-3 h-3" />} emptyMsg="No ongoing actions queued."            actions={p3} offset={p1.length + p2.length} onStatusChange={onStatusChange} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Competitor citation sources
// ─────────────────────────────────────────────────────────────────────────────

function SourcesPanel({ sourceAnalysis }: { sourceAnalysis?: ModuleFSourceAnalysis | null }) {
  const [exp, setExp] = useState(false)
  const sources = sourceAnalysis?.competitor_source_analysis ?? []
  if (!sources.length) return (
    <div className="rounded-xl border border-zinc-800 px-4 py-5 text-center bg-zinc-900/20">
      <p className="text-xs text-zinc-600">No citation source data available.</p>
    </div>
  )
  const shown = sources.slice(0, exp ? 20 : 3)
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 bg-zinc-900/60 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-200">Competitor citation sources</span>
          <span className="text-[10px] text-zinc-600 ml-auto">Screen 4 data</span>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">
          High-authority domains that AI models cite for your competitors. Earning a citation from these sources
          directly increases your own AI visibility score.
        </p>
      </div>
      <div className="divide-y divide-zinc-800/40">
        {shown.map((src, i) => (
          <div key={i} className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-200">{src.competitor}</span>
              <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                <span>influence <span className="text-amber-400 font-mono font-semibold">{src.source_domain_influence_score?.toFixed(0)}</span></span>
                <span>avg DA <span className="text-sky-400 font-mono font-semibold">{src.average_domain_authority?.toFixed(0)}</span></span>
                <span>{src.citation_count} cites</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(src.citation_frequency ?? []).slice(0, 8).map((cf, j) => (
                <span key={j} className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md font-mono">
                  {cf.domain} <span className="text-zinc-700 ml-1">×{cf.count}</span>
                </span>
              ))}
              {(src.top_citations ?? []).slice(0, 3).map((tc, j) => {
                const ct = tc.content_type ?? 'page'
                return (
                  <span key={`ct-${j}`} className={cn('text-[10px] border rounded px-2 py-0.5', CT_COLOR[ct] ?? CT_COLOR.page)}>
                    {ct}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {sources.length > 3 && (
        <button onClick={() => setExp(!exp)}
          className="w-full px-4 py-2.5 text-[10px] text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/30 transition-colors flex items-center justify-center gap-1 border-t border-zinc-800">
          {exp ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />{sources.length - 3} more</>}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — Metric accordion
// ─────────────────────────────────────────────────────────────────────────────

function MetricAccordion({ metricRecs }: { metricRecs: ModuleFRecommendations }) {
  const [open, setOpen] = useState<string | null>(null)
  const entries = Object.entries(metricRecs)
    .map(([k, raw]) => ({ key: k, val: normaliseMetricRec(raw) }))
    .filter(({ val }) => val !== null) as Array<{ key: string; val: { why: string; fix: string } }>
  if (!entries.length) return (
    <div className="rounded-xl border border-zinc-800 px-4 py-5 text-center bg-zinc-900/20">
      <p className="text-xs text-zinc-600">No metric analysis data available.</p>
    </div>
  )
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center gap-2">
        <Info className="w-4 h-4 text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-200">Why each metric is where it is — and how to fix it</span>
      </div>
      <p className="text-[10px] text-zinc-600 px-4 py-2 bg-zinc-900/30 border-b border-zinc-800/50">
        Generated from your actual benchmark data. Click any metric to see the root-cause analysis and a concrete fix list.
      </p>
      <div className="divide-y divide-zinc-800/40">
        {entries.map(({ key, val }) => {
          const meta  = METRIC_META[key]
          const isOpen = open === key
          return (
            <div key={key}>
              <button
                onClick={() => setOpen(isOpen ? null : key)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/20 transition-colors text-left"
              >
                <span className="text-zinc-600 shrink-0">{meta?.icon ?? <Info className="w-3.5 h-3.5" />}</span>
                <span className="text-xs font-medium text-zinc-200 flex-1">{meta?.label ?? key}</span>
                <span className="text-[10px] text-zinc-600 mr-2">{isOpen ? 'close' : 'why + fix'}</span>
                {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-zinc-700 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-700 shrink-0" />}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-2.5 bg-zinc-900/25">
                  {val.why && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide mb-2">Why it's here</p>
                      <p className="text-xs text-zinc-300 leading-relaxed">{val.why}</p>
                    </div>
                  )}
                  {val.fix && (
                    <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/4 p-3.5">
                      <p className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-wide mb-2">How to improve it</p>
                      <p className="text-xs text-zinc-300 leading-relaxed">{val.fix}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 8 — IEU explainer
// ─────────────────────────────────────────────────────────────────────────────

function IEUExplainer() {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 p-5 space-y-4">
      <p className="text-xs text-zinc-500">
        Every action is scored on three dimensions and ranked by a weighted formula. Understanding this helps you
        decide which P2 actions to promote to P1 based on your specific situation.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Impact', pct: '50%', color: 'text-purple-400', bg: 'bg-purple-500/8', border: 'border-purple-500/20',
            desc: 'How much AI visibility will this gain if completed?', eg: 'Uncontested page = 9/10. Minor copy tweak = 4/10.' },
          { label: 'Effort', pct: '30%', color: 'text-sky-400', bg: 'bg-sky-500/8', border: 'border-sky-500/20',
            desc: 'Inverted: 10 = quick win (~1 hr). 1 = large project (40+ hrs).',  eg: 'FAQ schema = 9/10. New comparison page = 5/10.' },
          { label: 'Urgency', pct: '20%', color: 'text-amber-400', bg: 'bg-amber-500/8', border: 'border-amber-500/20',
            desc: 'Does delay make this worse? Elevated on competitor surge or score drop.', eg: 'Competitor +10 pts = +3 urgency modifier.' },
        ].map(({ label, pct, color, bg, border, desc, eg }) => (
          <div key={label} className={cn('rounded-lg border p-3.5 space-y-1.5', bg, border)}>
            <div className="flex items-center justify-between">
              <span className={cn('text-sm font-bold', color)}>{label}</span>
              <span className={cn('text-xs font-mono font-semibold', color)}>{pct}</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{desc}</p>
            <p className="text-[10px] text-zinc-600">e.g. {eg}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800/50 pt-3 space-y-0.5 text-center">
        <p className="text-[10px] text-zinc-600 font-mono">
          Priority = (Impact × 0.50) + ((11 − Effort) × 0.30) + (Urgency × 0.20)
        </p>
        <p className="text-[10px] text-zinc-700">
          Score ≥ 8.0 = P1 (Act now) &nbsp;·&nbsp; 6.5–8.0 = P2 (This sprint) &nbsp;·&nbsp; &lt; 6.5 = P3 (Ongoing)
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-7 w-52 bg-zinc-800 rounded-lg" />
      <div className="h-20 bg-zinc-900 border border-zinc-800 rounded-xl" />
      <div className="grid grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 rounded-xl" />)}
      </div>
      <div className="h-36 bg-zinc-900 border border-zinc-800 rounded-xl" />
      {[1,2,3].map(i => <div key={i} className="h-20 bg-zinc-900 border border-zinc-800 rounded-xl" />)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export default function CompetitorRecommendations({
  moduleFData, isLoading,
}: CompetitorRecommendationsProps) {
  const [statuses, setStatuses] = useState<Record<string, Moat4Action['status']>>({})

  const moat4       = resolveMoat4Recommendations(moduleFData)
  const metricRecs  = resolveRecommendations(moduleFData)
  const gapAnalysis = resolveGapAnalysis(moduleFData)
  const alerts      = resolveAlerts(moduleFData)
  const comparison  = moduleFData?.compare_visibility_against_competitors ?? null

  const handleStatus = (recId: string, status: 'completed' | 'dismissed') =>
    setStatuses(prev => ({ ...prev, [recId]: status }))

  if (isLoading) return <Skeleton />

  if (!moat4?.all_actions?.length) {
    return (
      <AnalysisEmptyState
        icon={<Lightbulb className="w-8 h-8 text-zinc-400" />}
        title="No Recommendations Yet"
        description="Run Module F analysis to generate prioritised competitive recommendations powered by the MOAT 4 engine."
      />
    )
  }

  const deltaClass = (moat4.delta_class ?? 'stable') as DeltaClass

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const allActions: Moat4Action[] = useMemo(() =>
    moat4.all_actions.map(a => ({
      ...a,
      status: (statuses[a.rec_id] ?? a.status ?? 'pending') as Moat4Action['status'],
    })),
    [moat4.all_actions, statuses]
  )

  const done = Object.values(statuses).filter(s => s === 'completed').length
  const p1   = allActions.filter(a => a.priority_score >= 8).length
  const p2   = allActions.filter(a => a.priority_score >= 6.5 && a.priority_score < 8).length
  const p3   = allActions.filter(a => a.priority_score < 6.5).length

  return (
    <div className="space-y-10">

      {/* Page header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl shrink-0">
          <Lightbulb className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2.5">
            Recommendation Engine
            <Badge className="bg-zinc-800 border-zinc-700 text-zinc-500 text-[10px] font-normal"></Badge>
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5 max-w-2xl">
            Generated from your live competitor citation data. Follow the numbered sections below — each builds on
            the previous to give you a complete picture before you act.
          </p>
        </div>
      </div>

      {/* Alert */}
      <AlertBanner alerts={alerts} />

      {/* ── 1. Status ─────────────────────────────────────────────────────── */}
      <Section step={1} title="Current Status"
        subtitle="What is happening to your brand's AI visibility right now. This determines the urgency class of all recommendations below.">
        <StatusBar deltaClass={deltaClass} summary={moat4.role_output?.summary} />
      </Section>

      {/* ── 2. Summary counts ─────────────────────────────────────────────── */}
      <Section step={2} title="Action Summary"
        subtitle="How many actions require your attention, split by urgency tier. Hover each card to understand what the tier means.">
        <StatCards p1={p1} p2={p2} p3={p3} done={done} total={allActions.length} />
      </Section>

      {/* ── 3. Score movement ─────────────────────────────────────────────── */}
      {comparison && (
        <Section step={3} title="Score Movement vs Last Run"
          subtitle="See how your brand and each competitor moved since the previous analysis. This is the data that drives the delta class in Step 1.">
          <LeaderboardDelta comparison={comparison} />
        </Section>
      )}

      {/* ── 4. Uncontested prompts ─────────────────────────────────────────── */}
      <Section step={4} title="Uncontested Opportunities"
        subtitle="Prompts where no competitor currently ranks. The fastest way to gain new AI citations — first brand to publish a focused page can own this query.">
        <UncontestedGaps gapAnalysis={gapAnalysis} />
      </Section>

      {/* ── 5. Actions ────────────────────────────────────────────────────── */}
      <Section step={5} title="Prioritised Action Queue"
        subtitle="Every recommended action, ranked by Impact × Effort × Urgency. Select your role to get a view formatted for your workflow. Expand any row for step-by-step implementation instructions.">
        <ActionQueue moat4={moat4} allActions={allActions} onStatusChange={handleStatus} />
      </Section>

      {/* ── 6. Citation sources ────────────────────────────────────────────── */}
      <Section step={6} title="Where Competitors Get Their Citations"
        subtitle="High-authority domains AI models use to validate competitors. Getting cited here directly improves your benchmark score — these are the link-building targets that matter most for AI visibility.">
        <SourcesPanel sourceAnalysis={moduleFData?.source_analysis} />
      </Section>

      {/* ── 7. Metric deep-dive ───────────────────────────────────────────── */}
      <Section step={7} title="Why Each Metric Is Where It Is"
        subtitle="Data-driven root-cause analysis for every visibility metric. Expand a metric to see exactly why the number is what it is and a concrete fix list.">
        <MetricAccordion metricRecs={metricRecs} />
      </Section>

      {/* ── 8. Scoring explained ──────────────────────────────────────────── */}
      {/* <Section step={8} title="How Priority Scores Are Calculated"
        subtitle="Understanding the IEU formula helps you make smarter decisions about which actions to do first and which to delegate.">
        <IEUExplainer />
      </Section> */}

    </div>
  )
}
