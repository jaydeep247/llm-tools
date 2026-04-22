'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, Eye, Brain, AlertCircle, Play, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRunSentimentAnalysisMutation, useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'
import { ModuleEMetricAskButton, useModuleEAskAi } from '@/components/module_E/useModuleEAskAi'

const SENTIMENT_VISIBILITY_SECTION_DESCRIPTION =
  'Understand how AI models perceive your brand, how visible it is in discovery prompts, and where sentiment is improving or declining. Use this section to validate brand trust signals and guide messaging updates that increase positive mentions.'

interface SentimentTrackingProps {
  jobId?: string
  projectId?: string | null
  sentimentData?: {
    brand_name?: string
    industry?: string
    service_type?: string
    sentiment?: {
      overall_score?: number
      distribution?: { Positive?: number; Neutral?: number; Negative?: number }
      by_model?: Record<string, { score?: number; distribution?: any; failed?: boolean; error?: string }>
    }
    visibility?: {
      overall_visibility_score?: number
      overall_appearance_rate?: number
      by_model?: Record<string, {
        visibility_score?: number
        appearance_rate?: number
        appearances?: number
        total_prompts?: number
      }>
    }
    timestamp?: string
  }
}

export default function SentimentTrackingSection({ jobId, projectId, sentimentData: initialSentimentData }: SentimentTrackingProps) {
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [justCompleted, setJustCompleted] = useState(false)

  // RTK Query: run sentiment analysis mutation
  const [runSentimentAnalysis, { isLoading: isTriggering }] = useRunSentimentAnalysisMutation()

  // Track the timestamp of the last known result so we can detect when new data arrives
  const [lastTimestamp, setLastTimestamp] = useState<string | undefined>(
    initialSentimentData?.timestamp
  )

  // RTK Query: always active (not skipped) so tag invalidation from mutation triggers refetch
  const { data: polledData } = useGetModuleEResultQuery(jobId ?? '', {
    skip: !jobId,
    pollingInterval: isPolling ? 5000 : 0,
    refetchOnMountOrArgChange: true,
  })

  // The sentiment data to display: prefer live polled data if available, else initial prop
  const sentimentData = polledData?.data?.sentiment_tracking ?? initialSentimentData

  // Score history for trend charts — always use latest from polledData
  const scoreHistory = polledData?.data?.score_history ?? []

  // Stop polling when a NEW timestamp appears (meaning backend wrote fresh results)
  useEffect(() => {
    if (!isPolling) return
    const newTs = polledData?.data?.sentiment_tracking?.timestamp
    if (newTs && newTs !== lastTimestamp) {
      setIsPolling(false)
      setPollCount(0)
      setLastTimestamp(newTs)
      setJustCompleted(true)
      setTimeout(() => setJustCompleted(false), 4000)
    }
  }, [isPolling, polledData, lastTimestamp])

  // Safety: stop polling after 3 minutes (36 × 5s)
  useEffect(() => {
    if (isPolling && pollCount > 36) {
      setIsPolling(false)
      setPollCount(0)
    }
  }, [isPolling, pollCount])

  // Increment poll count on each refetch
  useEffect(() => {
    if (isPolling) {
      const id = setInterval(() => setPollCount(c => c + 1), 5000)
      return () => clearInterval(id)
    }
  }, [isPolling])

  const handleRunAnalysis = useCallback(async () => {
    if (!jobId) return
    try {
      // Snapshot current timestamp before triggering so we can detect new data
      const currentTs = polledData?.data?.sentiment_tracking?.timestamp ?? initialSentimentData?.timestamp
      setLastTimestamp(currentTs)
      await runSentimentAnalysis(jobId).unwrap()
      // Start polling for results
      setIsPolling(true)
      setPollCount(0)
      setJustCompleted(false)
    } catch (err) {
      console.error('Failed to trigger sentiment analysis:', err)
    }
  }, [jobId, runSentimentAnalysis, polledData, initialSentimentData])

  // Color coding helpers
  const getSentimentColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400'
    if (score >= 60) return 'text-yellow-400'
    return 'text-rose-400'
  }

  const getSentimentBg = (score: number) => {
    if (score >= 80) return 'bg-emerald-500/10 border-emerald-500/30'
    if (score >= 60) return 'bg-yellow-500/10 border-yellow-500/30'
    return 'bg-rose-500/10 border-rose-500/30'
  }

  const getVisibilityColor = (score: number) => {
    if (score >= 50) return 'text-blue-400'
    if (score >= 25) return 'text-cyan-400'
    return 'text-gray-400'
  }

  const getVisibilityBg = (score: number) => {
    if (score >= 50) return 'bg-blue-500/10 border-blue-500/30'
    if (score >= 25) return 'bg-cyan-500/10 border-cyan-500/30'
    return 'bg-gray-500/10 border-gray-500/30'
  }

  const isRunning = isTriggering || isPolling
  const { askAiDialog, runMetricAskAi, canAskAi, isAskingAI } = useModuleEAskAi(projectId, jobId)

  // ─── SVG Trend Chart Helpers ──────────────────────────────────────────────
  type HistoryEntry = { date: string; sentimentScore: number; visibilityScore: number }

  const renderTrendChart = (
    history: HistoryEntry[],
    key: 'sentimentScore' | 'visibilityScore',
    color: string,
    gradientId: string
  ) => {
    const recent = history.slice(-12)
    if (recent.length < 2) {
      return (
        <div className="flex items-center justify-center h-32 border border-dashed border-border rounded-lg">
          <p className="text-xs text-muted-foreground text-center px-4">
            {recent.length === 1
              ? '1 run saved — run again to see a trend line'
              : 'No history yet — run analysis to track scores over time'}
          </p>
        </div>
      )
    }

    const W = 600, H = 130, PL = 32, PR = 16, PB = 24, PT = 12
    const startT = new Date(recent[0].date).getTime()
    const endT = new Date(recent[recent.length - 1].date).getTime()
    const tRange = endT - startT || 1

    const coord = (h: HistoryEntry) => ({
      x: PL + ((new Date(h.date).getTime() - startT) / tRange) * (W - PL - PR),
      y: H - PB - (h[key] / 100) * (H - PB - PT),
    })

    const pts = recent.map(coord)
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const area = `${line} L ${pts[pts.length - 1].x} ${H - PB} L ${pts[0].x} ${H - PB} Z`

    const yLabels = [100, 50, 0]

    return (
      <div className="relative w-full">
        {/* Y-axis labels */}
        <div
          className="absolute left-0 top-0 flex flex-col justify-between text-[9px] text-muted-foreground font-mono pointer-events-none"
          style={{ height: H, paddingTop: PT, paddingBottom: PB }}
        >
          {yLabels.map(v => <span key={v}>{v}</span>)}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          {[PT, (H - PB - PT) / 2 + PT, H - PB].map((y, i) => (
            <line key={i} x1={PL} y1={y} x2={W - PR} y2={y}
              stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5"
              strokeDasharray={i === 2 ? undefined : '4 4'} />
          ))}
          {/* Area fill */}
          <path d={area} fill={`url(#${gradientId})`} />
          {/* Line */}
          <path d={line} fill="none" stroke={color} strokeWidth="2"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' }} />
          {/* Dots */}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5"
              fill="#1e1e2e" stroke={color} strokeWidth="2">
              <title>{`${new Date(recent[i].date).toLocaleDateString()}: ${recent[i][key]}`}</title>
            </circle>
          ))}
        </svg>
        {/* X-axis date labels */}
        <div className="flex justify-between text-[9px] text-muted-foreground font-mono mt-1 px-8">
          <span>{new Date(recent[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          {recent.length > 2 && (
            <span>{new Date(recent[Math.floor(recent.length / 2)].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          )}
          <span>{new Date(recent[recent.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    )
  }

  // Run Analysis Button — always visible
  const RunButton = (
    <Button
      size="sm"
      onClick={handleRunAnalysis}
      disabled={isRunning}
      className={cn(
        'gap-2 font-semibold transition-all',
        justCompleted
          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
          : 'bg-primary hover:bg-primary/90 text-primary-foreground'
      )}
    >
      {isTriggering ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Queuing…</>
      ) : isPolling ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
      ) : justCompleted ? (
        <><CheckCircle2 className="w-4 h-4" /> Done!</>
      ) : sentimentData ? (
        <><RefreshCw className="w-4 h-4" /> Re-run Analysis</>
      ) : (
        <><Play className="w-4 h-4" /> Run Analysis</>
      )}
    </Button>
  )

  // Empty state — no data yet
  if (!sentimentData) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-semibold text-foreground">AI Sentiment &amp; Visibility Tracking</h3>
              <FieldTooltip description={SENTIMENT_VISIBILITY_SECTION_DESCRIPTION} />
            </div>
          </div>
        </div>

        {/* Empty state card */}
        <Card className="rounded-xl border p-8 text-center">
          {isRunning ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {isTriggering ? 'Queuing analysis…' : 'Analysing your brand across AI models…'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This may take 30–90 seconds. Querying OpenAI, Gemini &amp; Claude.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold text-foreground">No sentiment data yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click <strong>Run Analysis</strong> to query OpenAI, Gemini &amp; Claude about your brand.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    )
  }

  // Data available — render full UI
  const sentiment = sentimentData.sentiment ?? {
    overall_score: 0,
    distribution: { Positive: 0, Neutral: 0, Negative: 0 },
    by_model: {},
  }
  const visibility = sentimentData.visibility ?? {
    overall_visibility_score: 0,
    overall_appearance_rate: 0,
    by_model: {},
  }
  const brand_name = sentimentData.brand_name ?? 'Unknown'
  const industry = sentimentData.industry ?? 'Unknown'
  const service_type = sentimentData.service_type ?? 'Unknown'

  const sentimentLabel = (() => {
    const score = sentiment.overall_score ?? 0
    if (score >= 80) return 'Highly Positive'
    if (score >= 60) return 'Positive'
    if (score >= 40) return 'Neutral'
    if (score >= 20) return 'Negative'
    return 'Highly Negative'
  })()

  const visibilityLabel = (() => {
    const score = visibility.overall_visibility_score ?? 0
    if (score >= 70) return 'Excellent'
    if (score >= 50) return 'Strong'
    if (score >= 30) return 'Moderate'
    if (score >= 10) return 'Weak'
    return 'Very Low'
  })()

  const sentimentDistribution = sentiment.distribution ?? { Positive: 0, Neutral: 0, Negative: 0 }
  const totalResponses =
    (sentimentDistribution.Positive ?? 0) +
    (sentimentDistribution.Neutral ?? 0) +
    (sentimentDistribution.Negative ?? 0)
  const totalQuestions =
    (Object.values(visibility.by_model ?? {})[0]?.total_prompts ?? 0) * 3 || 18
  const appearanceRate = visibility.overall_appearance_rate ?? 0
  const timestampLabel = sentimentData.timestamp
    ? new Date(sentimentData.timestamp).toLocaleString()
    : 'Unknown'

  return (
    <div className="space-y-4">
      {askAiDialog}
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-lg font-semibold text-foreground">AI Sentiment &amp; Visibility Tracking</h3>
            <FieldTooltip description={SENTIMENT_VISIBILITY_SECTION_DESCRIPTION} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Brand: {brand_name} • Industry: {industry} • Service: {service_type}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs hidden sm:flex">
            {timestampLabel}
          </Badge>
        </div>
      </div>

      {/* Running overlay hint */}
      {isRunning && (
        <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-4 py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>
            {isTriggering
              ? 'Queuing sentiment analysis…'
              : 'Querying OpenAI, Gemini & Claude — results will appear automatically…'}
          </span>
        </div>
      )}

      {/* Main Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sentiment Score Card */}
        <Card className={cn('rounded-xl border p-6', getSentimentBg(sentiment.overall_score ?? 0))}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background/50">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground">AI Sentiment Score</h4>
                <p className="text-xs text-muted-foreground">Based on 5 questions × 3 models</p>
              </div>
              <ModuleEMetricAskButton
                disabled={!canAskAi || isAskingAI}
                onClick={() =>
                  runMetricAskAi(
                    'AI Sentiment Score',
                    `Interpret this brand sentiment result and identify top actions to improve it.\n${JSON.stringify({
                      brand_name,
                      industry,
                      service_type,
                      sentiment_overall: sentiment.overall_score,
                      sentiment_distribution: sentiment.distribution,
                    })}`,
                  )
                }
              />
            </div>

            <div className="flex items-end gap-2">
              <div className={cn('text-6xl font-bold', getSentimentColor(sentiment.overall_score ?? 0))}>
                {sentiment.overall_score ?? 0}
              </div>
              <div className="mb-2">
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
            </div>

            <Badge className={cn('text-sm font-semibold', getSentimentColor(sentiment.overall_score ?? 0))}>
              {sentimentLabel}
            </Badge>

            {/* Distribution Bars */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Distribution ({totalResponses} responses)
              </div>

              {[
                { label: 'Positive', value: sentimentDistribution.Positive ?? 0, color: 'bg-emerald-400', textColor: 'text-emerald-400' },
                { label: 'Negative', value: sentimentDistribution.Negative ?? 0, color: 'bg-rose-400', textColor: 'text-rose-400' },
                { label: 'Neutral', value: sentimentDistribution.Neutral ?? 0, color: 'bg-amber-400', textColor: 'text-amber-400' },
              ].map(({ label, value, color, textColor }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn('text-xs font-semibold', textColor)}>{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {totalResponses ? Math.round((value / totalResponses) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full transition-all', color)}
                        style={{ width: `${totalResponses ? (value / totalResponses) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Visibility Score Card */}
        <Card className={cn('rounded-xl border p-6', getVisibilityBg(visibility.overall_visibility_score ?? 0))}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background/50">
                <Eye className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground">AI Visibility Score</h4>
                <p className="text-xs text-muted-foreground">Organic brand mentions without prompting</p>
              </div>
              <ModuleEMetricAskButton
                disabled={!canAskAi || isAskingAI}
                onClick={() =>
                  runMetricAskAi(
                    'AI Visibility Score',
                    `Interpret this AI visibility score and explain where visibility is weak by model.\n${JSON.stringify({
                      brand_name,
                      overall_visibility_score: visibility.overall_visibility_score,
                      overall_appearance_rate: visibility.overall_appearance_rate,
                      by_model: visibility.by_model,
                    })}`,
                  )
                }
              />
            </div>

            <div className="flex items-end gap-2">
              <div className={cn('text-6xl font-bold', getVisibilityColor(visibility.overall_visibility_score ?? 0))}>
                {visibility.overall_visibility_score ?? 0}
              </div>
              <div className="mb-2">
                <span className="text-lg text-muted-foreground">%</span>
              </div>
            </div>

            <Badge className={cn('text-sm font-semibold', getVisibilityColor(visibility.overall_visibility_score ?? 0))}>
              {visibilityLabel} Visibility
            </Badge>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Appearance Rate</span>
                <span className="text-sm font-semibold text-foreground">
                  {Math.round(appearanceRate * 100)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Discovery Questions</span>
                <span className="text-sm font-semibold text-foreground">{totalQuestions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Brand Mentioned</span>
                <span className="text-sm font-semibold text-foreground">
                  {Math.round(appearanceRate * totalQuestions)} times
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Trend Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sentiment Trend */}
        <Card className="rounded-xl border p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">Sentiment Trend</h4>
            {scoreHistory.length > 0 && (
              <Badge variant="outline" className="text-[10px] ml-auto">{scoreHistory.length} runs</Badge>
            )}
          </div>
          {renderTrendChart(scoreHistory, 'sentimentScore', '#34d399', 'sentimentGrad')}
        </Card>

        {/* Visibility Trend */}
        <Card className="rounded-xl border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-blue-400" />
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">Visibility Trend</h4>
            {scoreHistory.length > 0 && (
              <Badge variant="outline" className="text-[10px] ml-auto">{scoreHistory.length} runs</Badge>
            )}
          </div>
          {renderTrendChart(scoreHistory, 'visibilityScore', '#60a5fa', 'visibilityGrad')}
        </Card>
      </div>

      {/* AI Model Breakdown */}
      <Card className="rounded-xl border p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-blue-400" />
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Breakdown by AI Model
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(sentiment.by_model ?? {}).map(([model, data]) => {
              const visData = visibility.by_model?.[model]
              const modelScore = data?.score ?? 0
              const modelDistribution = data?.distribution ?? { Positive: 0, Neutral: 0, Negative: 0 }
              const isFailed = data?.failed
              const errorMessage = data?.error

              return (
                <div key={model} className="bg-background/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {model}
                    </span>
                    {isFailed ? (
                      <Badge variant="destructive" className="text-[10px]">Failed</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">AI Model</Badge>
                    )}
                  </div>

                  {isFailed ? (
                    <div className="py-4 space-y-2">
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3 text-destructive" />
                        Service Unavailable
                      </div>
                      {errorMessage && (
                        <div className="text-[10px] text-muted-foreground/70 leading-tight">
                          {errorMessage.length > 60 ? errorMessage.substring(0, 60) + '...' : errorMessage}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Sentiment</div>
                        <div className="flex items-end gap-1">
                          <span className={cn('text-3xl font-bold', getSentimentColor(modelScore))}>
                            {modelScore}
                          </span>
                          <span className="text-xs text-muted-foreground mb-1">/100</span>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Visibility</div>
                        <div className="flex items-end gap-1">
                          <span className={cn('text-3xl font-bold', getVisibilityColor(visData?.visibility_score ?? 0))}>
                            {visData?.visibility_score ?? 0}
                          </span>
                          <span className="text-xs text-muted-foreground mb-1">%</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {(visData?.appearances ?? 0)}/{(visData?.total_prompts ?? 0)} mentions
                        </div>
                      </div>



                      <div className="pt-2 border-t border-border/50">
                        <div className="text-[10px] text-muted-foreground mb-1">Sentiment Mix</div>
                        <div className="flex gap-1">
                          <div
                            className="h-1.5 bg-emerald-400 rounded-full"
                            style={{ width: `${((modelDistribution.Positive ?? 0) / 5) * 100}%` }}
                            title={`Positive: ${modelDistribution.Positive ?? 0}`}
                          />
                          <div
                            className="h-1.5 bg-rose-400 rounded-full"
                            style={{ width: `${((modelDistribution.Negative ?? 0) / 5) * 100}%` }}
                            title={`Negative: ${modelDistribution.Negative ?? 0}`}
                          />
                          <div
                            className="h-1.5 bg-amber-400 rounded-full"
                            style={{ width: `${((modelDistribution.Neutral ?? 0) / 5) * 100}%` }}
                            title={`Neutral: ${modelDistribution.Neutral ?? 0}`}
                          />
                        </div>
                      </div>
                    </>
                  )
                  }
                </div>
              )
            })}
          </div>
        </div>
      </Card >

      {/* Insights Panel */}
      < Card className="rounded-xl border p-6 bg-(--nd-bg) border-(--nd-border)" >
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-blue-400" />
            What This Means
          </h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">•</span>
              <span>
                <strong>Sentiment Score:</strong> How positively AI models perceive your brand when asked directly (0–100)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>
                <strong>Visibility Score:</strong> How often AI recommends your brand organically without being prompted (0–100%)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400 mt-0.5">•</span>
              <span>
                <strong>Higher scores:</strong> Better AI perception and stronger organic recommendations in AI-powered search
              </span>
            </li>
          </ul>
        </div>
      </Card >
    </div >
  )
}
