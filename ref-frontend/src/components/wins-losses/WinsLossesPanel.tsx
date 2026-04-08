'use client'

import { useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Trophy,
  Zap,
  Activity,
  Filter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetWinsLossesQuery } from '@/store/api/winsLossesApi'
import type {
  WinLossMetric,
  WinLossCategory,
  LLMModel,
  ImpactLevel,
} from '@/store/api/winsLossesApi'

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Constants                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

interface WinsLossesPanelProps {
  jobId?: string | null
  onNavigate?: (tab: string) => void
}

const MODEL_COLORS: Record<LLMModel, { bg: string; text: string; border: string; dot: string }> = {
  ChatGPT:   { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30',    dot: 'bg-blue-400' },
  Gemini:    { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  Perplexity:{ bg: 'bg-teal-500/15',    text: 'text-teal-400',    border: 'border-teal-500/30',    dot: 'bg-teal-400' },
  Claude:    { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/30',  dot: 'bg-orange-400' },
}

const IMPACT_COLORS: Record<ImpactLevel, { bg: string; text: string; border: string }> = {
  HIGH:   { bg: 'bg-rose-500/15',   text: 'text-rose-400',   border: 'border-rose-500/25' },
  MEDIUM: { bg: 'bg-amber-500/15',  text: 'text-amber-400',  border: 'border-amber-500/25' },
  LOW:    { bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/25' },
}

const CATEGORIES: Array<{ label: string; value: WinLossCategory | 'ALL' }> = [
  { label: 'All',          value: 'ALL' },
  { label: 'Citations',    value: 'Citations' },
  { label: 'Share of Voice', value: 'Share of Voice' },
  { label: 'AI Dimensions', value: 'AIVS Dimensions' },
  { label: 'Prompts',      value: 'Prompt Coverage' },
]

const ALL_MODELS: LLMModel[] = ['ChatGPT', 'Gemini', 'Perplexity', 'Claude']

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Model Badge                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function ModelBadge({
  model,
  faded,
  onClick,
}: {
  model: LLMModel
  faded?: boolean
  onClick?: () => void
}) {
  const cfg = MODEL_COLORS[model]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border transition-opacity duration-150',
        cfg.bg, cfg.text, cfg.border,
        onClick ? 'cursor-pointer hover:opacity-90' : 'cursor-default',
        faded && 'opacity-30',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {model}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Delta Badge                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function DeltaBadge({ delta, direction }: { delta: number; direction: WinLossMetric['direction'] }) {
  if (direction === 'NEUTRAL') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
        <Minus className="h-3 w-3" /> 0
      </span>
    )
  }
  const isWin = direction === 'POSITIVE'
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold border',
      isWin
        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
        : 'bg-rose-500/15 text-rose-400 border-rose-500/25',
    )}>
      {isWin
        ? <TrendingUp className="h-3 w-3" />
        : <TrendingDown className="h-3 w-3" />
      }
      {isWin ? '+' : ''}{delta}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Win Row                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function WinRow({
  item,
  onNavigate,
}: {
  item: WinLossMetric
  onNavigate?: (tab: string) => void
}) {
  const categoryLink: Record<WinLossMetric['category'], string> = {
    Citations: 'prompt-opportunities',
    'Share of Voice': 'share-of-voice',
    'AIVS Dimensions': 'ai-visibility-scorecards',
    'Prompt Coverage': 'prompt-difficulty',
  }
  const tooltipText = `This metric improved by ${item.delta > 0 ? '+' : ''}${item.delta} compared to the previous period.`

  return (
    <button
      type="button"
      title={tooltipText}
      onClick={() => onNavigate?.(categoryLink[item.category])}
      className="group w-full flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-800/50 hover:border-zinc-700 px-4 py-3 text-left transition-all duration-200"
    >
      {/* Win indicator */}
      <div className="shrink-0 w-1 h-8 rounded-full bg-emerald-500/70" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white truncate">{item.metric}</span>
          {item.model && <ModelBadge model={item.model} />}
        </div>
        <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
          {item.prev} → <span className="text-emerald-400 font-semibold">{item.current}</span>
        </p>
      </div>

      {/* Delta */}
      <div className="flex items-center gap-2 shrink-0">
        <DeltaBadge delta={item.delta} direction={item.direction} />
        <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
      </div>
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Loss Row (expandable)                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

function LossRow({
  item,
  onNavigate,
}: {
  item: WinLossMetric
  onNavigate?: (tab: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden transition-all duration-200">
      {/* Main row */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors"
      >
        {/* Loss indicator */}
        <div className="shrink-0 w-1 h-8 rounded-full bg-rose-500/70" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white truncate">{item.metric}</span>
            {item.model && <ModelBadge model={item.model} />}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
            {item.prev} → <span className="text-rose-400 font-semibold">{item.current}</span>
          </p>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          <DeltaBadge delta={item.delta} direction={item.direction} />
          {item.fix && (
            <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 transition-colors hidden sm:inline">
              Fix available
            </span>
          )}
          <ChevronDown className={cn(
            'h-4 w-4 text-zinc-500 transition-transform duration-200',
            expanded && 'rotate-180',
          )} />
        </div>
      </button>

      {/* Expanded fix chip */}
      {expanded && item.fix && (
        <div className="mx-4 mb-3 rounded-xl border border-amber-500/20 bg-amber-950/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                  Recommended Fix
                </span>
              </div>
              <p className="text-sm font-medium text-white mb-1">{item.fix.title}</p>
              {item.fix.issue && (
                <p className="text-[12px] text-zinc-400 leading-relaxed">{item.fix.issue}</p>
              )}
              <div className="flex items-center gap-2 mt-2.5">
                {/* Impact */}
                <span className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                  IMPACT_COLORS[item.fix.impact].bg,
                  IMPACT_COLORS[item.fix.impact].text,
                  IMPACT_COLORS[item.fix.impact].border,
                )}>
                  Impact: {item.fix.impact}
                </span>
                {/* Effort */}
                <span className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                  IMPACT_COLORS[item.fix.effort].bg,
                  IMPACT_COLORS[item.fix.effort].text,
                  IMPACT_COLORS[item.fix.effort].border,
                )}>
                  Effort: {item.fix.effort}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.(item.fix!.link)}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
            >
              Fix it
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* No fix available */}
      {expanded && !item.fix && (
        <p className="mx-4 mb-3 text-[12px] text-zinc-500 px-2">
          No specific fix available. Review related modules for guidance.
        </p>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Skeleton                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 rounded-full bg-zinc-700/60" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-40 bg-zinc-700/60 rounded" />
              <div className="h-2.5 w-24 bg-zinc-700/40 rounded" />
            </div>
            <div className="h-6 w-12 bg-zinc-700/50 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Empty state for a column                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

function ColumnEmpty({ type }: { type: 'wins' | 'losses' }) {
  if (type === 'wins') {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <Activity className="h-8 w-8 text-zinc-600 mb-3" />
        <p className="text-sm text-zinc-400">No wins this period — take action on your losses below.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <Trophy className="h-8 w-8 text-emerald-500/60 mb-3" />
      <p className="text-sm font-medium text-white mb-1">No losses this period.</p>
      <p className="text-xs text-zinc-500">Maintain your current content and schema schedule.</p>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Empty — no data at all                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

function NoDataState({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center mb-5">
        <Activity className="h-8 w-8 text-zinc-500" />
      </div>
      <h3 className="text-base font-semibold text-white mb-2">No movement detected this period.</h3>
      <p className="text-sm text-zinc-400 max-w-xs mb-6">
        This means no data was collected. Ensure prompt tracking is active.
      </p>
      <button
        onClick={() => onNavigate?.('prompt-opportunities')}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium border border-white/10 transition-all duration-200"
      >
        <Zap className="h-4 w-4" />
        Set Up Prompt Tracking
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Main Panel                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function WinsLossesPanel({ jobId, onNavigate }: WinsLossesPanelProps) {
  const [activeCategory, setActiveCategory] = useState<WinLossCategory | 'ALL'>('ALL')
  const [activeModel, setActiveModel] = useState<LLMModel | null>(null)

  const { data, isLoading, isError, refetch } = useGetWinsLossesQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  /* ── Derived filtered lists ─── */
  function applyFilters(items: WinLossMetric[]) {
    return items.filter(item => {
      if (activeCategory !== 'ALL' && item.category !== activeCategory) return false
      if (activeModel && item.model !== activeModel) return false
      return true
    })
  }

  const wins   = applyFilters(data?.wins   ?? [])
  const losses = applyFilters(data?.losses ?? [])

  /* ── Models that appear in current data ─── */
  const presentModels = ALL_MODELS.filter(m =>
    [...(data?.wins ?? []), ...(data?.losses ?? []), ...(data?.stable ?? [])].some(
      item => item.model === m,
    ),
  )

  /* ── Header stats ─── */
  const totalWins   = data?.wins.length   ?? 0
  const totalLosses = data?.losses.length ?? 0

  /* ── Loading ─── */
  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 h-16 animate-pulse" />
        {/* Filters skeleton */}
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-zinc-800 rounded-full animate-pulse" />
          ))}
        </div>
        {/* Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="h-4 w-16 bg-zinc-800 rounded animate-pulse" />
            <SkeletonRows count={4} />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-16 bg-zinc-800 rounded animate-pulse" />
            <SkeletonRows count={4} />
          </div>
        </div>
        <p className="text-center text-xs text-zinc-500 animate-pulse">
          Calculating your wins and losses…
        </p>
      </div>
    )
  }

  /* ── Error ─── */
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <AlertCircle className="h-10 w-10 text-rose-400 mb-4" />
        <p className="text-sm font-medium text-white mb-1">Could not load wins & losses.</p>
        <p className="text-xs text-zinc-400 mb-5">Retry or contact support if the issue persists.</p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium border border-white/10 transition-all"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    )
  }

  /* ── No data ─── */
  if (!data?.has_data) {
    return <NoDataState onNavigate={onNavigate} />
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Wins &amp; Losses</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Comparing current vs previous period · {data.period_days}-day window
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Summary pills */}
          {totalWins > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
              <TrendingUp className="h-3 w-3" /> {totalWins} win{totalWins !== 1 ? 's' : ''}
            </span>
          )}
          {totalLosses > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold border bg-rose-500/10 text-rose-400 border-rose-500/25">
              <TrendingDown className="h-3 w-3" /> {totalLosses} loss{totalLosses !== 1 ? 'es' : ''}
            </span>
          )}
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Category Filter ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setActiveCategory(cat.value)}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-semibold border transition-all duration-150',
              activeCategory === cat.value
                ? 'bg-white/10 text-white border-white/20'
                : 'bg-transparent text-zinc-400 border-zinc-700/60 hover:border-zinc-600 hover:text-zinc-300',
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── Model Filter ─── */}
      {presentModels.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {presentModels.map(model => (
            <div key={model} onClick={() => setActiveModel(prev => (prev === model ? null : model))}>
              <ModelBadge
                model={model}
                faded={activeModel !== null && activeModel !== model}
              />
            </div>
          ))}
          {activeModel && (
            <span className="text-[10px] text-zinc-500 ml-1">
              Showing {activeModel} data only. Click again to show all models.
            </span>
          )}
        </div>
      )}

      {/* ── Two-column layout ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WINS */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Wins</h3>
            <span className="ml-auto text-[11px] text-zinc-500">{wins.length} metric{wins.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2">
            {wins.length === 0 ? (
              <ColumnEmpty type="wins" />
            ) : (
              wins.map((item, i) => (
                <WinRow key={`${item.metric}-${i}`} item={item} onNavigate={onNavigate} />
              ))
            )}
          </div>
        </div>

        {/* LOSSES */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-rose-400" />
            <h3 className="text-sm font-semibold text-white">Losses</h3>
            <span className="ml-auto text-[11px] text-zinc-500">{losses.length} metric{losses.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2">
            {losses.length === 0 ? (
              <ColumnEmpty type="losses" />
            ) : (
              losses.map((item, i) => (
                <LossRow key={`${item.metric}-${i}`} item={item} onNavigate={onNavigate} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Stable metrics (collapsed summary) ─── */}
      {(data.stable?.length ?? 0) > 0 && (
        <p className="text-center text-[11px] text-zinc-600">
          {data.stable.length} metric{data.stable.length !== 1 ? 's' : ''} remained stable this period.
        </p>
      )}
    </div>
  )
}
