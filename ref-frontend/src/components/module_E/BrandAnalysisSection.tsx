'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, TrendingUp, TrendingDown, Minus, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetModuleEResultQuery, useRunModuleEAnalysisMutation } from '@/store/api/module_E/moduleEApi'

interface BrandAnalysisSectionProps {
  jobId?: string | null
}

export default function BrandAnalysisSection({ jobId }: BrandAnalysisSectionProps) {
  const [expandedSources, setExpandedSources] = useState(false)

  // Fetch Module E result which includes brand_analysis
  const { data, isLoading } = useGetModuleEResultQuery(jobId || '', {
    skip: !jobId,
  })
  const [runModuleEAnalysis, { isLoading: isRunning }] = useRunModuleEAnalysisMutation()

  const brandAnalysis = data?.data?.brand_analysis

  const brandName = brandAnalysis?.brand_name || 'Unknown Brand'
  const totalMentions = brandAnalysis?.total_mentions ?? 0
  const sentiment = brandAnalysis?.sentiment || { counts: {}, label: 'No Data' }
  const frequencyTrend = brandAnalysis?.frequency_trend || []
  const topSources = brandAnalysis?.top_sources || []

  const sentimentCounts = sentiment.counts || {}
  const positive = sentimentCounts.positive || 0
  const negative = sentimentCounts.negative || 0
  const neutral = sentimentCounts.neutral || 0
  const totalSentiment = positive + negative + neutral

  // Calculate percentages
  const sentimentPercentages = useMemo(() => {
    if (totalSentiment === 0) {
      return { positive: 0, negative: 0, neutral: 0 }
    }
    return {
      positive: Math.round((positive / totalSentiment) * 100),
      negative: Math.round((negative / totalSentiment) * 100),
      neutral: Math.round((neutral / totalSentiment) * 100),
    }
  }, [positive, negative, neutral, totalSentiment])

  // Get sentiment color
  const getSentimentColor = (label?: string) => {
    if (!label) return 'text-gray-500'
    if (label.includes('Positive')) return 'text-emerald-400'
    if (label.includes('Negative')) return 'text-rose-400'
    return 'text-amber-400'
  }

  const getSentimentBg = (label?: string) => {
    if (!label) return 'bg-gray-500/10 border-gray-500/30'
    if (label.includes('Positive')) return 'bg-emerald-500/10 border-emerald-500/30'
    if (label.includes('Negative')) return 'bg-rose-500/10 border-rose-500/30'
    return 'bg-amber-500/10 border-amber-500/30'
  }

  // Get peak month
  const peakMonth = useMemo(() => {
    if (frequencyTrend.length === 0) return null
    return frequencyTrend.reduce((max, current) => {
      return (current.count ?? 0) > (max.count ?? 0) ? current : max
    })
  }, [frequencyTrend])

  // Calculate trend direction
  const trendDirection = useMemo(() => {
    if (frequencyTrend.length < 2) return null
    const recent = frequencyTrend.slice(-3).reduce((sum, item) => sum + (item.count ?? 0), 0)
    const past = frequencyTrend.slice(0, 3).reduce((sum, item) => sum + (item.count ?? 0), 0)
    return recent > past ? 'up' : recent < past ? 'down' : 'stable'
  }, [frequencyTrend])

  const handleRunAnalysis = async () => {
    if (!jobId || isRunning) return
    try {
      await runModuleEAnalysis(jobId).unwrap()
    } catch (error) {
      console.error('Failed to run Module E analysis:', error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Brand Analysis</h3>
          <p className="text-xs text-muted-foreground">Run Module E on demand</p>
        </div>
        <Button
          type="button"
          onClick={handleRunAnalysis}
          disabled={!jobId || isRunning}
          className="gap-2"
        >
          {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
          Run Analysis
        </Button>
      </div>

      {!brandAnalysis && (
        <Card className="rounded-xl border p-6">
          <p className="text-sm text-muted-foreground">
            No brand analysis results yet. Click "Run Analysis" to generate insights.
          </p>
        </Card>
      )}

      {brandAnalysis && (
        <>
          {/* Main Brand Card */}
          <Card className={cn('rounded-xl border p-6', getSentimentBg(sentiment.label))}>
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-foreground">{brandName}</h3>
                  <p className="text-sm text-muted-foreground">Brand Mentions & Sentiment</p>
                </div>
                {isLoading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
              </div>

              {/* Total Mentions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Mentions */}
                <div className="rounded-lg bg-background/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Total Mentions
                  </p>
                  <p className="text-4xl font-bold text-foreground">
                    {totalMentions.toLocaleString()}
                  </p>
                  {peakMonth && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Peak: {peakMonth.count?.toLocaleString()} ({peakMonth.date})
                    </p>
                  )}
                </div>

                {/* Sentiment Label */}
                <div className="rounded-lg bg-background/50 p-4 flex flex-col justify-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Overall Sentiment
                  </p>
                  <Badge className={cn('w-fit text-sm font-semibold', getSentimentColor(sentiment.label))}>
                    {sentiment.label || 'No Data'}
                  </Badge>
                </div>

                {/* Trend */}
                <div className="rounded-lg bg-background/50 p-4 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      12M Trend
                    </p>
                    <div className="flex items-center gap-2 justify-center">
                      {trendDirection === 'up' && <TrendingUp className="w-6 h-6 text-emerald-400" />}
                      {trendDirection === 'down' && <TrendingDown className="w-6 h-6 text-rose-400" />}
                      {trendDirection === 'stable' && <Minus className="w-6 h-6 text-amber-400" />}
                      {!trendDirection && <Minus className="w-6 h-6 text-gray-400" />}
                      <span className={cn('text-sm font-semibold capitalize', {
                        'text-emerald-400': trendDirection === 'up',
                        'text-rose-400': trendDirection === 'down',
                        'text-amber-400': trendDirection === 'stable',
                        'text-muted-foreground': !trendDirection
                      })}>
                        {trendDirection || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sentiment Distribution */}
              {totalSentiment > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sentiment Distribution
                  </p>
                  <div className="space-y-2">
                    {/* Positive */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-emerald-400 font-semibold">Positive</span>
                          <span className="text-xs text-muted-foreground">{sentimentPercentages.positive}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-400"
                            style={{ width: `${sentimentPercentages.positive}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Negative */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-rose-400 font-semibold">Negative</span>
                          <span className="text-xs text-muted-foreground">{sentimentPercentages.negative}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rose-400"
                            style={{ width: `${sentimentPercentages.negative}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Neutral */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-amber-400 font-semibold">Neutral</span>
                          <span className="text-xs text-muted-foreground">{sentimentPercentages.neutral}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400"
                            style={{ width: `${sentimentPercentages.neutral}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Frequency Trend */}
          {frequencyTrend.length > 0 && (
            <Card className="rounded-xl border p-6">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                  Monthly Mention Frequency
                </h4>
                <div className="overflow-x-auto">
                  <div className="flex gap-1 min-w-full pb-2 pt-16">
                    {frequencyTrend.map((item, idx) => {
                      const maxCount = Math.max(...frequencyTrend.map(t => t.count ?? 0), 1)
                      const count = item.count ?? 0
                      // Use square root scaling for better visibility of small values
                      const normalizedHeight = count > 0 ? Math.sqrt(count) / Math.sqrt(maxCount) : 0
                      const heightPx = count > 0 ? Math.max(normalizedHeight * 120, 15) : 5
                      const monthLabel = item.date
                        ? new Date(item.date).toLocaleDateString('en-US', { month: 'short' })
                        : ''

                      return (
                        <div key={idx} className="flex flex-col items-center gap-1 flex-1 min-w-[40px] group relative">
                          {/* Tooltip */}
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap z-10 shadow-lg border border-gray-700">
                            <div className="font-semibold">{item.count?.toLocaleString()} mentions</div>
                            <div className="text-gray-300 text-[10px]">{monthLabel} {item.date ? new Date(item.date).getFullYear() : ''}</div>
                            {/* Arrow */}
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 border-b border-r border-gray-700 rotate-45"></div>
                          </div>
                          
                          {/* Bar */}
                          <div className="w-full flex items-end justify-center" style={{ height: '120px' }}>
                            <div
                              className="w-full bg-gradient-to-t from-cyan-500 via-cyan-400 to-blue-500 rounded-t-md transition-all hover:from-cyan-400 hover:via-cyan-300 hover:to-blue-400 cursor-pointer shadow-lg"
                              style={{ height: `${heightPx}px` }}
                            />
                          </div>
                          
                          {/* Month Label */}
                          <span className="text-[10px] text-muted-foreground text-center truncate w-full font-medium">
                            {monthLabel}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Top Sources */}
          {topSources.length > 0 && (
            <Card className="rounded-xl border p-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-foreground" />
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                    Top Source Domains
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {topSources.slice(0, expandedSources ? undefined : 3).map((source, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {source.domain}
                    </Badge>
                  ))}
                  {topSources.length > 3 && !expandedSources && (
                    <Badge
                      variant="outline"
                      className="text-xs cursor-pointer hover:bg-secondary"
                      onClick={() => setExpandedSources(true)}
                    >
                      +{topSources.length - 3} more
                    </Badge>
                  )}
                  {expandedSources && topSources.length > 3 && (
                    <Badge
                      variant="outline"
                      className="text-xs cursor-pointer hover:bg-secondary"
                      onClick={() => setExpandedSources(false)}
                    >
                      Show less
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
