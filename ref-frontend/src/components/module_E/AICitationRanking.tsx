'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Trophy, TrendingUp } from 'lucide-react'
// import {
//   useRunRankingAnalysisMutation,
//   type RankingAnalysisResponse,
//   type RankingPositionItem,
//   type ModelWiseRow,
// } from '@/store/api/module_E/rankingApi'

// Mock types
type RankingAnalysisResponse = any
type RankingPositionItem = any
type ModelWiseRow = any

const MODELS = ['chat_gpt', 'claude', 'gemini', 'perplexity'] as const
const MODEL_LABELS: Record<string, string> = {
  chat_gpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
}

interface AICitationRankingProps {
  url: string
}

export default function AICitationRanking({ url }: AICitationRankingProps) {
  // Mock removed mutation
  const runRankingAnalysis = (args: any) => {}
  const data: any = null
  const isLoading = false
  const error = null
  // const [runRankingAnalysis, { data, isLoading, error }] =
  //   useRunRankingAnalysisMutation()

  const websiteUrl = (url || '').trim()

  const handleRun = () => {
    if (!websiteUrl) return
    runRankingAnalysis({ url: websiteUrl, prompts: [] })
  }

  const resp = data as RankingAnalysisResponse | undefined
  const hasResults = resp?.success && (
    (resp.ranking_position_per_prompt?.length ?? 0) > 0 ||
    (resp.model_wise_comparison?.length ?? 0) > 0
  )

  const getPercentileBadgeColor = (percentile: number | null) => {
    if (percentile === null) return 'secondary'
    if (percentile >= 80) return 'default'
    if (percentile >= 50) return 'secondary'
    return 'destructive'
  }

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
          disabled={!websiteUrl || isLoading}
          size="sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <TrendingUp className="w-4 h-4 mr-2" />
              Run Analysis
            </>
          )}
        </Button>
      </div>

      {/* Info Text */}
      {!hasResults && !error && !isLoading && (
        <div className="p-4 border border-border rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Click Run Analysis to see how your URL ranks in AI citations across
            ChatGPT, Claude, Gemini, and Perplexity. Prompts are auto-generated
            from your page content.
          </p>
        </div>
      )}

      {/* URL Validation Warning */}
      {!websiteUrl && (
        <div className="p-4 border border-amber-500/50 bg-amber-500/10 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Enter a URL above to enable analysis
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
          <p className="text-sm text-destructive">
            {((error as any)?.data?.error ?? (error as any)?.message ?? 'Analysis failed')}
          </p>
        </div>
      )}

      {/* Errors from response */}
      {resp?.errors && resp.errors.length > 0 && (
        <div className="p-4 border border-amber-500/50 bg-amber-500/10 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Some models failed: {resp.errors.join('; ')}
          </p>
        </div>
      )}

      {/* Generated Prompts */}
      {resp?.generated_prompts && resp.generated_prompts.length > 0 && (
        <div className="p-4 border border-blue-500/50 bg-blue-500/10 rounded-lg">
          <p className="text-sm">
            <span className="font-medium text-blue-700 dark:text-blue-400">
              Auto-generated prompts:
            </span>{' '}
            <span className="text-muted-foreground">
              {resp.generated_prompts.join(' • ')}
            </span>
          </p>
        </div>
      )}

      {/* Results Section */}
      {hasResults && (
        <div className="space-y-6">
          {/* 1. Ranking position per prompt */}
          {resp.ranking_position_per_prompt &&
            resp.ranking_position_per_prompt.length > 0 && (
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
                      {(resp.ranking_position_per_prompt as RankingPositionItem[]).map(
                        (row, i) => (
                          <tr key={i} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate">
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
          {resp.percentile_by_prompt &&
            Object.keys(resp.percentile_by_prompt).length > 0 && (
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
                      {Object.entries(resp.percentile_by_prompt).map(
                        ([prompt, byModel]: [string, any]) => (
                          <tr key={prompt} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate">
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
          {resp.model_wise_comparison &&
            resp.model_wise_comparison.length > 0 && (
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
                      {(resp.model_wise_comparison as ModelWiseRow[]).map(
                        (row, i) => (
                          <tr key={i} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-foreground max-w-xs truncate">
                              {row.prompt}
                            </td>
                            {MODELS.map((m) => {
                              const pos = row[m as keyof ModelWiseRow];
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
      {resp?.success && !hasResults && (
        <div className="p-6 border border-border rounded-lg bg-muted/50 text-center">
          <p className="text-sm text-muted-foreground">
            No citations found for the given prompts. Try different prompts or
            ensure your URL is cited by the models.
          </p>
        </div>
      )}
    </div>
  )
}
