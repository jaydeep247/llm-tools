'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, TrendingUp, TrendingDown, Minus, Globe, Play, CheckCircle2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetModuleEResultQuery, useRunBrandAnalysisMutation } from '@/store/api/module_E/moduleEApi'

interface BrandAnalysisSectionProps {
  jobId?: string | null
}

export default function BrandAnalysisSection({ jobId }: BrandAnalysisSectionProps) {
  const [expandedSources, setExpandedSources] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [justCompleted, setJustCompleted] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | undefined>(undefined)

  // Fetch Module E result which includes brand_analysis
  const { data, isLoading } = useGetModuleEResultQuery(jobId || '', {
    skip: !jobId,
    pollingInterval: isPolling ? 3000 : 0,
  })
  
  const [runBrandAnalysis, { isLoading: isTriggering }] = useRunBrandAnalysisMutation()

  const brandAnalysis = data?.data?.brand_analysis
  const updatedAt = data?.data?.updatedAt

  // Initialize lastUpdatedAt
  useEffect(() => {
    if (updatedAt && !isPolling) {
      setLastUpdatedAt(updatedAt)
    }
  }, [updatedAt, isPolling])

  // Stop polling when data updates
  useEffect(() => {
    if (!isPolling) return
    
    if (updatedAt && updatedAt !== lastUpdatedAt) {
      setIsPolling(false)
      setPollCount(0)
      setLastUpdatedAt(updatedAt)
      setJustCompleted(true)
      // Reset success message after 3 seconds
      const timer = setTimeout(() => setJustCompleted(false), 3000)
      return () => clearTimeout(timer)
    }
    
    // Safety timeout: stop polling after 60 seconds (20 checks)
    if (pollCount > 20) {
      setIsPolling(false)
      setPollCount(0)
    }
  }, [updatedAt, lastUpdatedAt, isPolling, pollCount])

  // Increment poll count
  useEffect(() => {
    if (isPolling) {
      const timer = setInterval(() => {
        setPollCount(prev => prev + 1)
      }, 3000)
      return () => clearInterval(timer)
    }
  }, [isPolling])

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

  const last12MonthsTrend = useMemo(() => {
    if (!frequencyTrend || frequencyTrend.length === 0) return []
    const now = new Date()
    const months: { date: string; count: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const key = `${year}-${month}`
      const existing = frequencyTrend.find(
        (item: any) => item.date && String(item.date).slice(0, 7) === key
      )
      months.push({
        date: `${year}-${month}-01`,
        count: existing?.count ?? 0,
      })
    }
    return months
  }, [frequencyTrend])

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
    if (last12MonthsTrend.length === 0) return null
    return last12MonthsTrend.reduce((max, current) => {
      return (current.count ?? 0) > (max.count ?? 0) ? current : max
    })
  }, [last12MonthsTrend])

  // Calculate trend direction
  const trendDirection = useMemo(() => {
    if (last12MonthsTrend.length < 2) return null
    const recent = last12MonthsTrend.slice(-3).reduce((sum, item) => sum + (item.count ?? 0), 0)
    const past = last12MonthsTrend.slice(0, 3).reduce((sum, item) => sum + (item.count ?? 0), 0)
    return recent > past ? 'up' : recent < past ? 'down' : 'stable'
  }, [last12MonthsTrend])

  const handleRunAnalysis = async () => {
    if (!jobId || isTriggering || isPolling) return
    
    // Capture current state before running
    setLastUpdatedAt(updatedAt)
    
    try {
      await runBrandAnalysis(jobId).unwrap()
      setIsPolling(true)
      setPollCount(0)
    } catch (error) {
      console.error('Failed to run Brand Analysis:', error)
      setIsPolling(false)
    }
  }

  const isRunning = isTriggering || isPolling

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
          className={cn(
            "gap-2 min-w-35",
            justCompleted && "bg-green-600 hover:bg-green-700 text-white"
          )}
        >
          {isTriggering ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Queuing...</>
          ) : isPolling ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
          ) : justCompleted ? (
            <><CheckCircle2 className="w-4 h-4" /> Done!</>
          ) : brandAnalysis ? (
            <><RefreshCw className="w-4 h-4" /> Re-run Analysis</>
          ) : (
            <><Play className="w-4 h-4" /> Run Analysis</>
          )}
        </Button>
      </div>

      {!brandAnalysis && !isRunning && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-800/50 p-6">
          <p className="text-sm text-zinc-400">
            No brand analysis results yet. Click "Run Analysis" to generate insights.
          </p>
        </div>
      )}

      {(brandAnalysis || isRunning) && (
        <>
          {/* Main Brand Card */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-800/50 p-6">
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
                <div className="rounded-xl bg-zinc-800/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
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
                <div className="rounded-xl bg-zinc-800/50 p-4 flex flex-col justify-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    Overall Sentiment
                  </p>
                  <Badge className={cn('w-fit text-sm font-semibold', getSentimentColor(sentiment.label))}>
                    {sentiment.label || 'No Data'}
                  </Badge>
                </div>

                {/* Trend */}
                <div className="rounded-xl bg-zinc-800/50 p-4 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
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
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
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
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
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
                          <span className="text-xs text-zinc-400">{sentimentPercentages.negative}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
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
                          <span className="text-xs text-zinc-400">{sentimentPercentages.neutral}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
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
          </div>

          {/* Frequency Trend (last 12 months) */}
          {totalMentions > 0 && last12MonthsTrend.length > 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-800/50 p-6">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
                  Monthly Mention Frequency
                </h4>
                <div className="overflow-x-auto">
                  <div className="flex gap-1 min-w-full pb-2 pt-16">
                    {last12MonthsTrend.map((item, idx) => {
                      const maxCount = Math.max(...last12MonthsTrend.map(t => t.count ?? 0), 1)
                      const count = item.count ?? 0
                      // Use square root scaling for better visibility of small values
                      const normalizedHeight = count > 0 ? Math.sqrt(count) / Math.sqrt(maxCount) : 0
                      const heightPx = count > 0 ? Math.max(normalizedHeight * 120, 15) : 5
                      const monthLabel = item.date
                        ? new Date(item.date).toLocaleDateString('en-US', { month: 'short' })
                        : ''

                      return (
                        <div key={idx} className="flex flex-col items-center gap-1 flex-1 min-w-10 group relative">
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
                              className="w-full bg-cyan-500 rounded-t-md transition-all hover:bg-cyan-400 cursor-pointer"
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
            </div>
          )}

          {/* Top Sources */}
          {topSources.length > 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-800/50 p-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-white" />
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
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
            </div>
          )}
        </>
      )}
    </div>
  )
}
