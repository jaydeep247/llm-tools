'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, TrendingUp, TrendingDown, Minus, Globe, Play, CheckCircle2, RefreshCw } from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { useGetModuleEResultQuery, useRunBrandAnalysisMutation } from '@/store/api/module_E/moduleEApi'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'
import { ModuleEMetricAskButton, useModuleEAskAi } from '@/components/module_E/useModuleEAskAi'

interface BrandAnalysisSectionProps {
  jobId?: string | null
  projectId?: string | null
}

const BRAND_ANALYSIS_SECTION_DESCRIPTION =
  'Understand how your brand is discussed across AI-visible sources, including mention volume, sentiment mix, and trend direction. Use this view to validate brand perception and prioritize channels where positive coverage is growing.'

export default function BrandAnalysisSection({ jobId, projectId }: BrandAnalysisSectionProps) {
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
    if (label.includes('Positive')) return 'text-emerald-600'
    if (label.includes('Negative')) return 'text-rose-600'
    return 'text-amber-600'
  }

  const getSentimentBg = (label?: string) => {
    if (!label) return 'bg-gray-50 border-gray-200'
    if (label.includes('Positive')) return 'bg-emerald-50 border-emerald-200'
    if (label.includes('Negative')) return 'bg-rose-50 border-rose-200'
    return 'bg-amber-50 border-amber-200'
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
  const { askAiDialog, runMetricAskAi, canAskAi, isAskingAI } = useModuleEAskAi(projectId, jobId)

  return (
    <div className="space-y-4">
      {askAiDialog}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Brand Analysis</h3>
            <FieldTooltip description={BRAND_ANALYSIS_SECTION_DESCRIPTION} />
          </div>
        </div>
        {brandAnalysis && (
          <button
            type="button"
            onClick={handleRunAnalysis}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--nd-purple)', color: '#fff' }}
          >
            {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {isRunning ? 'Running…' : 'Re-run'}
          </button>
        )}
      </div>

      {!brandAnalysis && !isRunning && (
        <AnalysisEmptyState
          icon={<Globe className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />}
          title="No Brand Analysis Data"
          description='No brand analysis results yet. Click "Run Analysis" to generate insights.'
          onRunAnalysis={handleRunAnalysis}
          isAnalyzing={isRunning}
          buttonLabel="Run Analysis"
        />
      )}

      {(brandAnalysis || isRunning) && (
        <>
          {/* Main Brand Card */}
          <div className="rounded-2xl border p-6" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{brandName}</h3>
                  <p className="text-sm font-medium" style={{ color: 'var(--nd-text-secondary)' }}>Brand Mentions & Sentiment</p>
                </div>
                {isLoading && <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--nd-text-muted)' }} />}
              </div>

              {/* Total Mentions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Mentions */}
                <div className="rounded-xl p-4" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Total Mentions</p>
                    <ModuleEMetricAskButton
                      disabled={!canAskAi || isAskingAI}
                      onClick={() =>
                        runMetricAskAi(
                          'Total Mentions',
                          `Explain this brand mention volume and what it means strategically.\n${JSON.stringify({
                            brand_name: brandName,
                            total_mentions: totalMentions,
                            peak_month: peakMonth,
                          })}`,
                        )
                      }
                    />
                  </div>
                  <p className="text-4xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>
                    {totalMentions.toLocaleString()}
                  </p>
                  {peakMonth && (
                    <p className="text-[10px] font-medium mt-2" style={{ color: 'var(--nd-text-muted)' }}>
                      Peak: {peakMonth.count?.toLocaleString()} ({peakMonth.date})
                    </p>
                  )}
                </div>

                {/* Sentiment Label */}
                <div className="rounded-xl p-4 flex flex-col justify-center" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Overall Sentiment</p>
                    <ModuleEMetricAskButton
                      disabled={!canAskAi || isAskingAI}
                      onClick={() =>
                        runMetricAskAi(
                          'Overall Sentiment',
                          `Interpret this sentiment summary and suggest the highest-impact next action.\n${JSON.stringify({
                            brand_name: brandName,
                            sentiment_label: sentiment.label,
                            sentiment_counts: sentimentCounts,
                          })}`,
                        )
                      }
                    />
                  </div>
                  <Badge 
                    variant="outline"
                    className={cn('w-fit text-sm font-bold', getSentimentColor(sentiment.label))}
                    style={{ borderColor: 'var(--nd-border)' }}
                  >
                    {sentiment.label || 'No Data'}
                  </Badge>
                </div>

                {/* Trend */}
                <div className="rounded-xl p-4 flex items-center justify-center" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                  <div className="text-center">
                    <div className="mb-2 flex items-center justify-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>12M Trend</p>
                      <ModuleEMetricAskButton
                        disabled={!canAskAi || isAskingAI}
                        onClick={() =>
                          runMetricAskAi(
                            '12M Trend',
                            `Analyze this 12-month brand mention trend and explain whether momentum is improving.\n${JSON.stringify({
                              brand_name: brandName,
                              trend_direction: trendDirection,
                              monthly_trend: last12MonthsTrend,
                            })}`,
                          )
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2 justify-center">
                      {trendDirection === 'up' && <TrendingUp className="w-6 h-6 text-emerald-600" />}
                      {trendDirection === 'down' && <TrendingDown className="w-6 h-6 text-rose-600" />}
                      {trendDirection === 'stable' && <Minus className="w-6 h-6 text-amber-600" />}
                      {!trendDirection && <Minus className="w-6 h-6 text-gray-400" />}
                      <span style={{ color: trendDirection === 'up' ? '#059669' : trendDirection === 'down' ? '#dc2626' : trendDirection === 'stable' ? '#d97706' : 'var(--nd-text-muted)' }} className="text-sm font-bold capitalize">
                        {trendDirection || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sentiment Distribution */}
              {totalSentiment > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>
                    Sentiment Distribution
                  </p>
                  <div className="space-y-3">
                    {/* Positive */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-emerald-600 font-bold">Positive</span>
                          <span className="text-[10px] font-bold" style={{ color: 'var(--nd-text-muted)' }}>{sentimentPercentages.positive}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${sentimentPercentages.positive}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Negative */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-rose-600 font-bold">Negative</span>
                          <span className="text-[10px] font-bold" style={{ color: 'var(--nd-text-muted)' }}>{sentimentPercentages.negative}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                          <div
                            className="h-full bg-rose-500"
                            style={{ width: `${sentimentPercentages.negative}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Neutral */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-amber-600 font-bold">Neutral</span>
                          <span className="text-[10px] font-bold" style={{ color: 'var(--nd-text-muted)' }}>{sentimentPercentages.neutral}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                          <div
                            className="h-full bg-amber-500"
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
            <div className="rounded-2xl border p-6" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-primary)' }}>
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
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] px-3 py-1.5 rounded-lg whitespace-nowrap z-10 shadow-lg border" style={{ background: 'var(--nd-text-primary)', borderColor: 'var(--nd-border)' }}>
                            <div className="font-bold">{item.count?.toLocaleString()} mentions</div>
                            <div className="opacity-80 text-[9px]">{monthLabel} {item.date ? new Date(item.date).getFullYear() : ''}</div>
                            {/* Arrow */}
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 border-b border-r rotate-45" style={{ background: 'var(--nd-text-primary)', borderColor: 'var(--nd-border)' }}></div>
                          </div>
                          
                          {/* Bar */}
                          <div className="w-full flex items-end justify-center" style={{ height: '120px' }}>
                            <div
                              className="w-full rounded-t-md transition-all cursor-pointer opacity-80 hover:opacity-100"
                              style={{ height: `${heightPx}px`, background: 'var(--nd-blue)' }}
                            />
                          </div>
                          
                          {/* Month Label */}
                          <span className="text-[10px] font-bold text-center truncate w-full" style={{ color: 'var(--nd-text-muted)' }}>
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
            <div className="rounded-2xl border p-6" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" style={{ color: 'var(--nd-blue)' }} />
                    <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-primary)' }}>
                      Top Source Domains
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: 'var(--nd-text-muted)' }}>
                    {topSources.length} source{topSources.length !== 1 ? 's' : ''} found
                  </span>
                </div>

                {/* Source Cards */}
                <div className="space-y-2">
                  {topSources.slice(0, expandedSources ? undefined : 5).map((source: any, idx: number) => {
                    const domain = source.domain || ''
                    const pageUrl = source.url || (domain ? `https://${domain}` : '')
                    const title = source.title || domain
                    const snippet = source.snippet || ''
                    const mentionCount = source.mention_count ?? null

                    return (
                      <a
                        key={idx}
                        href={pageUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 rounded-xl border p-3 transition-all group cursor-pointer"
                        style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--nd-blue)'; (e.currentTarget as HTMLElement).style.background = 'var(--nd-card-bg)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--nd-border)'; (e.currentTarget as HTMLElement).style.background = 'var(--nd-bg)' }}
                      >
                        {/* Favicon */}
                        <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden border" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                          {domain ? (
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                              alt={domain}
                              className="w-5 h-5"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          ) : (
                            <Globe className="w-4 h-4" style={{ color: 'var(--nd-text-muted)' }} />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="text-sm font-bold truncate group-hover:text-blue-600 transition-colors" style={{ color: 'var(--nd-text-primary)' }}>
                              {title || domain}
                            </p>
                            {mentionCount !== null && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border flex-shrink-0 font-bold" style={{ background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)', borderColor: 'var(--nd-purple-subtle)' }}>
                                {mentionCount}&times;
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] font-bold truncate mb-1" style={{ color: 'var(--nd-text-muted)' }}>
                            {domain}
                          </p>
                          {snippet && (
                            <p className="text-xs font-medium line-clamp-2 leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>
                              {snippet}
                            </p>
                          )}
                        </div>
                      </a>
                    )
                  })}
                </div>

                {/* Show more / less toggle */}
                {topSources.length > 5 && (
                  <button
                    onClick={() => setExpandedSources(!expandedSources)}
                    className="w-full text-xs font-bold transition-colors py-1"
                    style={{ color: 'var(--nd-text-muted)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nd-text-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nd-text-muted)'}
                  >
                    {expandedSources
                      ? 'Show less'
                      : `Show ${topSources.length - 5} more source${topSources.length - 5 !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
