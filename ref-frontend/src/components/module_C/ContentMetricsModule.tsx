'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Loader2, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  Brain, 
  Search, 
  Shield, 
  Database, 
  Activity,
  Zap,
  List,
  BarChart,
  Eye,
  MessageSquare,
  BookOpen,
  ShoppingBag,
  Scale,
  CreditCard,
  Bot,
  HelpCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetContentMetricsQuery, useStartContentMetricsMutation } from '@/store/api/contentMetricsApi'
import { useGetSessionJobsQuery } from '@/store/api/jobApi'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RecommendationEnginePanel, RecommendationEnginePayload } from '@/components/module_D/RecommendationEnginePanel'

// Score Card Component - Adapted from AIVisibilityScorecards
interface ScoreCardProps {
  title: string
  score?: number | null
  value?: string | number | React.ReactNode
  icon: React.ReactNode
  color: string
  trend?: number
  subStats?: { label: string; value: string | number | React.ReactNode }[]
  error?: string
  isLoading?: boolean
  description?: string
  footer?: React.ReactNode
  suffix?: string
  help?: { meaning?: string; improve?: string } | null
}

function ScoreCard({ title, score, value, icon, color, trend, subStats, error, isLoading, description, footer, suffix = '/100', help }: ScoreCardProps) {
  const getScoreLabel = (s: number) => {
    if (s >= 80) return { text: 'Excellent', color: 'text-green-400 bg-green-500/10' }
    if (s >= 60) return { text: 'Good', color: 'text-yellow-400 bg-yellow-500/10' }
    if (s >= 40) return { text: 'Fair', color: 'text-orange-400 bg-orange-500/10' }
    return { text: 'Needs Work', color: 'text-red-400 bg-red-500/10' }
  }

  if (isLoading) {
    return (
      <div className="bg-[#111113] rounded-xl p-5 border border-zinc-800 animate-pulse h-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-800" />
          <div className="h-4 w-24 bg-zinc-800 rounded" />
        </div>
        <div className="h-12 w-20 bg-zinc-800 rounded mt-4" />
      </div>
    )
  }

  return (
    <div className="bg-[#111113] rounded-xl p-5 border border-zinc-800 hover:bg-[#0D0D10] transition-all duration-300 group h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className={cn("p-2.5 rounded-xl shrink-0", color)}>
            {icon}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="min-w-0">
              <span className="text-sm font-medium text-zinc-100 block">{title}</span>
              {description && !help && <span className="text-xs text-zinc-400 block mt-0.5 leading-relaxed">{description}</span>}
            </div>
            {help && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors focus:outline-none shrink-0 cursor-help"
                    aria-label={`${title} help`}
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  sideOffset={10}
                  className="max-w-64 bg-zinc-800 border border-zinc-700/60 text-zinc-100 text-[11px] leading-relaxed rounded-2xl px-3 py-2.5"
                >
                  <div className="space-y-1.5">
                    {help.meaning && <div><span className="font-semibold text-zinc-200">Meaning: </span><span className="text-zinc-200/90">{help.meaning}</span></div>}
                    {help.improve && <div><span className="font-semibold text-zinc-200">Improve: </span><span className="text-zinc-200/90">{help.improve}</span></div>}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {score !== undefined && score !== null && !error && (
          <span className={cn(
            "text-xs px-2 py-1 rounded-full font-medium shrink-0 ml-2",
            getScoreLabel(score).color
          )}>
            {getScoreLabel(score).text}
          </span>
        )}
      </div>

      {/* Score/Value */}
      <div className="flex items-end justify-between mb-4">
        <div>
          {error ? (
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">Error</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              {value !== undefined ? (
                <span className="text-4xl font-bold text-white">{value}</span>
              ) : score !== undefined && score !== null ? (
                <>
                  <span className="text-4xl font-bold text-white">{score}</span>
                  <span className="text-sm text-zinc-500">{suffix}</span>
                </>
              ) : (
                <span className="text-3xl font-bold text-zinc-600">--</span>
              )}
            </div>
          )}
          
          {/* Trend */}
          {trend !== undefined && !error && (
            <div className={cn(
              "flex items-center gap-1 mt-2 text-xs font-medium",
              trend >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{trend >= 0 ? '+' : ''}{trend.toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Mini Stats / Content */}
      <div className="mt-auto space-y-3">
        {subStats && subStats.length > 0 && !error && (
          <div className={cn(
            "grid gap-3 pt-3 border-t border-zinc-800/50",
            subStats.length === 1 ? "grid-cols-1" : "grid-cols-2"
          )}>
            {subStats.map((stat, i) => (
              <div key={i}>
                <div className="text-xs text-zinc-500 mb-1">{stat.label}</div>
                <div className="text-sm font-semibold text-zinc-100 truncate">{stat.value}</div>
              </div>
            ))}
          </div>
        )}
        {footer}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-300/70 mt-2 line-clamp-2">{error}</p>
      )}
    </div>
  )
}

interface ContentMetricsModuleProps {
  url: string
  sessionId?: string
  initialTab?: 'content-analysis' | 'intent-clusters' | 'entity-detection' | 'recommendations'
  /** When set, renders only this single section without the internal tab switcher. */
  section?: 'content-analysis' | 'intent-clusters' | 'entity-detection' | 'recommendations'
}

export default function ContentMetricsModule({ url, sessionId, initialTab, section }: ContentMetricsModuleProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const subtab = searchParams.get('subtab') || initialTab || 'content-analysis'
  const [activeTab, setActiveTab] = useState<'content-analysis' | 'intent-clusters' | 'entity-detection' | 'recommendations'>(
    section ? section :
    subtab === 'intent-clusters' ? 'intent-clusters' : 
    subtab === 'entity-detection' ? 'entity-detection' : 
    subtab === 'recommendations' ? 'recommendations' :
    'content-analysis'
  )
  
  // When section is set, always lock to that section
  useEffect(() => {
    if (section && activeTab !== section) {
      setActiveTab(section)
    }
  }, [section, activeTab])

  useEffect(() => {
    if (!section && !searchParams.get('subtab') && initialTab) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('subtab', initialTab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }, [searchParams, pathname, router, initialTab, section])
  
  // Update URL when tab changes
  const handleTabChange = (tab: 'content-analysis' | 'intent-clusters' | 'entity-detection') => {
    if (section) return // locked to a single section
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('subtab', tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  
  // Resolve latest job for this session
  const sessionIdStr = sessionId ? String(sessionId) : undefined
  const { data: jobsData } = useGetSessionJobsQuery(sessionIdStr!, {
    skip: !sessionIdStr,
  })
  const jobs = jobsData?.data || []
  const sortedJobs = [...jobs].sort((a: any, b: any) => {
    const aTime = new Date(a.createdAt || 0).getTime()
    const bTime = new Date(b.createdAt || 0).getTime()
    return bTime - aTime
  })

  // Resolve job that actually owns raw HTML in S3.
  // For normal sessions it's CRAWL; for Quick Start it's MODULE_E_QUICK_START.
  const getJobType = (j: any) => String(j?.jobType || j?.type || '').toUpperCase()
  const crawlJob = sortedJobs.find((j: any) => getJobType(j) === 'CRAWL')
  const quickStartJob = sortedJobs.find((j: any) => {
    const t = getJobType(j)
    return t === 'MODULE_E_QUICK_START' || t.includes('QUICK_START')
  })
  const htmlSourceJob = crawlJob || quickStartJob || null
  const latestJob = sortedJobs.length > 0 ? sortedJobs[0] : null

  // Always read/write content metrics against the HTML-source job when available.
  const jobId = (htmlSourceJob?.id || latestJob?.id) as string | undefined
  const sourceJobId = htmlSourceJob?.id as string | undefined

  const [hasTriggeredAnalysis, setHasTriggeredAnalysis] = useState(false)

  // Fetch content metrics from database for the latest job
  // Poll every 5s while waiting for analysis results after user triggers it
  const {
    data: contentMetricsData,
    isLoading: isLoadingMetrics,
    error: metricsError,
    refetch,
  } = useGetContentMetricsQuery(jobId || '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const [startContentMetrics, { isLoading: isStartingAnalysis }] = useStartContentMetricsMutation()

  // Extract metrics from response
  const metricsResult = contentMetricsData?.success ? contentMetricsData.data : null
  
  const contentMetrics = metricsResult?.content_metrics
  const entityMetrics = metricsResult?.entity_metrics
  const recommendations = metricsResult?.recommendations as RecommendationEnginePayload | undefined

  // Stop polling once data arrives
  useEffect(() => {
    if (hasTriggeredAnalysis && (contentMetrics || entityMetrics)) {
      setHasTriggeredAnalysis(false)
    }
  }, [hasTriggeredAnalysis, contentMetrics, entityMetrics])

  // Whether we're in a waiting state (analysis triggered, no data yet)
  const isWaitingForAnalysis = hasTriggeredAnalysis && !contentMetrics && !entityMetrics && !metricsError

  const handleStartAnalysis = async () => {
    if (!jobId) return
    try {
      setHasTriggeredAnalysis(true)
      await startContentMetrics({ jobId, sourceJobId }).unwrap()
    } catch (e) {
      // no-op: error will surface via metricsError on next fetch
    }
  }

  useEffect(() => {
    if (!jobId) return
    let timer: any
    if (isWaitingForAnalysis) {
      timer = setInterval(() => {
        refetch()
      }, 5000)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isWaitingForAnalysis, jobId, refetch])

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500'
    if (score >= 60) return 'text-yellow-500'
    if (score >= 40) return 'text-orange-500'
    return 'text-red-500'
  }

  const intentKeysInOrder: string[] = [
    'informational',
    'commercial',
    'comparative',
    'transactional',
    'agent'
  ]

  return (
    <div className="space-y-6 p-6">
      {/* Header Section with Tabs - hidden when locked to a single section */}
      {!section && (
        <div className="space-y-6">
          {/* Tab Navigation - Larger size */}
          <div className="flex flex-wrap items-center gap-2 border-zinc-800 bg-[#111113] p-1.5 rounded-xl border w-fit">
            <Button
              onClick={() => handleTabChange('content-analysis')}
              variant={activeTab === 'content-analysis' ? 'default' : 'ghost'}
              size="lg"
              className={cn(
                "text-base font-semibold px-6 py-3 rounded-lg transition-all cursor-pointer",
                activeTab === 'content-analysis' 
                  ? 'bg-primary text-primary-foreground shadow-lg' 
                  : 'hover:bg-muted'
              )}
            >
              Content Analysis Metrics
            </Button>
            <Button
              onClick={() => handleTabChange('intent-clusters')}
              variant={activeTab === 'intent-clusters' ? 'default' : 'ghost'}
              size="lg"
              className={cn(
                "text-base font-semibold px-6 py-3 rounded-lg transition-all cursor-pointer",
                activeTab === 'intent-clusters' 
                  ? 'bg-primary text-primary-foreground shadow-lg' 
                  : 'hover:bg-muted'
              )}
            >
              Prompt Intent Clusters
            </Button>
            <Button
              onClick={() => handleTabChange('entity-detection')}
              variant={activeTab === 'entity-detection' ? 'default' : 'ghost'}
              size="lg"
              className={cn(
                "text-base font-semibold px-6 py-3 rounded-lg transition-all cursor-pointer",
                activeTab === 'entity-detection' 
                  ? 'bg-primary text-primary-foreground shadow-lg' 
                  : 'hover:bg-muted'
              )}
            >
              Entity Detection Metrics
            </Button>
          </div>
        </div>
      )}

      {/* Content Analysis Metrics Tab */}
      {activeTab === 'content-analysis' && (
        <div className="rounded-xl border border-zinc-800 bg-[#111113] p-6 space-y-6">
          {/* Empty State + Trigger */}
          {!contentMetrics && !isLoadingMetrics && !metricsError && !isWaitingForAnalysis && !isStartingAnalysis && (
            <AnalysisEmptyState
              icon={<FileText className="w-8 h-8 text-zinc-600" />}
              title="No Content Metrics Data"
              description="No content metrics available yet. Run an analysis to see content insights."
              onRunAnalysis={jobId ? handleStartAnalysis : undefined}
              isAnalyzing={isStartingAnalysis}
              disabled={!jobId}
              buttonLabel="Run Content Metrics Analysis"
            />
          )}

          {/* Loading / Waiting State */}
          {(isLoadingMetrics || isWaitingForAnalysis || isStartingAnalysis) && !contentMetrics && (
            <div className="p-8 text-center border border-zinc-800 rounded-xl bg-[#0D0D10]">
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-sm text-zinc-400">
                {isStartingAnalysis ? 'Starting analysis...' : 'Running analysis — this may take a moment...'}
              </p>
            </div>
          )}

          {/* Error Display */}
          {metricsError && !contentMetrics && (
            <div className="p-4 border border-red-500/20 bg-red-500/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <p className="text-sm text-red-400">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {/* Content Analysis Results */}
          {contentMetrics && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Content Type Accuracy */}
              <ScoreCard
                title="Content Type Accuracy"
                description="How accurately the system identifies your content type"
                score={contentMetrics.content_type_accuracy || 0}
                icon={<MessageSquare className="w-5 h-5 text-blue-400" />}
                color="bg-blue-500/20"
                subStats={[
                  { label: 'Suggested Type', value: contentMetrics.suggested_content_type || 'Unknown' }
                ]}
                help={contentMetrics.metric_help ? {
                  meaning: contentMetrics.metric_help?.content_type_accuracy?.meaning,
                  improve: contentMetrics.metric_help?.content_type_accuracy?.improve,
                } : null}
              />

              {/* Prompt Intent Match */}
              <ScoreCard
                title="Prompt Intent Match"
                description="How well your content matches user search intent"
                score={contentMetrics.prompt_intent_match || 0}
                icon={<Brain className="w-5 h-5 text-blue-400" />}
                color="bg-blue-500/20"
                subStats={[
                  { 
                    label: 'Matched Intents', 
                    value: (
                      <div className="flex flex-wrap gap-1">
                        {contentMetrics.prompt_intent_details?.matched_intents && contentMetrics.prompt_intent_details.matched_intents.length > 0 ? (
                          contentMetrics.prompt_intent_details.matched_intents.slice(0, 3).map((intent: string, idx: number) => (
                            <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-800/50">{intent}</span>
                          ))
                        ) : (
                          <span className="text-xs text-zinc-500">No intents detected</span>
                        )}
                      </div>
                    )
                  },
                  { label: 'Confidence', value: `${contentMetrics.prompt_intent_details?.confidence ?? 0}%` }
                ]}
                help={contentMetrics.metric_help ? {
                  meaning: contentMetrics.metric_help?.prompt_intent_match?.meaning,
                  improve: contentMetrics.metric_help?.prompt_intent_match?.improve,
                } : null}
              />

              {/* Visibility Impact */}
              <ScoreCard
                title="Visibility Impact"
                description="Potential impact on search visibility and ranking"
                score={contentMetrics.visibility_impact || 0}
                icon={<Eye className="w-5 h-5 text-emerald-400" />}
                color="bg-emerald-500/20"
                subStats={[
                  { 
                    label: 'Key Factors', 
                    value: (
                      <div className="flex flex-wrap gap-1">
                        {contentMetrics.visibility_factors?.factors && contentMetrics.visibility_factors.factors.length > 0 ? (
                          contentMetrics.visibility_factors.factors.slice(0, 2).map((factor: string, idx: number) => (
                            <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-800/50 truncate max-w-25 inline-block">{factor}</span>
                          ))
                        ) : (
                          <span className="text-xs text-zinc-500">No factors</span>
                        )}
                      </div>
                    )
                  }
                ]}
                help={contentMetrics.metric_help ? {
                  meaning: contentMetrics.metric_help?.visibility_impact?.meaning,
                  improve: contentMetrics.metric_help?.visibility_impact?.improve,
                } : null}
              />
            </div>
          )}
        </div>
      )}

      {/* Prompt Intent Clusters Tab */}
      {activeTab === 'intent-clusters' && (
        <div className="rounded-xl border border-zinc-800 bg-[#111113] p-6 space-y-6">
          {/* Empty State */}
          {!contentMetrics && !isLoadingMetrics && !metricsError && !isWaitingForAnalysis && !isStartingAnalysis && (
            <AnalysisEmptyState
              icon={<Brain className="w-8 h-8 text-zinc-600" />}
              title="No Intent Cluster Data"
              description="No intent cluster data available yet. Run an analysis to see prompt intent analysis."
              onRunAnalysis={jobId ? handleStartAnalysis : undefined}
              isAnalyzing={isStartingAnalysis}
              disabled={!jobId}
              buttonLabel="Run Content Metrics Analysis"
            />
          )}

          {/* Loading / Waiting State */}
          {(isLoadingMetrics || isWaitingForAnalysis || isStartingAnalysis) && !contentMetrics && (
            <div className="p-8 text-center border border-zinc-800 rounded-xl bg-[#0D0D10]">
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-sm text-zinc-400">
                {isStartingAnalysis ? 'Starting analysis...' : 'Running analysis — this may take a moment...'}
              </p>
            </div>
          )}

          {/* Error Display */}
          {metricsError && !contentMetrics && (
            <div className="p-4 border border-red-500/20 bg-red-500/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <p className="text-sm text-red-400">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {/* Intent Clusters Results */}
          {contentMetrics?.prompt_intent_details?.cluster_metrics && contentMetrics.prompt_intent_details?.intent_clusters && (
            <div className="space-y-6">
              {/* Metrics Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="h-full">
                  <ScoreCard
                    title="Clustering Accuracy"
                    description="Precision of intent classification"
                    score={Math.round(100 * (contentMetrics.prompt_intent_details.cluster_metrics.clustering_accuracy ?? 0))}
                    value={`${Math.round(100 * (contentMetrics.prompt_intent_details.cluster_metrics.clustering_accuracy ?? 0))}%`}
                    icon={<Target className="w-5 h-5 text-green-400" />}
                    color="bg-green-500/20"
                    help={contentMetrics.metric_help ? {
                      meaning: contentMetrics.metric_help?.clustering_accuracy?.meaning,
                      improve: contentMetrics.metric_help?.clustering_accuracy?.improve,
                    } : null}
                  />
                </div>
                
                <div className="h-full">
                  <ScoreCard
                    title="Total Prompts"
                    description="Number of prompts analyzed"
                    value={contentMetrics.prompt_intent_details.cluster_metrics.total_prompts ?? 0}
                    icon={<List className="w-5 h-5 text-blue-400" />}
                    color="bg-blue-500/20"
                    help={contentMetrics.metric_help ? {
                      meaning: contentMetrics.metric_help?.total_prompts?.meaning,
                      improve: contentMetrics.metric_help?.total_prompts?.improve,
                    } : null}
                  />
                </div>
                
                <div className="h-full">
                  <ScoreCard
                    title="Categorized"
                    description="Prompts successfully mapped to intents"
                    score={contentMetrics.prompt_intent_details.cluster_metrics.coverage_percentage ?? 0}
                    value={`${contentMetrics.prompt_intent_details.cluster_metrics.coverage_percentage?.toFixed(1) ?? 0}%`}
                    icon={<Brain className="w-5 h-5 text-blue-400" />}
                    color="bg-blue-500/20"
                    help={contentMetrics.metric_help ? {
                      meaning: contentMetrics.metric_help?.coverage_percentage?.meaning,
                      improve: contentMetrics.metric_help?.coverage_percentage?.improve,
                    } : null}
                  />
                </div>
              </div>

              {/* Intent Distribution Table */}
              <div className="bg-[#111113] rounded-xl border border-zinc-800 overflow-hidden">
                <div className="bg-[#0D0D10] px-6 py-4 border-b border-zinc-800">
                  <h4 className="text-sm font-semibold text-white">Intent Cluster Distribution</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#0D0D10] border-b border-zinc-800">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Intent Cluster</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-400 uppercase tracking-wider">Number of Prompts</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-zinc-400 uppercase tracking-wider">% of Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {(() => {
                        const clusters: any = contentMetrics.prompt_intent_details?.intent_clusters || {}
                        const total: number = contentMetrics.prompt_intent_details?.cluster_metrics?.total_prompts ?? 0

                        const labelMap: Record<string, string> = {
                          informational: 'Informational',
                          commercial: 'Commercial',
                          comparative: 'Comparative',
                          transactional: 'Transactional',
                          agent: 'Agent-style'
                        }

                        const iconMap: Record<string, React.ReactNode> = {
                          informational: <BookOpen className="w-4 h-4 text-blue-400" />,
                          commercial: <ShoppingBag className="w-4 h-4 text-blue-400" />,
                          comparative: <Scale className="w-4 h-4 text-orange-400" />,
                          transactional: <CreditCard className="w-4 h-4 text-emerald-400" />,
                          agent: <Bot className="w-4 h-4 text-cyan-400" />
                        }

                        return (
                          <>
                            {intentKeysInOrder.map((key) => {
                              const cluster = clusters[key] || {}
                              const count: number = cluster.prompt_count ?? 0
                              const percent = total > 0 ? Math.round((count / total) * 100) : 0

                              return (
                                <tr key={key} className="hover:bg-[#0D0D10] transition-colors">
                                  <td className="px-6 py-4 text-sm text-zinc-100 flex items-center gap-3">
                                    <div className="p-1.5 rounded-lg bg-[#0D0D10]">
                                      {iconMap[key]}
                                    </div>
                                    {labelMap[key]}
                                  </td>
                                  <td className="px-6 py-4 text-center text-sm font-semibold text-zinc-100">{count}</td>
                                  <td className="px-6 py-4 text-center">
                                    <div className={cn(
                                      "inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                      percent >= 20 
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                        : "bg-zinc-800 text-zinc-400 border border-zinc-800"
                                    )}>
                                      {percent}%
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                            
                            {/* Other / Uncategorized row */}
                            {(() => {
                              const sumKnown = intentKeysInOrder.reduce((sum, key) => {
                                const c = clusters[key]
                                return sum + (c?.prompt_count ?? 0)
                              }, 0)
                              const otherCount = Math.max(total - sumKnown, 0)
                              const otherPercent = total > 0 ? Math.round((otherCount / total) * 100) : 0

                              return (
                                <tr className="bg-[#0D0D10]">
                                  <td className="px-6 py-4 text-sm text-zinc-400 flex items-center gap-3">
                                    <div className="p-1.5 rounded-lg bg-[#111113]">
                                      <HelpCircle className="w-4 h-4 text-zinc-500" />
                                    </div>
                                    Other / Uncategorized
                                  </td>
                                  <td className="px-6 py-4 text-center text-sm font-semibold text-zinc-400">{otherCount}</td>
                                  <td className="px-6 py-4 text-center">
                                    <div className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#111113] text-zinc-500 border border-zinc-800">
                                      {otherPercent}%
                                    </div>
                                  </td>
                                </tr>
                              )
                            })()}
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* No Data Message for Intent Clusters */}
          {contentMetrics && (!contentMetrics.prompt_intent_details?.cluster_metrics || !contentMetrics.prompt_intent_details?.intent_clusters) && (
            <div className="p-6 border border-zinc-800 rounded-xl bg-[#0D0D10] text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
              <p className="text-sm text-zinc-400">
                No intent cluster data available for this analysis.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Entity Detection Metrics Tab */}
      {activeTab === 'entity-detection' && (
        <div className="rounded-xl border border-zinc-800 bg-[#111113] p-6 space-y-6">
          {/* Empty State */}
          {!entityMetrics && !isLoadingMetrics && !metricsError && !isWaitingForAnalysis && !isStartingAnalysis && (
            <AnalysisEmptyState
              icon={<Database className="w-8 h-8 text-zinc-600" />}
              title="No Entity Detection Data"
              description="No entity detection data available yet. Run an analysis to see entity metrics."
              onRunAnalysis={jobId ? handleStartAnalysis : undefined}
              isAnalyzing={isStartingAnalysis}
              disabled={!jobId}
              buttonLabel="Run Content Metrics Analysis"
            />
          )}

          {/* Loading / Waiting State */}
          {(isLoadingMetrics || isWaitingForAnalysis || isStartingAnalysis) && !entityMetrics && (
            <div className="p-8 text-center border border-zinc-800 rounded-xl bg-[#0D0D10]">
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-sm text-zinc-400">
                {isStartingAnalysis ? 'Starting analysis...' : 'Running analysis — this may take a moment...'}
              </p>
            </div>
          )}

          {/* Error Display */}
          {metricsError && !entityMetrics && (
            <div className="p-4 border border-red-500/20 bg-red-500/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <p className="text-sm text-red-400">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {/* Entity Detection Results */}
          {entityMetrics && (
            <div className="space-y-6">
              {/* Main Entity Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Entities Detected */}
                <div className="h-full">
                  <ScoreCard
                    title="Entities Detected"
                    description="Number of required entities found in content"
                    value={entityMetrics.entities_detected_count || 0}
                    icon={<Database className="w-5 h-5 text-blue-400" />}
                    color="bg-blue-500/20"
                    help={contentMetrics?.metric_help?.entities_detected_count ?? null}
                  />
                </div>

                {/* Coverage Score */}
                <div className="h-full">
                  <ScoreCard
                    title="Coverage Score"
                    description="Percentage of required entities included"
                    score={entityMetrics.entity_coverage_score || 0}
                    value={`${entityMetrics.entity_coverage_score || 0}%`}
                    icon={<BarChart className="w-5 h-5 text-emerald-400" />}
                    color="bg-emerald-500/20"
                    help={contentMetrics?.metric_help?.entity_coverage_score ?? null}
                  />
                </div>

                {/* Entity Relevance */}
                <div className="h-full">
                  <ScoreCard
                    title="Entity Relevance"
                    description="How relevant entities are to search intent"
                    score={entityMetrics.entity_relevance_score || 0}
                    icon={<Target className="w-5 h-5 text-blue-400" />}
                    color="bg-blue-500/20"
                    help={contentMetrics?.metric_help?.entity_relevance_score ?? null}
                  />
                </div>
              </div>

              {/* Entity Details */}
              {((entityMetrics.entity_relevance_details?.relevant_entities && entityMetrics.entity_relevance_details.relevant_entities.length > 0) ||
                (entityMetrics.entity_relevance_details?.irrelevant_entities && entityMetrics.entity_relevance_details.irrelevant_entities.length > 0)) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {entityMetrics.entity_relevance_details?.relevant_entities && entityMetrics.entity_relevance_details.relevant_entities.length > 0 && (
                    <div className="bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-5">
                      <h4 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                        <span>✅</span>
                        Relevant Entities
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {entityMetrics.entity_relevance_details.relevant_entities.map((entity: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="border-green-500/50 text-green-300">
                            {entity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {entityMetrics.entity_relevance_details?.irrelevant_entities && entityMetrics.entity_relevance_details.irrelevant_entities.length > 0 && (
                    <div className="bg-amber-500/5 rounded-xl border border-amber-500/20 p-5">
                      <h4 className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
                        <span>⚠️</span>
                        Irrelevant Entities
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {entityMetrics.entity_relevance_details.irrelevant_entities.map((entity: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="border-amber-500/50 text-amber-300">
                            {entity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Additional Details Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
                {/* Top Search Queries */}
                {contentMetrics?.prompt_intent_details?.search_queries && contentMetrics.prompt_intent_details.search_queries.length > 0 && (
                  <div className="bg-[#111113] rounded-xl border border-zinc-800 p-5">
                    <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-blue-500/20">
                        <Search className="w-4 h-4 text-blue-400" />
                      </div>
                      Top Search Queries
                    </h4>
                    <div className="space-y-2">
                      {contentMetrics.prompt_intent_details.search_queries.map((query: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 p-2 rounded-lg hover:bg-[#0D0D10] transition-colors">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span className="text-sm text-zinc-100">"{query}"</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visibility Score Breakdown */}
                {contentMetrics?.visibility_factors?.score_breakdown && 
                 Object.keys(contentMetrics.visibility_factors.score_breakdown).length > 0 && (
                  <div className="bg-[#111113] rounded-xl border border-zinc-800 p-5">
                    <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/20">
                        <BarChart className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span className="flex items-center gap-2">
                        Visibility Score Breakdown
                        {contentMetrics?.metric_help?.visibility_score_breakdown?.meaning &&
                          contentMetrics?.metric_help?.visibility_score_breakdown?.improve && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="text-white/35 hover:text-white/70 transition-colors"
                                  aria-label="Visibility score breakdown help"
                                >
                                  <HelpCircle className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                align="start"
                                className="max-w-64 bg-zinc-800 border border-zinc-700/60 text-zinc-100 text-[11px] leading-relaxed rounded-2xl px-3 py-2.5"
                              >
                                <div className="space-y-1.5">
                                  <div>
                                    <span className="font-semibold">Meaning: </span>
                                    {contentMetrics.metric_help.visibility_score_breakdown.meaning}
                                  </div>
                                  <div>
                                    <span className="font-semibold">Improve: </span>
                                    {contentMetrics.metric_help.visibility_score_breakdown.improve}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                      </span>
                    </h4>
                    <div className="space-y-3">
                      {Object.entries(contentMetrics.visibility_factors.score_breakdown).map(([factor, score]) => (
                        <div key={factor} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-400 capitalize flex items-center gap-1.5">
                              {factor.replace(/_/g, ' ')}
                              {contentMetrics?.metric_help?.[factor]?.meaning && contentMetrics?.metric_help?.[factor]?.improve && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="text-white/35 hover:text-white/70 transition-colors"
                                      aria-label={`${factor.replace(/_/g, ' ')} help`}
                                    >
                                      <HelpCircle className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    align="start"
                                    className="max-w-64 bg-zinc-800 border border-zinc-700/60 text-zinc-100 text-[11px] leading-relaxed rounded-2xl px-3 py-2.5"
                                  >
                                    <div className="space-y-1.5">
                                      <div>
                                        <span className="font-semibold">Meaning: </span>
                                        {contentMetrics.metric_help[factor].meaning}
                                      </div>
                                      <div>
                                        <span className="font-semibold">Improve: </span>
                                        {contentMetrics.metric_help[factor].improve}
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </span>
                            <span className={`font-semibold ${getScoreColor(score as number)}`}>{score as number}</span>
                          </div>
                          <div className="h-2 bg-[#0D0D10] rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all duration-300"
                              style={{
                                width: `${score}%`,
                                backgroundColor: (score as number) >= 80 ? '#10B981' : 
                                                (score as number) >= 60 ? '#F59E0B' : 
                                                (score as number) >= 40 ? '#EF4444' : 
                                                '#6B7280'
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendations Tab (Prompt Intelligence) */}
      {activeTab === 'recommendations' && (
        <div className="rounded-xl border border-zinc-800 bg-[#111113] p-6 space-y-6">
          {!recommendations && !isLoadingMetrics && !metricsError && !isWaitingForAnalysis && !isStartingAnalysis && (
            <AnalysisEmptyState
              icon={<Zap className="w-8 h-8 text-zinc-600" />}
              title="No Recommendation Data"
              description="No recommendation cards available yet. Run a content metrics analysis to generate prioritized actions."
              onRunAnalysis={jobId ? handleStartAnalysis : undefined}
              isAnalyzing={isStartingAnalysis}
              disabled={!jobId}
              buttonLabel="Run Content Metrics Analysis"
            />
          )}

          {(isLoadingMetrics || isWaitingForAnalysis || isStartingAnalysis) && !recommendations && (
            <div className="p-8 text-center border border-zinc-800 rounded-xl bg-[#0D0D10]">
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-sm text-zinc-400">
                {isStartingAnalysis ? 'Starting analysis...' : 'Running analysis — this may take a moment...'}
              </p>
            </div>
          )}

          {metricsError && !recommendations && (
            <div className="p-4 border border-red-500/20 bg-red-500/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <p className="text-sm text-red-400">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {recommendations && (
            <RecommendationEnginePanel
              data={recommendations}
              isLoading={isLoadingMetrics || isStartingAnalysis}
            />
          )}
        </div>
      )}
    </div>
  )
}
