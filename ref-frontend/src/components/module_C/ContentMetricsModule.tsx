'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetContentMetricsQuery, useStartContentMetricsMutation } from '@/store/api/contentMetricsApi'
import { useGetSessionJobsQuery } from '@/store/api/jobApi'

interface ContentMetricsModuleProps {
  url: string
  sessionId?: string
  initialTab?: 'content-analysis' | 'intent-clusters' | 'entity-detection'
}

export default function ContentMetricsModule({ url, sessionId, initialTab }: ContentMetricsModuleProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const subtab = searchParams.get('subtab') || initialTab || 'content-analysis'
  const [activeTab, setActiveTab] = useState<'content-analysis' | 'intent-clusters' | 'entity-detection'>(
    subtab === 'intent-clusters' ? 'intent-clusters' : 
    subtab === 'entity-detection' ? 'entity-detection' : 
    'content-analysis'
  )
  
  useEffect(() => {
    if (!searchParams.get('subtab') && initialTab) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('subtab', initialTab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }, [searchParams, pathname, router, initialTab])
  
  // Update URL when tab changes
  const handleTabChange = (tab: 'content-analysis' | 'intent-clusters' | 'entity-detection') => {
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
  const latestJob = jobs.length > 0 ? jobs[0] : null
  const jobId = latestJob?.id as string | undefined

  const [hasTriggeredAnalysis, setHasTriggeredAnalysis] = useState(false)

  // Fetch content metrics from database for the latest job
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
    'agent_style'
  ]

  return (
    <div className="space-y-6 p-6">
      {/* Header Section with Tabs */}
      <div className="space-y-6">
        {/* Tab Navigation - Larger size */}
        <div className="flex flex-wrap items-center gap-2 border-white/20 bg-white/10 backdrop-blur-xl p-2 rounded-lg border w-fit">
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

      {/* Content Analysis Metrics Tab */}
      {activeTab === 'content-analysis' && (
        <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl p-6 space-y-6">
          {/* Empty State + Trigger */}
          {!contentMetrics && !isLoadingMetrics && !metricsError && (
            <div className="p-6 border border-border rounded-lg bg-muted/50 space-y-4">
              <p className="text-sm text-muted-foreground">
                No content metrics available yet. Run an AEO analysis to see content insights.
              </p>
              {jobId && (
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    disabled={isStartingAnalysis}
                    onClick={async () => {
                      try {
                        setHasTriggeredAnalysis(true)
                        await startContentMetrics({ jobId }).unwrap()
                        setTimeout(() => {
                          refetch()
                        }, 5000)
                      } catch (e) {
                        // no-op: error will surface via metricsError on next fetch
                      }
                    }}
                    className="cursor-pointer"
                  >
                    {isStartingAnalysis ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Starting analysis...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Run Content Metrics Analysis
                      </>
                    )}
                  </Button>
                  {(isStartingAnalysis || (hasTriggeredAnalysis && isLoadingMetrics)) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Running analysis and loading metrics...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading State */}
          {isLoadingMetrics && (
            <div className="p-8 text-center border border-border rounded-lg bg-muted/50">
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Loading content metrics...</p>
            </div>
          )}

          {/* Error Display */}
          {metricsError && !contentMetrics && (
            <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm text-destructive">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {/* Content Analysis Results */}
          {contentMetrics && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Content Type Accuracy */}
              <div className="border border-border rounded-lg p-6 bg-muted/30">
                <div className="flex items-start gap-3 mb-4">
                  <div className="text-3xl">📄</div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground mb-1">Content Type Accuracy</h4>
                    <p className="text-xs text-muted-foreground">How accurately the system identifies your content type</p>
                  </div>
                </div>
                <div className="flex items-center justify-center mb-4">
                  <div className={`text-5xl font-bold ${getScoreColor(contentMetrics.content_type_accuracy || 0)}`}>
                    {contentMetrics.content_type_accuracy || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Suggested Type:</div>
                  <Badge variant="outline" className="text-xs font-medium">
                    {contentMetrics.suggested_content_type || 'Unknown'}
                  </Badge>
                </div>
              </div>

              {/* Prompt Intent Match */}
              <div className="border border-border rounded-lg p-6 bg-muted/30">
                <div className="flex items-start gap-3 mb-4">
                  <div className="text-3xl">🎯</div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground mb-1">Prompt Intent Match</h4>
                    <p className="text-xs text-muted-foreground">How well your content matches user search intent</p>
                  </div>
                </div>
                <div className="flex items-center justify-center mb-4">
                  <div className={`text-5xl font-bold ${getScoreColor(contentMetrics.prompt_intent_match || 0)}`}>
                    {contentMetrics.prompt_intent_match || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-2">Matched Intents:</div>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {contentMetrics.prompt_intent_details?.matched_intents && contentMetrics.prompt_intent_details.matched_intents.length > 0 ? (
                      contentMetrics.prompt_intent_details.matched_intents.map((intent: string, idx: number) => (
                        <Badge key={idx} variant="secondary" className="text-xs">{intent}</Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No intents detected</span>
                    )}
                  </div>
                  {contentMetrics.prompt_intent_details?.confidence !== undefined && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Confidence: {contentMetrics.prompt_intent_details.confidence}%
                    </div>
                  )}
                </div>
              </div>

              {/* Visibility Impact */}
              <div className="border border-border rounded-lg p-6 bg-muted/30">
                <div className="flex items-start gap-3 mb-4">
                  <div className="text-3xl">📈</div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground mb-1">Visibility Impact</h4>
                    <p className="text-xs text-muted-foreground">Potential impact on search visibility and ranking</p>
                  </div>
                </div>
                <div className="flex items-center justify-center mb-4">
                  <div className={`text-5xl font-bold ${getScoreColor(contentMetrics.visibility_impact || 0)}`}>
                    {contentMetrics.visibility_impact || 0}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-2">Key Factors:</div>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {contentMetrics.visibility_factors?.factors && contentMetrics.visibility_factors.factors.length > 0 ? (
                      contentMetrics.visibility_factors.factors.map((factor: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-xs">{factor}</Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No factors identified</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prompt Intent Clusters Tab */}
      {activeTab === 'intent-clusters' && (
        <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl p-6 space-y-6">
          {/* Empty State */}
          {!contentMetrics && !isLoadingMetrics && !metricsError && (
            <div className="p-6 border border-border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-4">
                No intent cluster data available yet. Run an AEO analysis to see prompt intent analysis.
              </p>
            </div>
          )}

          {/* Loading State */}
          {isLoadingMetrics && (
            <div className="p-8 text-center border border-border rounded-lg bg-muted/50">
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Loading intent clusters...</p>
            </div>
          )}

          {/* Error Display */}
          {metricsError && !contentMetrics && (
            <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm text-destructive">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {/* Intent Clusters Results */}
          {contentMetrics?.prompt_intent_details?.cluster_metrics && contentMetrics.prompt_intent_details?.intent_clusters && (
            <div className="space-y-6">
              {/* Metrics Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="border border-green-500/30 rounded-lg p-4 bg-green-500/10">
                  <div className="text-xs text-green-300 mb-1">Accuracy of Clustering</div>
                  <div className="text-3xl font-bold text-green-400">
                    {Math.round(100 * (contentMetrics.prompt_intent_details.cluster_metrics.clustering_accuracy ?? 0))}%
                  </div>
                </div>
                
                <div className="border border-blue-500/30 rounded-lg p-4 bg-blue-500/10">
                  <div className="text-xs text-blue-300 mb-1">Total Prompts Analyzed</div>
                  <div className="text-3xl font-bold text-blue-400">
                    {contentMetrics.prompt_intent_details.cluster_metrics.total_prompts ?? 0}
                  </div>
                </div>
                
                <div className="border border-purple-500/30 rounded-lg p-4 bg-purple-500/10">
                  <div className="text-xs text-purple-300 mb-1">% Successfully Categorized</div>
                  <div className="text-3xl font-bold text-purple-400">
                    {contentMetrics.prompt_intent_details.cluster_metrics.coverage_percentage?.toFixed(1) ?? 0}%
                  </div>
                </div>
              </div>

              {/* Intent Distribution Table */}
              <div className="border border-border rounded-lg overflow-hidden bg-background">
                <div className="bg-muted px-4 py-3">
                  <h4 className="text-sm font-semibold text-foreground">Intent Cluster Distribution</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Intent Cluster</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Number of Prompts</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">% of Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(() => {
                        const clusters: any = contentMetrics.prompt_intent_details?.intent_clusters || {}
                        const total: number = contentMetrics.prompt_intent_details?.cluster_metrics?.total_prompts ?? 0

                        const labelMap: Record<string, string> = {
                          informational: 'Informational',
                          commercial: 'Commercial',
                          comparative: 'Comparative',
                          transactional: 'Transactional',
                          agent_style: 'Agent-style'
                        }

                        const iconMap: Record<string, string> = {
                          informational: '📚',
                          commercial: '🛍️',
                          comparative: '⚖️',
                          transactional: '💳',
                          agent_style: '🤖'
                        }

                        return (
                          <>
                            {intentKeysInOrder.map((key) => {
                              const cluster = clusters[key] || {}
                              const count: number = cluster.prompt_count ?? 0
                              const percent = total > 0 ? Math.round((count / total) * 100) : 0

                              return (
                                <tr key={key} className="hover:bg-muted/50 transition-colors">
                                  <td className="px-4 py-3 text-sm text-foreground">
                                    <span className="mr-2">{iconMap[key]}</span>
                                    {labelMap[key]}
                                  </td>
                                  <td className="px-4 py-3 text-center text-sm font-semibold text-foreground">{count}</td>
                                  <td className="px-4 py-3 text-center">
                                    <Badge variant={percent >= 20 ? 'default' : 'secondary'} className="font-semibold">
                                      {percent}%
                                    </Badge>
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
                                <tr className="bg-muted/30">
                                  <td className="px-4 py-3 text-sm text-muted-foreground">
                                    <span className="mr-2">❓</span>
                                    Other / Uncategorized
                                  </td>
                                  <td className="px-4 py-3 text-center text-sm font-semibold text-muted-foreground">{otherCount}</td>
                                  <td className="px-4 py-3 text-center">
                                    <Badge variant="outline" className="font-semibold">{otherPercent}%</Badge>
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
            <div className="p-6 border border-border rounded-lg bg-muted/50 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No intent cluster data available for this analysis.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Entity Detection Metrics Tab */}
      {activeTab === 'entity-detection' && (
        <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl p-6 space-y-6">
          {/* Empty State */}
          {!entityMetrics && !isLoadingMetrics && !metricsError && (
            <div className="p-6 border border-border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-4">
                No entity detection data available yet. Run an AEO analysis to see entity metrics.
              </p>
            </div>
          )}

          {/* Loading State */}
          {isLoadingMetrics && (
            <div className="p-8 text-center border border-border rounded-lg bg-muted/50">
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Loading entity metrics...</p>
            </div>
          )}

          {/* Error Display */}
          {metricsError && !entityMetrics && (
            <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm text-destructive">
                  {((metricsError as any)?.data?.error ?? (metricsError as any)?.message ?? 'Failed to load metrics')}
                </p>
              </div>
            </div>
          )}

          {/* Entity Detection Results */}
          {entityMetrics && (
            <div className="space-y-6">
              {/* Main Entity Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Entities Detected */}
                <div className="border border-border rounded-lg p-6 bg-muted/30 text-center">
                  <div className="text-3xl mb-2">🔢</div>
                  <div className="text-4xl font-bold text-foreground mb-2">
                    {entityMetrics.entities_detected_count || 0}
                  </div>
                  <div className="text-sm font-medium text-foreground mb-1">Entities Detected</div>
                  <div className="text-xs text-muted-foreground">Number of required entities found in content</div>
                </div>

                {/* Coverage Score */}
                <div className="border border-border rounded-lg p-6 bg-muted/30 text-center">
                  <div className="text-3xl mb-2">📊</div>
                  <div className={`text-4xl font-bold mb-2 ${getScoreColor(entityMetrics.entity_coverage_score || 0)}`}>
                    {entityMetrics.entity_coverage_score || 0}%
                  </div>
                  <div className="text-sm font-medium text-foreground mb-1">Coverage Score</div>
                  <div className="text-xs text-muted-foreground">Percentage of required entities included</div>
                </div>

                {/* Entity Relevance */}
                <div className="border border-border rounded-lg p-6 bg-muted/30 text-center">
                  <div className="text-3xl mb-2">🎯</div>
                  <div className={`text-4xl font-bold mb-2 ${getScoreColor(entityMetrics.entity_relevance_score || 0)}`}>
                    {entityMetrics.entity_relevance_score || 0}
                  </div>
                  <div className="text-sm font-medium text-foreground mb-1">Entity Relevance</div>
                  <div className="text-xs text-muted-foreground">How relevant entities are to search intent</div>
                </div>
              </div>

              {/* Entity Details */}
              {((entityMetrics.entity_relevance_details?.relevant_entities && entityMetrics.entity_relevance_details.relevant_entities.length > 0) ||
                (entityMetrics.entity_relevance_details?.irrelevant_entities && entityMetrics.entity_relevance_details.irrelevant_entities.length > 0)) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {entityMetrics.entity_relevance_details?.relevant_entities && entityMetrics.entity_relevance_details.relevant_entities.length > 0 && (
                    <div className="border border-green-500/30 rounded-lg p-4 bg-green-500/10">
                      <h4 className="text-sm font-semibold text-green-300 mb-3 flex items-center gap-2">
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
                    <div className="border border-amber-500/30 rounded-lg p-4 bg-amber-500/10">
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
                  <div className="border border-border rounded-lg p-4 bg-muted/30">
                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <span className="text-lg">🔍</span>
                      Top Search Queries
                    </h4>
                    <div className="space-y-2">
                      {contentMetrics.prompt_intent_details.search_queries.map((query: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 transition-colors">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span className="text-sm text-foreground">"{query}"</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visibility Score Breakdown */}
                {contentMetrics?.visibility_factors?.score_breakdown && 
                 Object.keys(contentMetrics.visibility_factors.score_breakdown).length > 0 && (
                  <div className="border border-border rounded-lg p-4 bg-muted/30">
                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <span className="text-lg">📊</span>
                      Visibility Score Breakdown
                    </h4>
                    <div className="space-y-3">
                      {Object.entries(contentMetrics.visibility_factors.score_breakdown).map(([factor, score]) => (
                        <div key={factor} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground capitalize">{factor.replace(/_/g, ' ')}</span>
                            <span className={`font-semibold ${getScoreColor(score as number)}`}>{score as number}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
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
    </div>
  )
}
