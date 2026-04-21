'use client'

import { useMemo, useState, useEffect } from 'react'
import { useGetModuleEResultQuery, useRunRankingAnalysisMutation } from '@/store/api/module_E/moduleEApi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  LineChart,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'
import { ModuleEMetricAskButton, useModuleEAskAi } from '@/components/module_E/useModuleEAskAi'

const TRENDS_BY_MODEL_SECTION_DESCRIPTION =
  'Compare citation rate, mention behavior, and sentiment signals model by model to see where your brand performs best. Use these trends to prioritize optimization work for specific models and prompts with the highest impact.'

interface TrendsByModelSectionProps {
  jobId?: string
  projectId?: string | null
}

type ModelStats = {
  model: string
  label: string
  total: number
  cited: number
  mentionedOnly: number
  notMentioned: number

  avgAccuracy: number
  avgSentiment: number
  avgPercentile: number | null

  avgRankWhenRanked: number | null
  rankingCoverage: number

  sov?: number
  brandMentions?: number
  competitorMentions?: number
}

const MODEL_LABELS: Record<string, string> = {
  chat_gpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
}

export default function TrendsByModelSection({
  jobId,
  projectId,
}: TrendsByModelSectionProps) {
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [runRankingAnalysis, { isLoading: isTriggering }] = useRunRankingAnalysisMutation()

  const { data, isLoading: isResultLoading } = useGetModuleEResultQuery(jobId ?? '', {
    skip: !jobId,
    pollingInterval: isPolling ? 3000 : 0,
    refetchOnMountOrArgChange: true,
  })

  const ranking = data?.data?.ranking_analysis
  const aiSov = data?.data?.ai_share_of_voice
  const rankingRows = ranking?.ranking_position_per_prompt ?? []

  const models = useMemo(() => {
    const set = new Set<string>()

    for (const row of rankingRows) {
      if (row.model) set.add(row.model)
    }

    if (aiSov?.by_model) {
      for (const key of Object.keys(aiSov.by_model)) {
        set.add(key)
      }
    }

    return Array.from(set)
  }, [rankingRows, aiSov])

  const modelStats: ModelStats[] = useMemo(() => {
    if (!models.length) return []

    const base: Record<string, ModelStats> = {}

    for (const m of models) {
      base[m] = {
        model: m,
        label: MODEL_LABELS[m] ?? m,
        total: 0,
        cited: 0,
        mentionedOnly: 0,
        notMentioned: 0,
        avgAccuracy: 0,
        avgSentiment: 0,
        avgPercentile: null,
        avgRankWhenRanked: null,
        rankingCoverage: 0,
        sov: undefined,
        brandMentions: undefined,
        competitorMentions: undefined,
      }
    }

    // ---- First pass: aggregate per model ----
    for (const row of rankingRows) {
      const m = row.model
      if (!m || !base[m]) continue

      const stats = base[m]
      stats.total += 1

      if (row.citation_matched) {
        stats.cited += 1
      } else if (row.brand_text_mentioned) {
        stats.mentionedOnly += 1
      } else {
        stats.notMentioned += 1
      }
    }

    // ---- Second pass: compute metrics per model ----
    for (const stats of Object.values(base)) {
      if (stats.total === 0) continue

      let accuracySum = 0
      let accuracyCount = 0

      let sentimentSum = 0
      let sentimentCount = 0

      let percentileSum = 0
      let percentileCount = 0

      let rankSum = 0
      let rankCount = 0

      for (const row of rankingRows) {
        if (row.model !== stats.model) continue

        if (typeof row.accuracy_score === 'number') {
          accuracySum += row.accuracy_score
          accuracyCount++
        }

        if (typeof row.sentiment_score === 'number') {
          sentimentSum += row.sentiment_score
          sentimentCount++
        }

        if (typeof row.percentile === 'number') {
          percentileSum += row.percentile
          percentileCount++
        }

        if (typeof row.position === 'number' && row.position > 0) {
          rankSum += row.position
          rankCount++
        }
      }

      // Accuracy
      stats.avgAccuracy =
        accuracyCount > 0 ? accuracySum / accuracyCount : 0

      // Sentiment
      stats.avgSentiment =
        sentimentCount > 0 ? sentimentSum / sentimentCount : 0

      // Percentile
      stats.avgPercentile =
        percentileCount > 0 ? percentileSum / percentileCount : null

      // Ranking metrics
      if (rankCount > 0) {
        stats.avgRankWhenRanked = rankSum / rankCount
        stats.rankingCoverage = (rankCount / stats.total) * 100
      } else {
        stats.avgRankWhenRanked = null
        stats.rankingCoverage = 0
      }

      // SOV
      if (aiSov?.by_model?.[stats.model]) {
        const s = aiSov.by_model[stats.model]
        stats.sov = s.sov
        stats.brandMentions = s.brand_mentions
        stats.competitorMentions = s.competitor_mentions
      }
    }

    const withData = Object.values(base).filter((m) => {
      const hasRankingData = m.total > 0
      const hasSovData =
        typeof m.sov === 'number' &&
        (m.sov > 0 ||
          (m.brandMentions ?? 0) > 0 ||
          (m.competitorMentions ?? 0) > 0)
      return hasRankingData || hasSovData
    })

    return withData.sort((a, b) => (b.sov ?? 0) - (a.sov ?? 0))
  }, [models, rankingRows, aiSov])

  const hasModelData = modelStats.length > 0

  useEffect(() => {
    if (isPolling && hasModelData) {
      setIsPolling(false)
      setPollCount(0)
    }
  }, [isPolling, hasModelData])

  useEffect(() => {
    if (isPolling && pollCount > 60) {
      setIsPolling(false)
      setPollCount(0)
    }
  }, [isPolling, pollCount])

  useEffect(() => {
    if (isPolling) {
      const id = setInterval(() => setPollCount((c) => c + 1), 3000)
      return () => clearInterval(id)
    }
  }, [isPolling])

  const isRunning = isTriggering || isPolling
  const { askAiDialog, runMetricAskAi, canAskAi, isAskingAI } = useModuleEAskAi(projectId, jobId)

  const handleRunAnalysis = async () => {
    if (!jobId) return
    try {
      await runRankingAnalysis(jobId).unwrap()
      setIsPolling(true)
      setPollCount(0)
    } catch (e) {
      console.error('Ranking analysis failed', e)
    }
  }

  if (!jobId) {
    return (
      <div className="p-6 border border-dashed rounded-lg" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--nd-text-muted)' }}>
          Trends by Model requires a completed Module E run.
        </p>
      </div>
    )
  }

  if (isResultLoading) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="flex items-center gap-3" style={{ color: 'var(--nd-text-muted)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-bold">Loading model trends…</span>
        </div>
      </div>
    )
  }

  if (!modelStats.length) {
    return (
      <AnalysisEmptyState
        icon={<LineChart className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />}
        title="No Trends Data"
        description="Run AI citation analysis to unlock model-level trends for citations, mentions, and ranking coverage across ChatGPT, Gemini, and Claude."
        onRunAnalysis={handleRunAnalysis}
        isAnalyzing={isRunning}
        buttonLabel="Run Analysis"
      />
    )
  }

  const totalPrompts = rankingRows.length

  return (
    <div className="space-y-6">
      {askAiDialog}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg border" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
            <LineChart className="w-5 h-5" style={{ color: 'var(--nd-text-primary)' }} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Trends by Model</h3>
              <FieldTooltip description={TRENDS_BY_MODEL_SECTION_DESCRIPTION} />
            </div>
          </div>
        </div>

        <Badge variant="outline" className="text-xs font-bold" style={{ borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}>
          {totalPrompts} prompts
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {modelStats.map((m) => {
          const citedRate = m.total ? (m.cited / m.total) * 100 : 0
          const mentionedRate = m.total
            ? (m.mentionedOnly / m.total) * 100
            : 0
          const notMentionedRate = m.total
            ? (m.notMentioned / m.total) * 100
            : 0

          const sentimentBadge =
            m.avgSentiment > 0.1
              ? 'success'
              : m.avgSentiment < -0.1
              ? 'destructive'
              : 'secondary'

          return (
            <div
              key={m.model}
              className="rounded-2xl border p-4"
              style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>
                    {m.label}
                  </span>
                <ModuleEMetricAskButton
                  disabled={!canAskAi || isAskingAI}
                  onClick={() =>
                    runMetricAskAi(
                      `${m.label} model trends`,
                      `Explain this model's trend performance and suggest what to improve first.\n${JSON.stringify({
                        model: m.label,
                        cited_rate: citedRate,
                        mentioned_rate: mentionedRate,
                        avg_accuracy: m.avgAccuracy,
                        avg_sentiment: m.avgSentiment,
                        avg_rank_when_ranked: m.avgRankWhenRanked,
                        ranking_coverage: m.rankingCoverage,
                        sov: m.sov,
                      })}`,
                    )
                  }
                />
                  {typeof m.sov === 'number' && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-2 py-0.5 font-bold"
                      style={{ background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)', borderColor: 'var(--nd-purple-subtle)' }}
                    >
                      SOV {m.sov.toFixed(1)}%
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--nd-text-muted)' }}>
                  <LineChart className="w-3 h-3" />
                  <span>{m.total} prompts</span>
                </div>
              </div>

              <div className="space-y-3">
                {/* Mention Breakdown */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold uppercase tracking-tight" style={{ color: 'var(--nd-text-muted)' }}>
                      Mention breakdown
                    </span>
                    <span className="font-bold font-mono text-[10px]" style={{ color: 'var(--nd-text-muted)' }}>
                      {citedRate.toFixed(0)}% cited ·{' '}
                      {mentionedRate.toFixed(0)}% mention only
                    </span>
                  </div>

                  <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--nd-bg)' }}>
                    <div
                      className="bg-emerald-500"
                      style={{ width: `${citedRate}%` }}
                    />
                    <div
                      className="bg-amber-500"
                      style={{ width: `${mentionedRate}%` }}
                    />
                    <div
                      style={{ width: `${notMentionedRate}%`, background: 'var(--nd-border)' }}
                    />
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="font-bold uppercase tracking-tight mb-1" style={{ color: 'var(--nd-text-muted)' }}>
                      Avg Accuracy
                    </div>
                    <div className="text-sm font-bold" style={{ color: 'var(--nd-text-secondary)' }}>
                      {m.avgAccuracy.toFixed(0)}%
                    </div>
                  </div>

                  <div>
                    <div className="font-bold uppercase tracking-tight mb-1" style={{ color: 'var(--nd-text-muted)' }}>
                      Avg Sentiment
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold" style={{ color: 'var(--nd-text-secondary)' }}>
                        {m.avgSentiment.toFixed(2)}
                      </span>
                      <Badge
                        variant={sentimentBadge}
                        className="text-[10px] px-1.5 py-0 font-bold uppercase"
                      >
                        {m.avgSentiment > 0.1
                          ? 'Pos'
                          : m.avgSentiment < -0.1
                          ? 'Neg'
                          : 'Neu'}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <div className="font-bold uppercase tracking-tight mb-1" style={{ color: 'var(--nd-text-muted)' }}>
                      Avg Rank
                    </div>
                    {m.avgRankWhenRanked != null ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold" style={{ color: 'var(--nd-text-secondary)' }}>
                          #{m.avgRankWhenRanked.toFixed(1)}
                        </span>
                        {m.avgRankWhenRanked <= 3 ? (
                          <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" style={{ color: 'var(--nd-text-muted)' }} />
                        )}
                      </div>
                    ) : (
                      <span className="text-sm font-bold" style={{ color: 'var(--nd-text-muted)' }}>—</span>
                    )}
                  </div>
                </div>

                {/* Ranking Coverage */}
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-tight" style={{ color: 'var(--nd-text-muted)' }}>
                  <span>Ranking Coverage</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--nd-text-secondary)' }}>
                    {m.rankingCoverage.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
