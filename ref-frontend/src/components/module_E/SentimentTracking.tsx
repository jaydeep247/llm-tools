'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Heart, TrendingUp, Activity } from 'lucide-react'
// import { useTrackSentimentMutation, useGetSentimentHistoryQuery } from '@/store/api/module_E/sentimentApi'

interface SentimentTrackingProps {
  brandName: string
}
// ... existing generic interfaces ...
interface ModelData {
  model: string
  average_score: number
  distribution?: {
    Positive?: number
    Neutral?: number
    Negative?: number
  }
  details: any[]
}

interface SentimentResult {
  brand_name: string
  overall_score: number
  distribution?: {
    Positive?: number
    Neutral?: number
    Negative?: number
  }
  models: {
    [key: string]: ModelData
  }
  visibility?: {
    overall_visibility_score: number
    models: {
      [key: string]: {
        appearance_rate: number
        avg_position_weight: number
        visibility_score: number
        total_prompts: number
        appearances: number
      }
    }
  }
}

const NOT_CONFIGURED = 'not configured'

export default function SentimentTracking({ brandName }: SentimentTrackingProps) {
  const normalizedBrand = (brandName || '').trim()
  const isBrandConfigured = normalizedBrand.length > 0 && normalizedBrand.toLowerCase() !== NOT_CONFIGURED

  const [data, setData] = useState<SentimentResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ date: string; sentimentScore?: number; visibilityScore?: number; score?: number }[]>([])

  // Mock RTK Query hooks
  const trackSentiment = (args: any) => ({ unwrap: async () => ({ data: null } as any) })
  const historyData: any = null
  const refetchHistory = async () => {}
  /*
  const [trackSentiment] = useTrackSentimentMutation()
  const { data: historyData, refetch: refetchHistory } = useGetSentimentHistoryQuery(normalizedBrand, {
    skip: !isBrandConfigured,
  })
  */

  // Load history
  useEffect(() => {
    if (historyData?.success) {
      setHistory(historyData.history || [])
      setData((prev) => {
        if (prev == null && historyData.latestResult) {
          return historyData.latestResult
        }
        return prev
      })
    }
  }, [historyData])

  // Manual Analysis Trigger
  const runAnalysis = async () => {
    if (!isBrandConfigured) {
      setError('Brand name is not configured. Please set a valid brand before running analysis.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await trackSentiment({ brand_name: normalizedBrand }).unwrap()
      const payload = (result && (result.data || result)) as SentimentResult | null

      if (!payload || !payload.distribution) {
        setData(null)
        setError('No sentiment data returned from analysis. Please try again later.')
      } else {
        setData(payload)
      }
      await refetchHistory()
    } catch (err: unknown) {
      setError(((err as any)?.data?.error ?? (err as any)?.message ?? 'Failed to fetch sentiment data'))
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400'
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return 'default'
    if (score >= 60) return 'secondary'
    return 'destructive'
  }

  const getBarWidth = (count: number, total: number) => {
    if (total === 0) return '0%'
    return `${(count / total) * 100}%`
  }

  const getSentimentLabel = (distribution?: { Positive?: number; Neutral?: number; Negative?: number }) => {
    const positive = distribution?.Positive ?? 0
    const neutral = distribution?.Neutral ?? 0
    const negative = distribution?.Negative ?? 0
    const total = positive + neutral + negative
    if (total === 0) return "No Data"
    const posPct = positive / total
    const negPct = negative / total

    if (posPct > 0.6) return "Positive Strong"
    if (posPct > 0.4) return "Positive Leaning"
    if (negPct > 0.4) return "Negative Leaning"
    return "Neutral / Mixed"
  }

  // Render Sentiment Trend Chart
  const renderSentimentChart = () => {
    if (history.length < 2) {
      return (
        <div className="p-6 border border-dashed border-border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            {history.length === 1 ? "1 analysis saved. Run again to see a trend line." : "No history yet. Run an analysis to track sentiment over time."}
          </p>
        </div>
      )
    }

    const height = 150
    const width = 600
    const paddingLeft = 30
    const paddingRight = 20
    const paddingBottom = 25
    const paddingTop = 20

    const recentHistory = history.slice(-12)
    const startTime = new Date(recentHistory[0].date).getTime()
    const endTime = new Date(recentHistory[recentHistory.length - 1].date).getTime()
    const timeRange = endTime - startTime || 1

    const getCoord = (h: { date: string; sentimentScore?: number; visibilityScore?: number; score?: number }) => {
      const time = new Date(h.date).getTime()
      const value = (h.sentimentScore ?? h.score ?? 0)
      const x = paddingLeft + ((time - startTime) / timeRange) * (width - paddingLeft - paddingRight)
      const y = height - paddingBottom - (value / 100) * (height - paddingBottom - paddingTop)
      return { x, y }
    }

    const points = recentHistory.map(getCoord)
    const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ")
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`

    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-2">
        <div className="w-full overflow-hidden relative" style={{ height: '100%' }}>
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-muted-foreground font-mono pointer-events-none" style={{ height: `${height}px`, paddingBottom: `${paddingBottom}px`, paddingTop: `${paddingTop}px` }}>
            <span>100</span>
            <span>50</span>
            <span>0</span>
          </div>

          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 ml-2" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sentimentChartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
              </linearGradient>
            </defs>

            <line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} className="stroke-border stroke-[0.5]" strokeDasharray="4 4" />
            <line x1={paddingLeft} y1={(height - paddingBottom - paddingTop) / 2 + paddingTop} x2={width - paddingRight} y2={(height - paddingBottom - paddingTop) / 2 + paddingTop} className="stroke-border stroke-[0.5]" strokeDasharray="4 4" />
            <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} className="stroke-border stroke-1" />

            <path d={areaPath} fill="url(#sentimentChartGradient)" className="stroke-none" />
            <path d={linePath} className="stroke-yellow-500 stroke-2 fill-none" style={{ filter: 'drop-shadow(0 2px 4px rgb(0 0 0 / 0.1))' }} />

            {points.map((p, i) => {
              const entry = recentHistory[i]
              const value = entry.sentimentScore ?? entry.score ?? 0
              return (
                <circle key={i} cx={p.x} cy={p.y} r="4" className="fill-background stroke-yellow-500 stroke-2 hover:fill-yellow-500 cursor-pointer transition-colors">
                  <title>{`Sentiment: ${value}`}</title>
                </circle>
              )
            })}
          </svg>
        </div>
      </div>
    )
  }

  // Render Visibility Trend Chart
  const renderVisibilityChart = () => {
    if (history.length < 2) {
      return (
        <div className="p-6 border border-dashed border-border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            {history.length === 1 ? "1 analysis saved. Run again to see a trend line." : "No history yet. Run an analysis to track visibility over time."}
          </p>
        </div>
      )
    }

    const height = 150
    const width = 600
    const paddingLeft = 30
    const paddingRight = 20
    const paddingBottom = 25
    const paddingTop = 20

    const recentHistory = history.slice(-12)
    const startTime = new Date(recentHistory[0].date).getTime()
    const endTime = new Date(recentHistory[recentHistory.length - 1].date).getTime()
    const timeRange = endTime - startTime || 1

    const getCoord = (h: { date: string; sentimentScore?: number; visibilityScore?: number; score?: number }) => {
      const time = new Date(h.date).getTime()
      const value = (h.visibilityScore ?? h.score ?? 0)
      const x = paddingLeft + ((time - startTime) / timeRange) * (width - paddingLeft - paddingRight)
      const y = height - paddingBottom - (value / 100) * (height - paddingBottom - paddingTop)
      return { x, y }
    }

    const points = recentHistory.map(getCoord)
    const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ")
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`

    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-2">
        <div className="w-full overflow-hidden relative" style={{ height: '100%' }}>
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-muted-foreground font-mono pointer-events-none" style={{ height: `${height}px`, paddingBottom: `${paddingBottom}px`, paddingTop: `${paddingTop}px` }}>
            <span>100</span>
            <span>50</span>
            <span>0</span>
          </div>

          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 ml-2" preserveAspectRatio="none">
            <defs>
              <linearGradient id="visibilityChartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
              </linearGradient>
            </defs>

            <line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} className="stroke-border stroke-[0.5]" strokeDasharray="4 4" />
            <line x1={paddingLeft} y1={(height - paddingBottom - paddingTop) / 2 + paddingTop} x2={width - paddingRight} y2={(height - paddingBottom - paddingTop) / 2 + paddingTop} className="stroke-border stroke-[0.5]" strokeDasharray="4 4" />
            <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} className="stroke-border stroke-1" />

            <path d={areaPath} fill="url(#visibilityChartGradient)" className="stroke-none" />
            <path d={linePath} className="stroke-blue-500 stroke-2 fill-none" style={{ filter: 'drop-shadow(0 2px 4px rgb(0 0 0 / 0.1))' }} />

            {points.map((p, i) => {
              const entry = recentHistory[i]
              const value = entry.visibilityScore ?? entry.score ?? 0
              return (
                <circle key={i} cx={p.x} cy={p.y} r="4" className="fill-background stroke-blue-500 stroke-2 hover:fill-blue-500 cursor-pointer transition-colors">
                  <title>{`Visibility: ${value}`}</title>
                </circle>
              )
            })}
          </svg>
        </div>
      </div>
    )
  }

  // Brand not configured
  if (!isBrandConfigured) {
    return (
      <div className="p-6 border border-amber-500/50 bg-amber-500/10 rounded-lg">
        <p className="font-semibold text-amber-700 dark:text-amber-400">Brand is Not Configured</p>
        <p className="text-sm text-amber-600 dark:text-amber-300 mt-1">
          Set a valid brand name to run sentiment and visibility analysis.
        </p>
        <p className="text-xs text-muted-foreground font-mono mt-2">
          Current value: {brandName === '' ? '(empty)' : JSON.stringify(brandName)}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 border border-destructive/50 bg-destructive/10 rounded-lg text-center">
        <p className="font-semibold text-destructive">Validation Failed</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm" className="mt-4 cursor-pointer">
          Retry Analysis
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-800/50 border border-zinc-800">
            <Heart className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Sentiment & Visibility Tracking
            </h3>
            <p className="text-sm text-muted-foreground">
              {normalizedBrand}
            </p>
          </div>
        </div>
        {!loading && (
          <Button onClick={runAnalysis} size="sm" className="cursor-pointer">
            <Activity className="w-4 h-4 mr-2" />
            Run Analysis
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 min-h-70 border border-border rounded-lg">
          <Loader2 className="w-12 h-12 animate-spin text-muted-foreground mb-4" />
          <p className="font-medium text-foreground">Running sentiment & visibility analysis...</p>
          <p className="text-sm text-muted-foreground mt-1">
            Consulting AI models (OpenAI, Gemini, Claude). This may take a moment.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN: Sentiment */}
          <div className="space-y-4">
            {data && (
              (() => {
                const distribution = {
                  Positive: data.distribution?.Positive ?? 0,
                  Neutral: data.distribution?.Neutral ?? 0,
                  Negative: data.distribution?.Negative ?? 0,
                }
                const totalForBars = distribution.Positive + distribution.Neutral + distribution.Negative

                return (
              <div className="border border-border rounded-lg p-6 bg-card">
                <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Sentiment Overview
                </h5>
                <div className="flex items-center gap-4">
                  <div className="text-center pr-4 border-r border-border">
                    <div className={`text-4xl font-bold ${getScoreColor(data.overall_score)}`}>
                      {data.overall_score}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                      Sentiment Score
                    </div>
                  </div>
                  <div className="grow pl-2">
                    <div className="text-sm mb-2 flex justify-between items-center">
                      <span className="text-muted-foreground">Sentiment:</span>
                      <Badge variant={getScoreBadgeVariant(data.overall_score)}>
                        {getSentimentLabel(distribution)}
                      </Badge>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-muted w-full">
                      <div
                        style={{ width: getBarWidth(distribution.Positive, totalForBars) }}
                        className="bg-green-500 h-full"
                        title={`Positive: ${distribution.Positive}`}
                      />
                      <div
                        style={{ width: getBarWidth(distribution.Neutral, totalForBars) }}
                        className="bg-yellow-500 h-full"
                        title={`Neutral: ${distribution.Neutral}`}
                      />
                      <div
                        style={{ width: getBarWidth(distribution.Negative, totalForBars) }}
                        className="bg-red-500 h-full"
                        title={`Negative: ${distribution.Negative}`}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                      <span>Pos</span>
                      <span>Neu</span>
                      <span>Neg</span>
                    </div>
                  </div>
                </div>
              </div>
                )
              })()
            )}

            {/* Sentiment Trend */}
            <div className="border border-border rounded-lg p-4 bg-card min-h-55">
              <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 text-center">
                Sentiment Trend
              </h5>
              <div className="grow flex items-center justify-center w-full">
                {renderSentimentChart()}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Visibility */}
          <div className="space-y-4">
            {data?.visibility && (
              <div className="border border-border rounded-lg p-6 bg-card">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Visibility Overview
                    </h5>
                    <p className="text-xs text-muted-foreground">
                      Brand appearance across AI models
                    </p>
                  </div>
                  <div className={`text-3xl font-bold ${getScoreColor(data.visibility.overall_visibility_score)}`}>
                    {data.visibility.overall_visibility_score}
                  </div>
                </div>
              </div>
            )}

            {/* Model-wise Visibility Table */}
            {data && (
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <div className="px-4 py-3 bg-muted">
                  <h5 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    Model-wise Visibility
                  </h5>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Model
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Distribution
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Sentiment
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Visibility
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-background divide-y divide-border">
                      {Object.entries(data.models).map(([model, info]) => {
                        const visibilityForModel = data.visibility?.models?.[model]
                        const modelDistribution = {
                          Positive: info.distribution?.Positive ?? 0,
                          Neutral: info.distribution?.Neutral ?? 0,
                          Negative: info.distribution?.Negative ?? 0,
                        }
                        return (
                          <tr key={model} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground capitalize">
                              {model}
                            </td>
                            <td className="px-4 py-3 text-right text-xs">
                              <span className="text-green-500">{modelDistribution.Positive}</span>
                              <span className="text-muted-foreground mx-1">/</span>
                              <span className="text-yellow-500">{modelDistribution.Neutral}</span>
                              <span className="text-muted-foreground mx-1">/</span>
                              <span className="text-red-500">{modelDistribution.Negative}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Badge variant={getScoreBadgeVariant(info.average_score)}>
                                {info.average_score}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right text-xs">
                              {visibilityForModel ? (
                                <div className="flex flex-col items-end">
                                  <Badge variant={getScoreBadgeVariant(visibilityForModel.visibility_score)}>
                                    {visibilityForModel.visibility_score}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground mt-1">
                                    {(visibilityForModel.appearance_rate * 100).toFixed(0)}% •{" "}
                                    {(visibilityForModel.avg_position_weight ?? 0).toFixed(2)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
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

            {/* Visibility Trend */}
            <div className="border border-border rounded-lg p-4 bg-card min-h-55">
              <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 text-center">
                Visibility Trend
              </h5>
              <div className="grow flex items-center justify-center w-full">
                {renderVisibilityChart()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
