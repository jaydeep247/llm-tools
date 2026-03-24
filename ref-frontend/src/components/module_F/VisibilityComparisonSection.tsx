'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  type ModuleFMetricRecommendation,
  type ModuleFPerModelStats,
  type ModuleFCompareVisibilityEntityRow,
  useGetModuleFResultQuery,
  useRunModuleFAnalysisMutation,
  resolveD7Output,
  resolveFeatureFlags,
} from '@/store/api/module_F/moduleFApi'
import {
  ArrowDown, ArrowUp, CheckCircle2, Eye, Loader2, Percent, Swords,
  Info, Shield, ChevronDown, ChevronUp, Gauge, TrendingUp, TrendingDown,
  Star, Globe, MessageSquare, Link2,
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface VisibilityComparisonSectionProps {
  jobId?: string | null
}

function getVisibilityColor(score: number) {
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-blue-400'
  if (score >= 25) return 'text-amber-400'
  return 'text-red-400'
}

function getGradeColor(grade: string) {
  if (grade === 'A+' || grade === 'A') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
  if (grade === 'B') return 'text-blue-400 bg-blue-500/10 border-blue-500/25'
  if (grade === 'C') return 'text-amber-400 bg-amber-500/10 border-amber-500/25'
  return 'text-red-400 bg-red-500/10 border-red-500/25'
}

function formatDelta(delta?: number | null) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return '—'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(2)}`
}

function normalizeMetricRecommendation(value: unknown): ModuleFMetricRecommendation | null {
  if (!value) return null
  if (typeof value === 'string') return { why: '', fix: value }
  if (typeof value === 'object') {
    const rec = value as Partial<ModuleFMetricRecommendation>
    const why = typeof rec.why === 'string' ? rec.why : ''
    const fix = typeof rec.fix === 'string' ? rec.fix : ''
    if (!why && !fix) return null
    return { why, fix }
  }
  return null
}

function MetricTooltip({ rec }: { rec: ModuleFMetricRecommendation }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 transition-colors" />
        </TooltipTrigger>
        <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-w-xs text-xs p-3">
          {rec.why && (
            <>
              <div className="font-medium text-zinc-100 mb-1">Why this score</div>
              <div className="text-zinc-300">{rec.why}</div>
            </>
          )}
          <div className={cn('font-medium text-zinc-100', rec.why ? 'mt-3 mb-1' : 'mb-1')}>
            How to improve
          </div>
          <div className="text-zinc-300">{rec.fix}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function PerModelBreakdown({ perModel, entityName }: { perModel: Record<string, ModuleFPerModelStats>; entityName: string }) {
  const models = Object.entries(perModel)
  if (!models.length) return null

  const MODEL_COLORS: Record<string, string> = {
    openai: 'border-emerald-500/20 bg-emerald-500/5',
    gemini: 'border-blue-500/20 bg-blue-500/5',
    claude: 'border-purple-500/20 bg-purple-500/5',
  }

  return (
    <div className="mt-3 space-y-2.5">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-2">
        <div className="h-px flex-1 bg-zinc-800/50" />
        Per-model breakdown — {entityName}
        <div className="h-px flex-1 bg-zinc-800/50" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {models.map(([model, stats]) => {
          const modelKey = model.toLowerCase()
          const colorCls = MODEL_COLORS[modelKey] ?? 'border-zinc-800 bg-zinc-900/40'
          return (
            <div key={model} className={cn('rounded-xl border p-3.5 space-y-2.5', colorCls)}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200 capitalize">{model}</span>
                {stats.rank != null && (
                  <Badge className="bg-zinc-800/80 text-zinc-400 border-zinc-700 text-[10px]">
                    #{stats.rank}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3 text-zinc-500" />
                  <span className="text-zinc-500">Mentions</span>
                  <span className="text-zinc-300 font-mono ml-auto">{stats.mentions}</span>
                </div>
                {stats.sentiment != null && (
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-500">Sentiment</span>
                    <span className={cn('font-mono ml-auto', stats.sentiment > 0 ? 'text-emerald-400' : stats.sentiment < 0 ? 'text-rose-400' : 'text-zinc-400')}>
                      {stats.sentiment > 0 ? '+' : ''}{stats.sentiment.toFixed(2)}
                    </span>
                  </div>
                )}
                {stats.in_title != null && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-500">In title</span>
                    <span className={cn('ml-auto', stats.in_title ? 'text-emerald-400' : 'text-zinc-600')}>
                      {stats.in_title ? 'Yes' : 'No'}
                    </span>
                  </div>
                )}
                {stats.citation_present != null && (
                  <div className="flex items-center gap-1.5">
                    <Link2 className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-500">Cited</span>
                    <span className={cn('ml-auto', stats.citation_present ? 'text-emerald-400' : 'text-zinc-600')}>
                      {stats.citation_present ? 'Yes' : 'No'}
                    </span>
                  </div>
                )}
              </div>
              {stats.cited_urls && stats.cited_urls.length > 0 && (
                <div className="pt-2 border-t border-zinc-800/30">
                  <div className="text-[10px] text-zinc-600 mb-1">Cited URLs</div>
                  {stats.cited_urls.slice(0, 2).map((url, i) => (
                    <div key={i} className="text-[10px] text-zinc-500 truncate font-mono">{url}</div>
                  ))}
                  {stats.cited_urls.length > 2 && (
                    <div className="text-[10px] text-zinc-700 mt-0.5">+{stats.cited_urls.length - 2} more</div>
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

function ModelBenchmarkMatrix({
  brand,
  competitors,
}: {
  brand: ModuleFCompareVisibilityEntityRow | null
  competitors: ModuleFCompareVisibilityEntityRow[]
}) {
  const entities = useMemo(() => (brand ? [brand, ...competitors] : competitors), [brand, competitors])

  const models = useMemo(() => {
    const m = new Set<string>()
    entities.forEach((e) => Object.keys(e.per_model ?? {}).forEach((k) => m.add(k)))
    return Array.from(m).sort((a, b) => a.localeCompare(b))
  }, [entities])

  if (!entities.length || !models.length) return null

  return (
    <div className="bg-[#111113] rounded-xl border border-zinc-800 overflow-hidden">
      <div className="p-4 border-b border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-100">Model-by-Model Benchmark</h3>
        <p className="text-[11px] text-zinc-600 mt-0.5">
          Leader cell per model is highlighted. Each cell shows rank and mentions.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400">
              <th className="p-3 font-medium sticky left-0 bg-zinc-900/50">Entity</th>
              {models.map((model) => (
                <th key={model} className="p-3 font-medium capitalize">{model}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {entities.map((entity) => (
              <tr key={entity.name} className="hover:bg-zinc-900/40 transition-colors">
                <td className="p-3 sticky left-0 bg-[#111113]">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-100 font-medium truncate max-w-48">{entity.name}</span>
                    {entity.entity_type === 'client' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">you</span>
                    )}
                  </div>
                </td>
                {models.map((model) => {
                  const stats = entity.per_model?.[model]
                  const rank = stats?.rank ?? null
                  const mentions = stats?.mentions ?? 0
                  const bestRank = entities.reduce<number | null>((best, e) => {
                    const r = e.per_model?.[model]?.rank
                    if (r == null) return best
                    if (best == null || r < best) return r
                    return best
                  }, null)
                  const isLeader = rank != null && bestRank != null && rank === bestRank

                  return (
                    <td key={`${entity.name}-${model}`} className="p-3">
                      {stats ? (
                        <div className={cn(
                          'rounded-md border px-2.5 py-2 text-xs',
                          isLeader ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-900/40'
                        )}>
                          <div className={cn('font-mono', isLeader ? 'text-emerald-300' : 'text-zinc-300')}>
                            {rank != null ? `#${rank}` : '—'}
                          </div>
                          <div className="text-zinc-600 mt-0.5">mentions {mentions}</div>
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function VisibilityComparisonSection({ jobId }: VisibilityComparisonSectionProps) {
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [justCompleted, setJustCompleted] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | undefined>(undefined)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const [runModuleFAnalysis, { isLoading: isTriggering }] = useRunModuleFAnalysisMutation()

  const { data: polledData } = useGetModuleFResultQuery(jobId ?? '', {
    skip: !jobId,
    pollingInterval: isPolling ? 5000 : 0,
    refetchOnMountOrArgChange: true,
  })

  const result = polledData?.data ?? null
  const updatedAt = result?.updatedAt
  const comparison = result?.compare_visibility_against_competitors
  const recommendations = result?.recommendations ?? result?.metric_recommendations ?? null
  const d7 = resolveD7Output(result)
  const flags = resolveFeatureFlags(result)

  useEffect(() => {
    if (!isPolling) return
    if (updatedAt && updatedAt !== lastUpdatedAt && comparison) {
      setIsPolling(false)
      setPollCount(0)
      setLastUpdatedAt(updatedAt)
      setJustCompleted(true)
      setTimeout(() => setJustCompleted(false), 4000)
    }
  }, [comparison, isPolling, lastUpdatedAt, updatedAt])

  useEffect(() => {
    if (isPolling && pollCount > 36) {
      setIsPolling(false)
      setPollCount(0)
    }
  }, [isPolling, pollCount])

  useEffect(() => {
    if (!isPolling) return
    const id = setInterval(() => setPollCount((c) => c + 1), 5000)
    return () => clearInterval(id)
  }, [isPolling])

  const handleRun = useCallback(async () => {
    if (!jobId) return
    try {
      setLastUpdatedAt(updatedAt)
      await runModuleFAnalysis(jobId).unwrap()
      setIsPolling(true)
      setPollCount(0)
    } catch {}
  }, [jobId, runModuleFAnalysis, updatedAt])

  const isRunning = isTriggering || isPolling

  const competitors = useMemo(() => {
    const rows = comparison?.competitors ?? []
    return [...rows].sort((a, b) => {
      if (a.display_order != null && b.display_order != null) {
        return a.display_order - b.display_order
      }
      return (b.visibility_score ?? 0) - (a.visibility_score ?? 0)
    })
  }, [comparison?.competitors])

  const brand = comparison?.brand ?? null

  const topCompetitor = useMemo(() => {
    const sorted = [...(comparison?.competitors ?? [])].sort((a, b) => (b.visibility_score ?? 0) - (a.visibility_score ?? 0))
    return sorted[0] ?? null
  }, [comparison?.competitors])

  const visibilityRec = normalizeMetricRecommendation(recommendations?.visibility_score)
  const shareRec = normalizeMetricRecommendation(recommendations?.market_share)
  const rankDeltaRec = normalizeMetricRecommendation(recommendations?.rank_delta)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/50 to-transparent p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-[#111113] border border-zinc-800">
              <Swords className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Visibility Comparison</h2>
              <p className="text-xs text-zinc-400">
                Compare brand vs competitors across AI outputs: visibility score, rank delta, and market share.
              </p>
              {comparison?.topic && (
                <div className="mt-2">
                  <Badge className="bg-zinc-800 text-zinc-400 border-0 text-[11px]">Topic: {comparison.topic}</Badge>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result?.plan && (
              <Badge variant="outline" className="text-[11px] border-zinc-700 text-zinc-500 hidden sm:flex capitalize">
                {result.plan}
              </Badge>
            )}
            {updatedAt && (
              <Badge variant="outline" className="text-[11px] border-zinc-700 text-zinc-400 hidden sm:flex">
                Updated: {new Date(updatedAt).toLocaleString()}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 text-xs text-blue-200 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Querying OpenAI, Gemini & Claude — results will appear automatically…</span>
        </div>
      )}

      {comparison?.error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-lg px-4 py-3 text-sm">
          {comparison.error}
        </div>
      )}

      {!comparison && !isRunning && (
        <AnalysisEmptyState
          icon={<Swords className="w-8 h-8 text-zinc-400" />}
          title="No Visibility Comparison Data"
          description="Run the analysis to compare your brand's AI visibility score against competitors across OpenAI, Gemini & Claude."
          onRunAnalysis={handleRun}
          isAnalyzing={isRunning}
          disabled={!jobId}
          buttonLabel="Run Analysis"
        />
      )}

      {comparison && (
        <div className={cn('grid gap-4', d7 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3')}>
          <Card className="bg-[#111113] rounded-xl border border-zinc-800 p-5 hover:bg-[#0D0D10] transition-colors">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 shrink-0">
                <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15" fill="none"
                    stroke={
                      (brand?.visibility_score ?? 0) >= 75 ? '#34d399'
                        : (brand?.visibility_score ?? 0) >= 50 ? '#60a5fa'
                        : (brand?.visibility_score ?? 0) >= 25 ? '#fbbf24' : '#f87171'
                    }
                    strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${((brand?.visibility_score ?? 0) / 100) * 94.2} 94.2`}
                  />
                </svg>
                <Eye className="w-4 h-4 text-blue-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                  Your Visibility
                  {visibilityRec && <MetricTooltip rec={visibilityRec} />}
                </div>
                <div className={cn('text-3xl font-bold', getVisibilityColor(brand?.visibility_score ?? 0))}>
                  {(brand?.visibility_score ?? 0).toFixed(1)}
                </div>
                <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                  {brand?.name ?? 'Brand'}
                  {brand?.entity_type === 'client' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">client</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-[#111113] rounded-xl border border-zinc-800 p-5 hover:bg-[#0D0D10] transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-xl">
                <Swords className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-zinc-400">Top Competitor</div>
                <div className="text-xl font-semibold text-zinc-100 truncate">
                  {topCompetitor?.name ?? '—'}
                </div>
                <div className="text-xs text-zinc-500">
                  Score: {(topCompetitor?.visibility_score ?? 0).toFixed(1)}
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-[#111113] rounded-xl border border-zinc-800 p-5 hover:bg-[#0D0D10] transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-xl">
                <Percent className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                  Market Share
                  {shareRec && <MetricTooltip rec={shareRec} />}
                </div>
                <div className="text-3xl font-bold text-zinc-100">
                  {(brand?.market_share_percent ?? 0).toFixed(1)}%
                </div>
                <div className="text-xs text-zinc-500">{competitors.length} competitors tracked</div>
              </div>
            </div>
          </Card>

          {d7 && (
            <Card className="bg-[#111113] rounded-xl border border-zinc-800 p-5 hover:bg-[#0D0D10] transition-colors">
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15" fill="none" stroke="#f59e0b"
                      strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={`${((d7.d7_score ?? 0) / 100) * 94.2} 94.2`}
                    />
                  </svg>
                  <Gauge className="w-4 h-4 text-amber-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                    AIVS™ D7 Score
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 transition-colors" />
                        </TooltipTrigger>
                        <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-w-xs text-xs p-3">
                          <div className="font-medium text-zinc-100 mb-1">Competitive Citation Gap Score</div>
                          <div className="text-zinc-300 mb-2">D7 contributes 15% to your overall AIVS™ score. It measures competitive citation share, content gaps, and source overlap.</div>
                          <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between"><span className="text-zinc-500">Share of Voice (30%)</span><span className="text-zinc-300">{d7.param_breakdown?.sov?.score?.toFixed(1) ?? '—'}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Content Gaps (35%)</span><span className="text-zinc-300">{d7.param_breakdown?.gaps?.score?.toFixed(1) ?? '—'}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Source Overlap (35%)</span><span className="text-zinc-300">{d7.param_breakdown?.overlap?.score?.toFixed(1) ?? '—'}</span></div>
                          </div>
                          <div className="mt-2 pt-2 border-t border-zinc-800 text-[11px]">
                            <span className="text-zinc-500">AIVS™ contribution: </span>
                            <span className="text-amber-400 font-mono">{d7.aivs_d7_contribution?.toFixed(2) ?? '—'}</span>
                            <span className="text-zinc-600"> / 15.00</span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-zinc-100">{d7.d7_score?.toFixed(1)}</span>
                    <span className={cn('text-sm font-bold px-1.5 py-0.5 rounded border', getGradeColor(d7.d7_grade))}>
                      {d7.d7_grade}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                    {d7.d7_delta != null && (
                      <span className={cn('font-mono', d7.d7_delta > 0 ? 'text-emerald-400' : d7.d7_delta < 0 ? 'text-rose-400' : 'text-zinc-500')}>
                        {d7.d7_delta > 0 ? '+' : ''}{d7.d7_delta.toFixed(1)} pts
                      </span>
                    )}
                    {d7.grade_change && (
                      <span className={cn('text-[10px]', d7.grade_change === 'improved' ? 'text-emerald-400' : 'text-rose-400')}>
                        Grade {d7.grade_change}
                      </span>
                    )}
                    {d7.d7_delta == null && <span className="text-zinc-600">First run</span>}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {comparison && competitors.length > 0 && (
        <div className="bg-[#111113] rounded-xl border border-zinc-800 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-zinc-800 rounded-lg">
                <Swords className="w-3.5 h-3.5 text-zinc-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-100">Competitor Leaderboard</div>
                <div className="text-[11px] text-zinc-600">{competitors.length} entities tracked</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!flags.leaderboard && (
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/25 text-[10px]">
                  Upgrade to unlock
                </Badge>
              )}
              <Badge className="bg-zinc-900 text-zinc-400 border-zinc-800 text-xs">
                {competitors[0]?.display_order != null ? 'Custom order' : 'Sorted by visibility'}
              </Badge>
            </div>
          </div>

          {flags.leaderboard ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400">
                    <th className="p-3 font-medium w-8">#</th>
                    <th className="p-3 font-medium">Entity</th>
                    <th className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Visibility
                        {visibilityRec && <MetricTooltip rec={visibilityRec} />}
                      </span>
                    </th>
                    <th className="p-3 font-medium">Benchmark</th>
                    <th className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Rank Δ vs Brand
                        {rankDeltaRec && <MetricTooltip rec={rankDeltaRec} />}
                      </span>
                    </th>
                    <th className="p-3 font-medium">Rank Move</th>
                    <th className="p-3 font-medium">Share of Voice %</th>
                    <th className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Market Share
                        {shareRec && <MetricTooltip rec={shareRec} />}
                      </span>
                    </th>
                    <th className="p-3 font-medium">7D Score Δ</th>
                    {flags.model_breakdown_view && <th className="p-3 font-medium w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {competitors.map((row, i) => {
                    const delta = row.rank_difference_vs_brand
                    const isBetter = delta !== null && delta !== undefined ? delta < 0 : false
                    const isExpanded = expandedRow === row.name

                    return (
                      <React.Fragment key={`${row.name}-${i}`}>
                        <tr className="hover:bg-zinc-900/50 transition-colors">
                          <td className="p-3 text-zinc-600 text-xs font-mono">{row.rank_position ?? i + 1}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-zinc-100 truncate max-w-55">{row.name}</span>
                              {row.entity_type === 'client' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">you</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={cn('font-semibold', getVisibilityColor(row.visibility_score ?? 0))}>
                                  {(row.visibility_score ?? 0).toFixed(1)}
                                </span>
                                <span className="text-xs text-zinc-600">/ 100</span>
                              </div>
                              <div className="h-1 w-20 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all',
                                    (row.visibility_score ?? 0) >= 75 ? 'bg-emerald-500' :
                                    (row.visibility_score ?? 0) >= 50 ? 'bg-blue-500' :
                                    (row.visibility_score ?? 0) >= 25 ? 'bg-amber-500' : 'bg-red-500'
                                  )}
                                  style={{ width: `${Math.min(100, row.visibility_score ?? 0)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-xs text-zinc-400">
                              {(row.benchmark_score ?? 0).toFixed(1)}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              {delta === null || delta === undefined ? (
                                <span className="text-zinc-500">—</span>
                              ) : isBetter ? (
                                <ArrowUp className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <ArrowDown className="w-4 h-4 text-amber-400" />
                              )}
                              <span className={cn('font-mono text-xs', delta === null || delta === undefined ? 'text-zinc-500' : isBetter ? 'text-emerald-400' : 'text-amber-400')}>
                                {formatDelta(delta)}
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            {row.rank_move != null && row.rank_move !== 0 ? (
                              <div className={cn('flex items-center gap-1 text-xs font-mono',
                                row.rank_move > 0 ? 'text-emerald-400' : 'text-rose-400'
                              )}>
                                {row.rank_move > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                                <span>{Math.abs(row.rank_move)}</span>
                              </div>
                            ) : (
                              <span className="text-zinc-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-xs text-zinc-400">
                              {(row.share_of_voice ?? 0).toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-xs text-zinc-400">
                              {(row.market_share_percent ?? 0).toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3">
                            {row.score_delta != null && row.score_delta !== 0 ? (
                              <div className="flex items-center gap-1">
                                {row.score_delta > 0 ? (
                                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <TrendingDown className="w-3 h-3 text-rose-400" />
                                )}
                                <span className={cn('font-mono text-xs', row.score_delta > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                  {row.score_delta > 0 ? '+' : ''}{row.score_delta.toFixed(1)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-zinc-600 text-xs">—</span>
                            )}
                          </td>
                          {flags.model_breakdown_view && (
                            <td className="p-3">
                              {row.per_model && Object.keys(row.per_model).length > 0 && (
                                <button
                                  onClick={() => setExpandedRow(isExpanded ? null : row.name)}
                                  className="p-1 text-zinc-700 hover:text-zinc-300 transition-colors"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                        {flags.model_breakdown_view && isExpanded && row.per_model && (
                          <tr>
                            <td colSpan={flags.model_breakdown_view ? 10 : 9} className="px-4 pb-4 bg-zinc-900/20">
                              <PerModelBreakdown perModel={row.per_model} entityName={row.name} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-zinc-600" />
              </div>
              <h3 className="text-sm font-medium text-zinc-400 mb-1">Leaderboard Locked</h3>
              <p className="text-xs text-zinc-600 max-w-sm mx-auto leading-relaxed">
                Available on Pro plans and above. Upgrade to see full competitor rankings, score deltas, and per-model breakdowns.
              </p>
            </div>
          )}
        </div>
      )}

      {comparison && competitors.length > 0 && flags.model_breakdown_view && (
        <ModelBenchmarkMatrix brand={brand} competitors={competitors} />
      )}
    </div>
  )
}

