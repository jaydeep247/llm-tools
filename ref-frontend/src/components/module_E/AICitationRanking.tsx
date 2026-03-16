'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Trophy, RefreshCw, CheckCircle2, AlertCircle, Play } from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import {
  useRunRankingAnalysisMutation,
  useGetModuleEResultQuery,
  type ModuleEResult
} from '@/store/api/module_E/moduleEApi'
import { cn } from '@/lib/utils'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'

const MODELS = ['chat_gpt', 'gemini', 'claude'] as const

const PROMPT_RANKING_FIELD_DESCRIPTIONS: Record<string, string> = {
  Prompt: 'The question we asked the AI model.',
  Status: 'Whether your brand/URL showed up for this prompt.',
  Position: 'Where your URL appeared in the citations (1 is best).',
  Percentile: 'How strong your result is compared to others for this prompt (higher is better).',
  Accuracy: 'How well the answer matched your criteria (0–100%).',
  Sentiment: 'The tone of the mention (positive, neutral, or negative).',
}

function ChatGPTLogo(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 509.639"
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
      imageRendering="optimizeQuality"
      fillRule="evenodd"
      clipRule="evenodd"
      {...props}
    >
      <path
        fill="#fff"
        d="M115.612 0h280.775C459.974 0 512 52.026 512 115.612v278.415c0 63.587-52.026 115.613-115.613 115.613H115.612C52.026 509.64 0 457.614 0 394.027V115.612C0 52.026 52.026 0 115.612 0z"
      />
      <path
        fillRule="nonzero"
        d="M412.037 221.764a90.834 90.834 0 004.648-28.67 90.79 90.79 0 00-12.443-45.87c-16.37-28.496-46.738-46.089-79.605-46.089-6.466 0-12.943.683-19.264 2.04a90.765 90.765 0 00-67.881-30.515h-.576c-.059.002-.149.002-.216.002-39.807 0-75.108 25.686-87.346 63.554-25.626 5.239-47.748 21.31-60.682 44.03a91.873 91.873 0 00-12.407 46.077 91.833 91.833 0 0023.694 61.553 90.802 90.802 0 00-4.649 28.67 90.804 90.804 0 0012.442 45.87c16.369 28.504 46.74 46.087 79.61 46.087a91.81 91.81 0 0019.253-2.04 90.783 90.783 0 0067.887 30.516h.576l.234-.001c39.829 0 75.119-25.686 87.357-63.588 25.626-5.242 47.748-21.312 60.682-44.033a91.718 91.718 0 0012.383-46.035 91.83 91.83 0 00-23.693-61.553l-.004-.005zM275.102 413.161h-.094a68.146 68.146 0 01-43.611-15.8 56.936 56.936 0 002.155-1.221l72.54-41.901a11.799 11.799 0 005.962-10.251V241.651l30.661 17.704c.326.163.55.479.596.84v84.693c-.042 37.653-30.554 68.198-68.21 68.273h.001zm-146.689-62.649a68.128 68.128 0 01-9.152-34.085c0-3.904.341-7.817 1.005-11.663.539.323 1.48.897 2.155 1.285l72.54 41.901a11.832 11.832 0 0011.918-.002l88.563-51.137v35.408a1.1 1.1 0 01-.438.94l-73.33 42.339a68.43 68.43 0 01-34.11 9.12 68.359 68.359 0 01-59.15-34.11l-.001.004zm-19.083-158.36a68.044 68.044 0 0135.538-29.934c0 .625-.036 1.731-.036 2.5v83.801l-.001.07a11.79 11.79 0 005.954 10.242l88.564 51.13-30.661 17.704a1.096 1.096 0 01-1.034.093l-73.337-42.375a68.36 68.36 0 01-34.095-59.143 68.412 68.412 0 019.112-34.085l-.004-.003zm251.907 58.621l-88.563-51.137 30.661-17.697a1.097 1.097 0 011.034-.094l73.337 42.339c21.109 12.195 34.132 34.746 34.132 59.132 0 28.604-17.849 54.199-44.686 64.078v-86.308c.004-.032.004-.065.004-.096 0-4.219-2.261-8.119-5.919-10.217zm30.518-45.93c-.539-.331-1.48-.898-2.155-1.286l-72.54-41.901a11.842 11.842 0 00-5.958-1.611c-2.092 0-4.15.558-5.957 1.611l-88.564 51.137v-35.408l-.001-.061a1.1 1.1 0 01.44-.88l73.33-42.303a68.301 68.301 0 0134.108-9.129c37.704 0 68.281 30.577 68.281 68.281a68.69 68.69 0 01-.984 11.545v.005zm-191.843 63.109l-30.668-17.704a1.09 1.09 0 01-.596-.84v-84.692c.016-37.685 30.593-68.236 68.281-68.236a68.332 68.332 0 0143.689 15.804 63.09 63.09 0 00-2.155 1.222l-72.54 41.9a11.794 11.794 0 00-5.961 10.248v.068l-.05 102.23zm16.655-35.91l39.445-22.782 39.444 22.767v45.55l-39.444 22.767-39.445-22.767v-45.535z"
      />
    </svg>
  )
}

function GeminiLogo(props: any) {
  return (
    <svg
      viewBox="0 0 65 65"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <mask
        id="maskme"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="65"
        height="65"
        style={{ maskType: 'alpha' }}
      >
        <path
          d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z"
          fill="url(#paint0_linear)"
        />
      </mask>

      <g mask="url(#maskme)">
        <circle cx="20" cy="45" r="25" fill="#00B95C" />
        <circle cx="45" cy="20" r="25" fill="#3186FF" />
        <circle cx="15" cy="15" r="20" fill="#FC413D" />
        <circle cx="50" cy="50" r="20" fill="#FFEE48" />
      </g>

      <defs>
        <linearGradient
          id="paint0_linear"
          x1="18.447"
          y1="43.42"
          x2="52.153"
          y2="15.004"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4893FC" />
          <stop offset="0.777" stopColor="#969DFF" />
          <stop offset="1" stopColor="#BD99FE" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* Flat color helpers — no gradients */

function getScoreColor(score: number | null | undefined) {
  if (score == null) return 'text-zinc-500'
  if (score >= 80) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-rose-400'
}

function getScoreBorder(score: number | null | undefined) {
  if (score == null) return 'border-zinc-800'
  if (score >= 80) return 'border-emerald-500/30'
  if (score >= 50) return 'border-amber-500/30'
  return 'border-rose-500/30'
}

function getModelStats(rankingData: any, modelId: string) {
  const rankingRows = Array.isArray(rankingData?.ranking_position_per_prompt)
    ? (rankingData.ranking_position_per_prompt as any[]).filter((r) => r.model === modelId)
    : []

  const percentileByPrompt = rankingData?.percentile_by_prompt ?? {}
  const percentilesByPrompt: Record<string, number> = {}
  const percentileRows: { prompt: string; percentile: number }[] = []
  for (const [prompt, byModel] of Object.entries(percentileByPrompt as any)) {
    const value = (byModel as any)?.[modelId]
    if (typeof value === 'number') {
      percentilesByPrompt[prompt] = value
      percentileRows.push({ prompt, percentile: value })
    }
  }

  const comparisonSource = Array.isArray(rankingData?.model_wise_comparison)
    ? (rankingData.model_wise_comparison as any[])
    : []
  const comparisonByPrompt: Record<string, number> = {}
  const comparisonRows: { prompt: string; position: number }[] = []
  for (const row of comparisonSource) {
    const pos = row[modelId]
    if (typeof pos === 'number') {
      comparisonByPrompt[row.prompt] = pos
      comparisonRows.push({ prompt: row.prompt, position: pos })
    }
  }

  let accuracySum = 0
  let accuracyCount = 0
  let sentimentSum = 0
  let sentimentCount = 0
  for (const row of rankingRows) {
    if (typeof row.accuracy_score === 'number') {
      accuracySum += row.accuracy_score
      accuracyCount += 1
    }
    if (typeof row.sentiment_score === 'number') {
      sentimentSum += row.sentiment_score
      sentimentCount += 1
    }
  }

  const avgAccuracy = accuracyCount ? accuracySum / accuracyCount : null
  const avgSentiment = sentimentCount ? sentimentSum / sentimentCount : null
  const hasAnyData =
    rankingRows.length > 0 || percentileRows.length > 0 || comparisonRows.length > 0

  return {
    hasAnyData,
    rankingRows,
    percentileRows,
    comparisonRows,
    percentilesByPrompt,
    comparisonByPrompt,
    avgAccuracy,
    avgSentiment,
  }
}

interface AICitationRankingProps {
  jobId?: string
  url?: string
  rankingData?: ModuleEResult['ranking_analysis']
}

export default function AICitationRanking({ jobId, url, rankingData: initialData }: AICitationRankingProps) {
  const [runRankingAnalysis, { isLoading: isTriggering }] = useRunRankingAnalysisMutation()

  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [justCompleted, setJustCompleted] = useState(false)

  const { data: moduleEData } = useGetModuleEResultQuery(jobId ?? '', {
    skip: !jobId,
    pollingInterval: isPolling ? 3000 : 0,
    refetchOnMountOrArgChange: true,
  })

  const rankingData = moduleEData?.data?.ranking_analysis ?? initialData
  const hasResults = !!rankingData && (
    (rankingData.ranking_position_per_prompt?.length ?? 0) > 0 ||
    (rankingData.model_wise_comparison?.length ?? 0) > 0
  )

  useEffect(() => {
    if (isPolling && hasResults && moduleEData?.data?.ranking_analysis) {
      setIsPolling(false)
      setJustCompleted(true)
      setTimeout(() => setJustCompleted(false), 3000)
    }
  }, [isPolling, hasResults, moduleEData])

  useEffect(() => {
    if (isPolling && pollCount > 60) {
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

  const getModelMeta = (modelId: string) => {
    if (modelId === 'chat_gpt') {
      return {
        label: 'ChatGPT',
        icon: <ChatGPTLogo className="w-5 h-5" />,
        accent: 'border-emerald-500/30',
      }
    }
    if (modelId === 'gemini') {
      return {
        label: 'Gemini',
        icon: <GeminiLogo className="w-5 h-5 rounded" />,
        accent: 'border-sky-500/30',
      }
    }
    if (modelId === 'claude') {
      return {
        label: 'Claude',
        icon: null,
        accent: 'border-zinc-600',
      }
    }
    return {
      label: modelId,
      icon: null,
      accent: 'border-zinc-800',
    }
  }

  const isRunning = isTriggering || isPolling

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-800/50 border border-zinc-800">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">AI Citation Ranking</h3>
            <p className="text-sm text-muted-foreground max-w-3xl">
              See how often your URL is cited, where it ranks, and how each model positions your brand in answers.
              Use this section to find prompt-level wins, weak spots, and opportunities to improve citation visibility.
            </p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {!jobId && (
        <div className="p-4 border border-amber-500/30 bg-amber-500/5 rounded-xl">
          <p className="text-sm text-amber-400">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            No active crawl job found. Please run a Site Crawler audit first.
          </p>
        </div>
      )}

      {rankingData?.errors && rankingData.errors.length > 0 && (
        <div className="p-4 border border-amber-500/30 bg-amber-500/5 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-400">Analysis partially unavailable</p>
            <p className="text-xs text-amber-400/70 mt-0.5">Something went wrong while fetching data from one or more AI models. Please try again later.</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasResults && !isRunning && (
        <AnalysisEmptyState
          icon={<Trophy className="w-8 h-8 text-zinc-400" />}
          title="No Citation Analysis Data"
          description="Click Run Analysis to see how your URL ranks in AI citations across ChatGPT, Claude, and Gemini."
          onRunAnalysis={handleRun}
          isAnalyzing={isRunning}
          buttonLabel="Run Analysis"
        />
      )}

      {isPolling && (
        <div className="p-4 border border-blue-500/20 bg-blue-500/5 rounded-xl animate-pulse">
          <p className="text-sm text-blue-400">
            Analysis in progress... This may take up to 2 minutes as we query live LLMs.
          </p>
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <div className="space-y-5">
          {MODELS.map((modelId) => {
            const stats = getModelStats(rankingData, modelId)
            if (!stats.hasAnyData) return null

            const meta = getModelMeta(modelId)
            const coverageScore = (rankingData.entity_coverage?.score ?? 0) as number
            const contentQuality = (rankingData.content_quality?.overall_score ?? 0) as number
            const modelAvgAccuracy = stats.avgAccuracy ?? 0
            const modelAvgSentiment = stats.avgSentiment ?? 0

            return (
              <div
                key={modelId}
                className={cn(
                  'rounded-2xl border bg-zinc-800/50 p-5 space-y-4',
                  meta.accent
                )}
              >
                {/* Model header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-zinc-800/50 border border-zinc-800">
                      {meta.icon}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">AI Model</div>
                      <div className="text-base font-semibold text-white">{meta.label}</div>
                    </div>
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-medium border border-zinc-800 bg-zinc-800/50 text-zinc-400">
                    {stats.rankingRows.length} prompts
                  </span>
                </div>

                {/* Metric cards — flat, no gradients */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={cn('rounded-xl bg-zinc-800/50 border p-3', getScoreBorder(coverageScore))}>
                    <div className="text-xs text-zinc-400 mb-1">Coverage Score</div>
                    <div className={cn('text-lg font-bold', getScoreColor(coverageScore))}>
                      {coverageScore.toFixed(1)}%
                    </div>
                  </div>
                  <div className={cn('rounded-xl bg-zinc-800/50 border p-3', getScoreBorder(contentQuality))}>
                    <div className="text-xs text-zinc-400 mb-1">Content Quality</div>
                    <div className={cn('text-lg font-bold', getScoreColor(contentQuality))}>
                      {contentQuality.toFixed(1)}
                    </div>
                  </div>
                  <div className={cn('rounded-xl bg-zinc-800/50 border p-3', getScoreBorder(modelAvgAccuracy))}>
                    <div className="text-xs text-zinc-400 mb-1">Avg Accuracy</div>
                    <div className={cn('text-lg font-bold', getScoreColor(modelAvgAccuracy))}>
                      {modelAvgAccuracy.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-800/50 border border-zinc-800 p-3">
                    <div className="text-xs text-zinc-400 mb-1">Avg Sentiment</div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-lg font-bold', modelAvgSentiment > 0.1 ? 'text-emerald-400' : modelAvgSentiment < -0.1 ? 'text-rose-400' : 'text-zinc-400')}>
                        {modelAvgSentiment.toFixed(2)}
                      </span>
                      <Badge variant={modelAvgSentiment > 0.1 ? 'success' : modelAvgSentiment < -0.1 ? 'destructive' : 'secondary'}>
                        {modelAvgSentiment > 0.1 ? 'Pos' : modelAvgSentiment < -0.1 ? 'Neg' : 'Neu'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Prompt ranking table */}
                {stats.rankingRows.length > 0 && (
                  <div className="rounded-xl border border-zinc-800 overflow-hidden">
                    <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-800/50 border-b border-zinc-800">
                      Ranking position per prompt
                    </div>
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full">
                        <thead className="bg-zinc-800/30 border-b border-zinc-800">
                          <tr>
                            {(['Prompt', 'Status', 'Position', 'Percentile', 'Accuracy', 'Sentiment'] as const).map((h) => (
                              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                                <div className="flex items-center gap-1">
                                  <span>{h}</span>
                                  <FieldTooltip description={PROMPT_RANKING_FIELD_DESCRIPTIONS[h] ?? ''} />
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50 text-xs">
                          {stats.rankingRows.slice(0, 8).map((row: any, i: number) => {
                            const percentile = stats.percentilesByPrompt[row.prompt]
                            return (
                              <tr key={i} className="hover:bg-zinc-800/50 transition-colors">
                                <td className="px-4 py-2.5 text-zinc-300 max-w-xs truncate" title={row.prompt}>
                                  {row.prompt}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-xs text-zinc-400">
                                    {row.mention_status ?? (row.position != null ? 'Cited' : 'Not Mentioned')}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  {row.position != null ? (
                                    <span className="font-medium text-white">#{row.position}</span>
                                  ) : (
                                    <span className="text-zinc-600">&#8212;</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {percentile != null ? (
                                    <Badge variant={getPercentileBadgeColor(percentile)}>{percentile}%</Badge>
                                  ) : (
                                    <span className="text-zinc-600">&#8212;</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {row.accuracy_score != null ? (
                                    <Badge variant={row.accuracy_score >= 80 ? 'success' : row.accuracy_score >= 50 ? 'warning' : 'destructive'}>
                                      {row.accuracy_score.toFixed(0)}%
                                    </Badge>
                                  ) : (
                                    <span className="text-zinc-600">&#8212;</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {row.sentiment_score != null ? (
                                    <Badge variant={row.sentiment_score > 0.3 ? 'success' : row.sentiment_score < -0.3 ? 'destructive' : 'secondary'}>
                                      {row.sentiment_score > 0.3 ? 'Positive' : row.sentiment_score < -0.3 ? 'Negative' : 'Neutral'}
                                    </Badge>
                                  ) : (
                                    <span className="text-zinc-600">&#8212;</span>
                                  )}
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
          })}
        </div>
      )}
    </div>
  )
}
