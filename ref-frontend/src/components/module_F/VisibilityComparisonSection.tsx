'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { type ModuleFMetricRecommendation, useGetModuleFResultQuery, useRunModuleFAnalysisMutation } from '@/store/api/module_F/moduleFApi'
import { ArrowDown, ArrowUp, CheckCircle2, Eye, Loader2, Percent, Swords, Info } from 'lucide-react'
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

export default function VisibilityComparisonSection({ jobId }: VisibilityComparisonSectionProps) {
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [justCompleted, setJustCompleted] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | undefined>(undefined)

  const [runModuleFAnalysis, { isLoading: isTriggering }] = useRunModuleFAnalysisMutation()

  const { data: polledData } = useGetModuleFResultQuery(jobId ?? '', {
    skip: !jobId,
    pollingInterval: isPolling ? 5000 : 0,
    refetchOnMountOrArgChange: true,
  })

  const result = polledData?.data ?? null
  const updatedAt = result?.updatedAt
  const comparison = result?.compare_visibility_against_competitors
  const recommendations = result?.recommendations ?? null

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
    return [...rows].sort((a, b) => (b.visibility_score ?? 0) - (a.visibility_score ?? 0))
  }, [comparison?.competitors])

  const brand = comparison?.brand ?? null

  const topCompetitor = competitors[0] ?? null

  const visibilityRec = normalizeMetricRecommendation(recommendations?.visibility_score)
  const shareRec = normalizeMetricRecommendation(recommendations?.market_share)
  const rankDeltaRec = normalizeMetricRecommendation(recommendations?.rank_delta)

  return (
    <div className="space-y-6">
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
          {updatedAt && (
            <Badge variant="outline" className="text-[11px] border-zinc-700 text-zinc-400 hidden sm:flex">
              Updated: {new Date(updatedAt).toLocaleString()}
            </Badge>
          )}
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

      {comparison && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#111113] rounded-xl border border-zinc-800 p-5 hover:bg-[#0D0D10] transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-xl">
              <Eye className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                Your Visibility
                {visibilityRec && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-w-xs text-xs p-3">
                        {visibilityRec.why && (
                          <>
                            <div className="font-medium text-zinc-100 mb-1">Why this score</div>
                            <div className="text-zinc-300">{visibilityRec.why}</div>
                          </>
                        )}
                        <div className={cn('font-medium text-zinc-100', visibilityRec.why ? 'mt-3 mb-1' : 'mb-1')}>
                          How to improve
                        </div>
                        <div className="text-zinc-300">{visibilityRec.fix}</div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className={cn('text-3xl font-bold', getVisibilityColor(brand?.visibility_score ?? 0))}>
                {(brand?.visibility_score ?? 0).toFixed(1)}
              </div>
              <div className="text-xs text-zinc-500">{brand?.name ?? 'Brand'}</div>
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
              <div className={cn('text-xl font-semibold text-zinc-100 truncate')}>
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
              <div className="text-xs text-zinc-400">Competitors Tracked</div>
              <div className="text-3xl font-bold text-zinc-100">{competitors.length}</div>
              <div className="text-xs text-zinc-500">From Module E competitor list</div>
            </div>
          </div>
        </Card>
      </div>}


      {comparison && competitors.length > 0 && <div className="bg-[#111113] rounded-xl border border-zinc-800 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-100">Competitor Metrics</div>
            <Badge className="bg-zinc-900 text-zinc-400 border-zinc-800 text-xs">
              Sorted by visibility score
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400">
                  <th className="p-3 font-medium">Competitor</th>
                  <th className="p-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      Visibility
                      {visibilityRec && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-w-xs text-xs p-3">
                              {visibilityRec.why && (
                                <>
                                  <div className="font-medium text-zinc-100 mb-1">Why this score</div>
                                  <div className="text-zinc-300">{visibilityRec.why}</div>
                                </>
                              )}
                              <div className={cn('font-medium text-zinc-100', visibilityRec.why ? 'mt-3 mb-1' : 'mb-1')}>
                                How to improve
                              </div>
                              <div className="text-zinc-300">{visibilityRec.fix}</div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </th>
                  <th className="p-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      Rank Δ vs Brand
                      {rankDeltaRec && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-w-xs text-xs p-3">
                              {rankDeltaRec.why && (
                                <>
                                  <div className="font-medium text-zinc-100 mb-1">Why this value</div>
                                  <div className="text-zinc-300">{rankDeltaRec.why}</div>
                                </>
                              )}
                              <div className={cn('font-medium text-zinc-100', rankDeltaRec.why ? 'mt-3 mb-1' : 'mb-1')}>
                                How to improve
                              </div>
                              <div className="text-zinc-300">{rankDeltaRec.fix}</div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </th>
                  <th className="p-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      Market Share
                      {shareRec && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-w-xs text-xs p-3">
                              {shareRec.why && (
                                <>
                                  <div className="font-medium text-zinc-100 mb-1">Why this share</div>
                                  <div className="text-zinc-300">{shareRec.why}</div>
                                </>
                              )}
                              <div className={cn('font-medium text-zinc-100', shareRec.why ? 'mt-3 mb-1' : 'mb-1')}>
                                How to improve
                              </div>
                              <div className="text-zinc-300">{shareRec.fix}</div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {competitors.map((row, i) => {
                  const delta = row.rank_difference_vs_brand
                  const isBetter = delta !== null && delta !== undefined ? delta < 0 : false
                  return (
                    <tr key={`${row.name}-${i}`} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="p-3 font-medium text-zinc-100 truncate max-w-55">{row.name}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('font-semibold', getVisibilityColor(row.visibility_score ?? 0))}>
                            {(row.visibility_score ?? 0).toFixed(1)}
                          </span>
                          <span className="text-xs text-zinc-500">/ 100</span>
                        </div>
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
                        <span className="font-mono text-xs text-zinc-400">
                          {(row.market_share_percent ?? 0).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>}
    </div>
  )
}

