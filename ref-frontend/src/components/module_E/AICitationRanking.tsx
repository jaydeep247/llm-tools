'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Trophy, TrendingUp, RefreshCw, CheckCircle2, Play } from 'lucide-react'
import {
  useRunRankingAnalysisMutation,
  useGetModuleEResultQuery,
  type ModuleEResult
} from '@/store/api/module_E/moduleEApi'
import { cn } from '@/lib/utils'

const MODELS = ['chat_gpt', 'gemini'] as const
const MODEL_LABELS: Record<string, string> = {
  chat_gpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
}

interface AICitationRankingProps {
  jobId?: string
  url?: string
  rankingData?: ModuleEResult['ranking_analysis']
}

export default function AICitationRanking({ jobId, url, rankingData: initialData }: AICitationRankingProps) {
  const [runRankingAnalysis, { isLoading: isTriggering }] = useRunRankingAnalysisMutation()

  // Polling state
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [justCompleted, setJustCompleted] = useState(false)

  // Query to poll for updates
  const { data: polledData } = useGetModuleEResultQuery(jobId ?? '', {
    skip: !jobId || !isPolling,
    pollingInterval: isPolling ? 3000 : 0,
  })

  // Derive current data - prefer polled data if available
  const rankingData = polledData?.data?.ranking_analysis ?? initialData
  const hasResults = !!rankingData && (
    (rankingData.ranking_position_per_prompt?.length ?? 0) > 0 ||
    (rankingData.model_wise_comparison?.length ?? 0) > 0
  )

  // Watch for completion
  useEffect(() => {
    if (isPolling && hasResults && polledData?.data?.ranking_analysis) {
      // Stop polling if we see results
      setIsPolling(false)
      setJustCompleted(true)
      setTimeout(() => setJustCompleted(false), 3000)
    }
  }, [isPolling, hasResults, polledData])

  // Safety timeout
  useEffect(() => {
    if (isPolling && pollCount > 60) { // 3 mins
      setIsPolling(false)
      setPollCount(0)
    }
  }, [isPolling, pollCount])

  useEffect(() => {
    if (isPolling) {
      const id = setInterval(() => setPollCount(c => c + 1), 3000)
      return () => clearInterval(id)
    }
  }, [isPolling])


  const handleRun = async () => {
    if (!jobId) return
    try {
      await runRankingAnalysis(jobId).unwrap()
      setIsPolling(true)
      setPollCount(0)
    } catch (e) {
      console.error("Ranking analysis failed", e)
    }
  }

  const getPercentileBadgeColor = (percentile: number | null) => {
    if (percentile === null) return 'secondary'
    if (percentile >= 80) return 'default'
    if (percentile >= 50) return 'secondary'
    return 'destructive'
  }

  const isRunning = isTriggering || isPolling

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-linear-to-br from-amber-500 to-orange-600">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              AI Citation Ranking
            </h3>
            <p className="text-sm text-muted-foreground">
              Analyze how your URL ranks across AI models
            </p>
          </div>
        </div>

        <Button
          onClick={handleRun}
          disabled={!jobId || isRunning}
          size="sm"
          className={cn(
            'gap-2 font-semibold transition-all',
            justCompleted
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
          )}
        >
          {isTriggering ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Queuing...</>
          ) : isPolling ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
          ) : justCompleted ? (
            <><CheckCircle2 className="w-4 h-4" /> Done!</>
          ) : hasResults ? (
            <><RefreshCw className="w-4 h-4" /> Re-run Analysis</>
          ) : (
            <><Play className="w-4 h-4" /> Run Analysis</>
          )}
        </Button>
      </div>

      {/* Missing Job ID Warning */}
      {!jobId && (
        <div className="p-4 border border-yellow-500/50 bg-yellow-500/10 rounded-lg mb-6">
          <p className="text-sm text-yellow-600">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            No active crawl job found. Please run a Site Crawler audit first to enable ranking analysis.
          </p>
        </div>
      )}

      {/* Analysis Errors */}
      {rankingData?.errors && rankingData.errors.length > 0 && (
        <div className="p-4 border border-red-500/50 bg-red-500/10 rounded-lg mb-6">
          <h4 className="text-sm font-semibold text-red-600 mb-2">Analysis Errors</h4>
          <ul className="list-disc list-inside text-sm text-red-500">
            {rankingData.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Info Text */}
      {!hasResults && !isRunning && (
        <div className="p-4 border border-border rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Click Run Analysis to see how your URL ranks in AI citations across
            ChatGPT, Claude, Gemini. Prompts are auto-generated
            from your page content.
          </p>
        </div>
      )}

      {/* Polling State Info */}
      {isPolling && (
        <div className="p-4 border border-blue-500/20 bg-blue-500/10 rounded-lg animate-pulse">
          <p className="text-sm text-blue-400">
            Analysis in progress... This may take up to 2 minutes as we query live LLMs.
          </p>
        </div>
      )}

      {/* Generated Prompts */}
      {rankingData?.generated_prompts && rankingData.generated_prompts.length > 0 && (
        <div className="p-4 border border-blue-500/50 bg-blue-500/10 rounded-lg">
          <p className="text-sm">
            <span className="font-medium text-blue-700 dark:text-blue-400">
              Auto-generated prompts:
            </span>{' '}
            <span className="text-muted-foreground">
              {rankingData.generated_prompts.join(' • ')}
            </span>
          </p>
        </div>
      )}

      {/* Results Section */}
      {hasResults && (
        <div className="space-y-6">

          {/* Entity Coverage Summary */}
          {rankingData.entity_coverage && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg bg-background/50">
                <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Coverage Score</div>
                <div className="text-2xl font-bold mt-1">{rankingData.entity_coverage.score.toFixed(1)}%</div>
              </div>
              <div className="p-4 border rounded-lg bg-background/50">
                <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Found Entities</div>
                <div className="text-lg font-medium mt-1 text-emerald-500">
                  {rankingData.entity_coverage.found_entities.length} / {rankingData.entity_coverage.total_expected}
                </div>
              </div>
              <div className="p-4 border rounded-lg bg-background/50">
                <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Content Quality</div>
                <div className="text-2xl font-bold mt-1">
                  {rankingData.content_quality?.overall_score?.toFixed(1) ?? 0}
                </div>
              </div>
            </div>
          )}

          {/* 1. Ranking position per prompt */}
          {rankingData.ranking_position_per_prompt &&
            rankingData.ranking_position_per_prompt.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted px-4 py-3">
                  <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    Ranking Position per Prompt
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Prompt
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Model
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Position
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Total Cited
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Percentile
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-background divide-y divide-border">
                      {(rankingData.ranking_position_per_prompt as any[]).map(
                        (row, i) => (
                          <tr key={i} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate" title={row.prompt}>
                              {row.prompt}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {MODEL_LABELS[row.model] ?? row.model}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {row.position != null ? (
                                <span className="font-medium text-foreground">
                                  #{row.position}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Not cited</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {row.total_cited}
                            </td>
                            <td className="px-4 py-3">
                              {row.percentile != null ? (
                                <Badge variant={getPercentileBadgeColor(row.percentile)}>
                                  {row.percentile}%
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* 2. Percentile rank summary */}
          {rankingData.percentile_by_prompt &&
            Object.keys(rankingData.percentile_by_prompt).length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted px-4 py-3">
                  <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    Percentile Rank by Model
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Prompt
                        </th>
                        {MODELS.map((m) => (
                          <th
                            key={m}
                            className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                          >
                            {MODEL_LABELS[m]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-background divide-y divide-border">
                      {Object.entries(rankingData.percentile_by_prompt).map(
                        ([prompt, byModel]: [string, any]) => (
                          <tr key={prompt} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate" title={prompt}>
                              {prompt}
                            </td>
                            {MODELS.map((m) => {
                              const pct = (byModel as any)[m];
                              return (
                                <td key={m} className="px-4 py-3">
                                  {pct != null ? (
                                    <Badge variant={getPercentileBadgeColor(pct)}>
                                      {pct}%
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* 3. Model-wise ranking comparison */}
          {rankingData.model_wise_comparison &&
            rankingData.model_wise_comparison.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted px-4 py-3">
                  <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    Model-wise Ranking Comparison
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Prompt
                        </th>
                        {MODELS.map((m) => (
                          <th
                            key={m}
                            className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                          >
                            {MODEL_LABELS[m]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-background divide-y divide-border">
                      {(rankingData.model_wise_comparison as any[]).map(
                        (row, i) => (
                          <tr key={i} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate" title={row.prompt}>
                              {row.prompt}
                            </td>
                            {MODELS.map((m) => {
                              const pos = row[m];
                              return (
                                <td key={m} className="px-4 py-3 text-sm">
                                  {pos != null ? (
                                    <span className="font-medium text-foreground">
                                      #{pos}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      Not cited
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </div>
      )}

      {/* No Results */}
      {/* ... (omitted since we show info text instead) */}
    </div>
  )
}
