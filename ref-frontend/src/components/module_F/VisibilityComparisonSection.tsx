'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useGetModuleFResultQuery, useRunModuleFAnalysisMutation } from '@/store/api/module_F/moduleFApi'
import { ArrowDown, ArrowUp, CheckCircle2, Eye, Loader2, Percent, Play, RefreshCw, Swords } from 'lucide-react'

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

  const RunButton = (
    <Button
      size="sm"
      onClick={handleRun}
      disabled={isRunning || !jobId}
      className={cn(
        'gap-2 font-semibold transition-all',
        justCompleted
          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
          : 'bg-primary hover:bg-primary/90 text-primary-foreground',
      )}
    >
      {isTriggering ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> Queuing…
        </>
      ) : isPolling ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> Analysing…
        </>
      ) : justCompleted ? (
        <>
          <CheckCircle2 className="w-4 h-4" /> Done!
        </>
      ) : comparison ? (
        <>
          <RefreshCw className="w-4 h-4" /> Re-run Analysis
        </>
      ) : (
        <>
          <Play className="w-4 h-4" /> Run Analysis
        </>
      )}
    </Button>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-white/10 border border-white/10">
            <Swords className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Visibility Comparison</h2>
            <p className="text-xs text-white/60">
              Compare brand vs competitors across AI outputs: visibility score, rank delta, and market share.
            </p>
            {comparison?.topic && (
              <div className="mt-2">
                <Badge className="bg-white/10 text-white/70 border-0 text-[11px]">Topic: {comparison.topic}</Badge>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <Badge variant="outline" className="text-[11px] border-white/20 text-white/70 hidden sm:flex">
              Updated: {new Date(updatedAt).toLocaleString()}
            </Badge>
          )}
          {RunButton}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-xl">
              <Eye className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-white/60">Your Visibility</div>
              <div className={cn('text-3xl font-bold', getVisibilityColor(brand?.visibility_score ?? 0))}>
                {(brand?.visibility_score ?? 0).toFixed(1)}
              </div>
              <div className="text-xs text-white/40">{brand?.name ?? 'Brand'}</div>
            </div>
          </div>
        </Card>

        <Card className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-xl">
              <Swords className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-white/60">Top Competitor</div>
              <div className={cn('text-xl font-semibold text-white truncate')}>
                {topCompetitor?.name ?? '—'}
              </div>
              <div className="text-xs text-white/40">
                Score: {(topCompetitor?.visibility_score ?? 0).toFixed(1)}
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl">
              <Percent className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-white/60">Competitors Tracked</div>
              <div className="text-3xl font-bold text-white">{competitors.length}</div>
              <div className="text-xs text-white/40">From Module E competitor list</div>
            </div>
          </div>
        </Card>
      </div>

      {!comparison || competitors.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 rounded-full bg-white/5 border border-white/10">
              <Swords className="w-8 h-8 text-white/30" />
            </div>
            <div className="text-sm font-medium text-white">No competitor visibility data yet</div>
            <div className="text-xs text-white/60 max-w-md">
              Click Run Analysis to calculate visibility score, rank difference, and market share per competitor.
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="text-sm font-medium text-white">Competitor Metrics</div>
            <Badge className="bg-white/10 text-white/60 border-0 text-xs">
              Sorted by visibility score
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-white/60">
                  <th className="p-3 font-medium">Competitor</th>
                  <th className="p-3 font-medium">Visibility</th>
                  <th className="p-3 font-medium">Rank Δ vs Brand</th>
                  <th className="p-3 font-medium">Market Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {competitors.map((row, i) => {
                  const delta = row.rank_difference_vs_brand
                  const isBetter = delta !== null && delta !== undefined ? delta < 0 : false
                  return (
                    <tr key={`${row.name}-${i}`} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-medium text-white truncate max-w-[220px]">{row.name}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('font-semibold', getVisibilityColor(row.visibility_score ?? 0))}>
                            {(row.visibility_score ?? 0).toFixed(1)}
                          </span>
                          <span className="text-xs text-white/40">/ 100</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {delta === null || delta === undefined ? (
                            <span className="text-white/50">—</span>
                          ) : isBetter ? (
                            <ArrowUp className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <ArrowDown className="w-4 h-4 text-amber-400" />
                          )}
                          <span className={cn('font-mono text-xs', delta === null || delta === undefined ? 'text-white/50' : isBetter ? 'text-emerald-300' : 'text-amber-300')}>
                            {formatDelta(delta)}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-xs text-white/80">
                          {(row.market_share_percent ?? 0).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

