'use client'

import { useMemo, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  Loader2,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetWinsLossesQuery } from '@/store/api/winsLossesApi'
import type { WLMetricRow, WLCategory, WLFix } from '@/store/api/winsLossesApi'
import { useRunModuleFAnalysisMutation } from '@/store/api/module_F/moduleFApi'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectDateRangePreset, setPreset } from '@/store/slices/dateRangeSlice'

/* ==========================================================================
   Types & constants
   ========================================================================== */

type Period = '7d' | '30d'
type CategoryFilter = 'ALL' | 'Citations' | 'Share of Voice' | 'AIVS Dimensions' | 'Prompts'
const ALL_CATEGORIES: { id: CategoryFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'Citations', label: 'Citations' },
  { id: 'Share of Voice', label: 'Share of Voice' },
  { id: 'AIVS Dimensions', label: 'AIVS Dimensions' },
  { id: 'Prompts', label: 'Prompts' },
]

const MODEL_COLORS: Record<string, string> = {
  ChatGPT: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  Gemini: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  Perplexity: 'bg-teal-500/15 text-teal-300 border border-teal-500/25',
  Claude: 'bg-orange-500/15 text-orange-300 border border-orange-500/25',
  Overall: 'bg-violet-500/15 text-violet-300 border border-violet-500/25',
}
const MODEL_SOLID: Record<string, string> = {
  ChatGPT: 'bg-blue-500 text-white',
  Gemini: 'bg-emerald-500 text-white',
  Perplexity: 'bg-teal-500 text-white',
  Claude: 'bg-orange-500 text-white',
  Overall: 'bg-violet-500 text-white',
}

function modelColor(model: string, solid = false) {
  const base = solid ? MODEL_SOLID : MODEL_COLORS
  return base[model] ?? (solid ? 'bg-zinc-500 text-white' : 'bg-zinc-700/50 text-zinc-300 border border-zinc-600/30')
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(1)
}

/* ==========================================================================
   Skeleton loader
   ========================================================================== */
function SkeletonRows() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-14 rounded-xl bg-zinc-800/40" />
      ))}
    </div>
  )
}

/* ==========================================================================
   No-baseline state
   ========================================================================== */
function NoBaselineState({ onRun, isRunning }: { onRun?: () => void; isRunning?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-5">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center">
        <Info className="h-7 w-7 text-amber-400" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-white">No baseline yet</h3>
        <p className="text-zinc-400 text-sm max-w-sm">
          Your first comparison appears after Colytics collects data across two periods. Run analysis again later,
          then return here to see wins, losses, and recommended fixes.
        </p>
      </div>
      {onRun && (
        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-300 text-sm font-semibold hover:bg-amber-500/25 hover:border-amber-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Queuing analysis…</>
          ) : (
            <><RefreshCw className="h-4 w-4" />Run analysis</>
          )}
        </button>
      )}
      {isRunning && (
        <p className="text-zinc-500 text-xs">Analysis queued — refresh in a few minutes to see your first comparison.</p>
      )}
    </div>
  )
}

/* ==========================================================================
   Empty states
   ========================================================================== */
function EmptyWins() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
        <Minus className="h-5 w-5 text-zinc-500" />
      </div>
      <p className="text-zinc-500 text-sm">No wins this period — take action on your losses below.</p>
    </div>
  )
}
function EmptyLosses() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
        <Trophy className="h-5 w-5 text-emerald-400" />
      </div>
      <p className="text-zinc-400 text-sm">No losses this period. Maintain your current content and schema schedule.</p>
    </div>
  )
}

/* ==========================================================================
   Fix chip (expandable)
   ========================================================================== */
function FixChip({ fix, onNavigate }: { fix: WLFix; onNavigate?: (tab: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mt-2 rounded-xl border border-rose-500/15 bg-rose-950/10 overflow-hidden">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-rose-500/5 transition-colors"
      >
        <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wide flex-1">
          Recommended Fix
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-rose-400/60 transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[13px] font-medium text-white">{fix.title}</p>
          {fix.issue && (
            <p className="text-[11px] text-zinc-400 leading-relaxed">{fix.issue}</p>
          )}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                fix.impact === 'HIGH'
                  ? 'bg-rose-500/20 text-rose-300'
                  : fix.impact === 'MEDIUM'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-zinc-700/60 text-zinc-400',
              )}
            >
              Impact: {fix.impact}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                fix.effort === 'LOW'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : fix.effort === 'MEDIUM'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-rose-500/20 text-rose-300',
              )}
            >
              Effort: {fix.effort}
            </span>
          </div>
          {onNavigate && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(fix.link) }}
              className="flex items-center gap-1 text-[12px] text-rose-400 hover:text-rose-300 transition-colors font-medium mt-1"
            >
              Go to fix location <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ==========================================================================
   Win Row
   ========================================================================== */
function WinRow({
  row,
  onNavigate,
  activeModel,
  periodLabel,
}: {
  row: WLMetricRow
  onNavigate?: (tab: string) => void
  activeModel: string | null
  periodLabel: string
}) {
  const dimmed = activeModel !== null && row.model !== activeModel

  return (
    <div
      className={cn(
        'group rounded-xl border px-4 py-3 cursor-pointer transition-all duration-200',
        dimmed
          ? 'border-zinc-800/30 bg-zinc-900/20 opacity-40'
          : 'border-emerald-500/15 bg-emerald-950/10 hover:border-emerald-500/30 hover:bg-emerald-950/20',
      )}
      onClick={() => row.category && onNavigate?.(
        row.category === 'Citations' ? 'prompt-opportunities' :
        row.category === 'Share of Voice' ? 'share-of-voice' :
        row.category === 'AIVS' ? 'ai-visibility-scorecards' :
        row.category === 'Prompt Coverage' ? 'prompt-opportunities' :
        'keyword-intelligence',
      )}
      title={`This metric improved by ${row.delta > 0 ? '+' : ''}${formatValue(row.delta)} compared to the previous ${periodLabel}.`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[13px] font-medium text-white leading-snug">{row.metric}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', modelColor(row.model))}>
              {row.model}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-zinc-400">
            <span>{formatValue(row.prev)}</span>
            <ChevronRight className="h-3 w-3 text-zinc-600" />
            <span className="text-emerald-300 font-semibold">{formatValue(row.current)}</span>
          </div>
        </div>
        <span className="shrink-0 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[12px] font-bold">
          +{formatValue(row.delta)}
        </span>
      </div>
    </div>
  )
}

/* ==========================================================================
   Loss Row
   ========================================================================== */
function LossRow({ row, onNavigate, activeModel }: { row: WLMetricRow; onNavigate?: (tab: string) => void; activeModel: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const dimmed = activeModel !== null && row.model !== activeModel

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-200',
        dimmed
          ? 'border-zinc-800/30 bg-zinc-900/20 opacity-40'
          : 'border-rose-500/15 bg-rose-950/10 hover:border-rose-500/25 hover:bg-rose-950/15',
      )}
    >
      <div
        className="px-4 py-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-7 h-7 rounded-lg bg-rose-500/15 flex items-center justify-center shrink-0">
            <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[13px] font-medium text-white leading-snug">{row.metric}</span>
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', modelColor(row.model))}>
                {row.model}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-zinc-400">
              <span>{formatValue(row.prev)}</span>
              <ChevronRight className="h-3 w-3 text-zinc-600" />
              <span className="text-rose-300 font-semibold">{formatValue(row.current)}</span>
            </div>
            {!expanded && row.fix && (
              <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/15">
                <span className="text-[10px] font-bold uppercase tracking-wide text-rose-400">
                  Recommended Fix
                </span>
                <span className="text-[11px] text-zinc-300 truncate max-w-[260px]">
                  {row.fix.title}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-[12px] font-bold">
              {formatValue(row.delta)}
            </span>
            {row.fix && (
              <ChevronDown
                className={cn('h-4 w-4 text-zinc-500 transition-transform', expanded && 'rotate-180')}
              />
            )}
          </div>
        </div>
      </div>
      {expanded && row.fix && (
        <div className="px-4 pb-3">
          <FixChip fix={row.fix} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}

/* ==========================================================================
   Main panel
   ========================================================================== */
interface WinsLossesPanelProps {
  jobId?: string | null
  onNavigate?: (tab: string) => void
}

export default function WinsLossesPanel({ jobId, onNavigate }: WinsLossesPanelProps) {
  const dispatch = useAppDispatch()
  const preset = useAppSelector((s: any) => selectDateRangePreset(s))
  const period: Period = preset
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL')
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [runQueued, setRunQueued] = useState(false)

  const [runModuleFAnalysis, { isLoading: isTriggering }] = useRunModuleFAnalysisMutation()

  const handleRunAnalysis = async () => {
    if (!jobId) return
    try {
      await runModuleFAnalysis(jobId).unwrap()
      setRunQueued(true)
    } catch {
      // best-effort; user can retry
    }
  }

  const { data, isLoading, isFetching, refetch } = useGetWinsLossesQuery(
    { jobId: jobId!, period },
    { skip: !jobId, refetchOnMountOrArgChange: true },
  )

  // Collect models from data for the model filter pills
  const allModels = useMemo(
    () => (data ? Array.from(new Set([...data.wins, ...data.losses].map((r) => r.model))) : []),
    [data],
  )

  const rowMatchesFilters = (r: WLMetricRow) => {
    if (categoryFilter === 'Citations' && r.category !== 'Citations') return false
    if (categoryFilter === 'Share of Voice' && r.category !== 'Share of Voice') return false
    if (categoryFilter === 'Prompts' && r.category !== 'Prompt Coverage') return false
    if (categoryFilter === 'AIVS Dimensions' && !(r.category === 'AIVS' || r.category === 'Visibility')) return false
    if (activeModel !== null && r.model !== activeModel) return false
    return true
  }

  const filterRows = (rows: WLMetricRow[]) => {
    let filtered = rows
    if (categoryFilter !== 'ALL' || activeModel !== null) filtered = filtered.filter(rowMatchesFilters)
    return filtered
  }

  const filteredWins = data ? filterRows(data.wins) : []
  const filteredLosses = data ? filterRows(data.losses) : []
  const filteredAllMetrics = data?.all_metrics ? data.all_metrics.filter(rowMatchesFilters) : []
  const filteredStableMetrics = filteredAllMetrics.filter((r) => r.direction === 'STABLE')
  const hasOnlyStableForCurrentFilter =
    !!data &&
    data.has_baseline &&
    filteredWins.length === 0 &&
    filteredLosses.length === 0 &&
    filteredStableMetrics.length > 0

  const handleModelClick = (model: string) => {
    setActiveModel((prev) => (prev === model ? null : model))
  }

  const loading = isLoading || isFetching
  const periodLabel = period === '7d' ? '7 days' : '30 days'

  return (
    <div className="space-y-6 animate-fade-in-hero">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Wins &amp; Losses</h2>
          <p className="text-zinc-400 text-sm mt-1">
            Track every metric that improved or declined since the previous period.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period toggle */}
          <div className="flex items-center rounded-xl border border-zinc-700/50 bg-zinc-900/60 overflow-hidden">
            {(['7d', '30d'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => dispatch(setPreset(p))}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors',
                  period === p
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:text-white',
                )}
              >
                {p === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="p-2 rounded-xl border border-zinc-700/50 bg-zinc-900/60 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Model filter pills */}
      {allModels.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wide font-semibold mr-1">Model</span>
            {allModels.map((model) => (
              <button
                key={model}
                onClick={() => handleModelClick(model)}
                className={cn(
                  'px-3 py-1 rounded-full text-[12px] font-semibold transition-all duration-200',
                  activeModel === model
                    ? modelColor(model, true)
                    : activeModel !== null
                    ? cn(modelColor(model), 'opacity-40')
                    : modelColor(model),
                )}
              >
                {model}
              </button>
            ))}
          </div>
          {activeModel && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] text-zinc-500">
                Showing <span className="text-zinc-300 font-medium">{activeModel}</span> data only. Click again to show all models.
              </span>
              <button
                onClick={() => setActiveModel(null)}
                className="px-3 py-1 rounded-full text-[12px] text-zinc-400 hover:text-white border border-zinc-700/50 hover:border-zinc-600 transition-colors"
              >
                Show all models
              </button>
            </div>
          )}
        </div>
      )}

      {/* Category pill tabs */}
      <div className="flex items-center gap-2 flex-wrap border-b border-zinc-800/60 pb-4">
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200',
              categoryFilter === cat.id
                ? 'bg-white/10 text-white border border-white/15'
                : 'text-zinc-500 border border-transparent hover:text-zinc-300 hover:border-zinc-700/50',
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-4">
          <p className="text-zinc-500 text-sm text-center animate-pulse">Calculating your wins and losses...</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SkeletonRows />
            <SkeletonRows />
          </div>
        </div>
      )}

      {/* No baseline */}
      {!loading && data && !data.has_baseline && (
        <NoBaselineState onRun={handleRunAnalysis} isRunning={isTriggering || runQueued} />
      )}

      {/* All empty (no movement) */}
      {!loading && data && data.has_baseline && data.wins.length === 0 && data.losses.length === 0 && !hasOnlyStableForCurrentFilter && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <Minus className="h-7 w-7 text-zinc-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">No movement detected this period</h3>
            <p className="text-zinc-400 text-sm max-w-md">
              No movement detected this period. This means no data was collected. Ensure prompt tracking is active.
            </p>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('keyword-intelligence')}
              className="px-5 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm font-semibold hover:bg-white/15 hover:border-white/25 transition-all"
            >
              Set Up Prompt Tracking
            </button>
          )}
        </div>
      )}

      {/* Stable-only state for current filter (especially Prompts tab) */}
      {!loading && hasOnlyStableForCurrentFilter && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <Minus className="h-6 w-6 text-zinc-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">All selected metrics are stable</h3>
          <p className="text-zinc-400 text-sm max-w-xl">
            {categoryFilter === 'Prompts'
              ? `Prompt visibility and prompt appearance metrics are stable for ${periodLabel} compared to the previous ${periodLabel}.`
              : `No win/loss movement for the selected filters. Metrics are stable for ${periodLabel} compared to the previous ${periodLabel}.`}
          </p>
        </div>
      )}

      {/* Columns */}
      {!loading && data && data.has_baseline && (data.wins.length > 0 || data.losses.length > 0) && (
        <>
          {/* Date range context */}
          {data.prior_date && data.current_date && (
            <p className="text-[12px] text-zinc-500">
              Comparing{' '}
              <span className="text-zinc-400 font-medium">{data.prior_date}</span>
              {' '}→{' '}
              <span className="text-zinc-400 font-medium">{data.current_date}</span>
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Wins column */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">
                  Wins
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[11px] font-bold">
                  {filteredWins.length}
                </span>
              </div>
              {filteredWins.length === 0 ? (
                <EmptyWins />
              ) : (
                filteredWins.map((row, i) => (
                  <WinRow
                    key={`win-${i}`}
                    row={row}
                    onNavigate={onNavigate}
                    activeModel={activeModel}
                    periodLabel={periodLabel}
                  />
                ))
              )}
            </div>

            {/* Losses column */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-lg bg-rose-500/15 flex items-center justify-center">
                  <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                </div>
                <h3 className="text-sm font-semibold text-rose-400 uppercase tracking-wide">
                  Losses
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[11px] font-bold">
                  {filteredLosses.length}
                </span>
              </div>
              {filteredLosses.length === 0 ? (
                <EmptyLosses />
              ) : (
                filteredLosses.map((row, i) => (
                  <LossRow
                    key={`loss-${i}`}
                    row={row}
                    onNavigate={onNavigate}
                    activeModel={activeModel}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
