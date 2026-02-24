'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Brain, Rocket, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { 
  useRunModuleCAnalysisMutation, 
  useGetModuleCResultQuery,
  useGetSessionModuleCResultsQuery,
} from '@/store/api/module_C/moduleCApi'
import { useGetJobStatusQuery } from '@/store/api/jobApi'

interface AIIntelligenceModuleProps {
  url: string
  sessionId?: string | number
  jobId?: string | null
}

export default function AIIntelligenceModule({ url, sessionId, jobId }: AIIntelligenceModuleProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  // Initialize audit mode from URL query params with default fallback
  const subtab = searchParams.get('subtab') || 'aeo'
  const [auditMode, setAuditMode] = useState<'single' | 'bulk'>(subtab === 'bulk' ? 'bulk' : 'single')
  const [sitemapUrl, setSitemapUrl] = useState('')
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null)
  
  // Ensure URL always has subtab parameter
  useEffect(() => {
    if (!searchParams.get('subtab')) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('subtab', 'aeo')
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }, [searchParams, pathname, router])
  
  // Update URL when audit mode changes
  const handleAuditModeChange = (mode: 'single' | 'bulk') => {
    setAuditMode(mode)
    const params = new URLSearchParams(searchParams.toString())
    params.set('subtab', mode === 'bulk' ? 'bulk' : 'aeo')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  
  // RTK Query mutations and queries
  const [runModuleCAnalysis, { isLoading: isRunning }] = useRunModuleCAnalysisMutation()
  
  // Fetch existing AEO results from database
  const { 
    data: existingAeoData, 
    isLoading: isLoadingExisting, 
    refetch: refetchAeoResults 
  } = useGetModuleCResultQuery(jobId || '', { 
    skip: !jobId || auditMode !== 'single',
    refetchOnMountOrArgChange: true
  })

  // Poll for analysis job status when we have an analysisJobId
  const { 
    data: analysisJobData,
    isLoading: isLoadingAnalysisJob 
  } = useGetJobStatusQuery(analysisJobId || '', {
    skip: !analysisJobId,
    pollingInterval: analysisJobId ? 2000 : 0, // Poll every 2 seconds while job is running
  })

  // Check if analysis job is complete and refetch results
  useEffect(() => {
    if (analysisJobData?.status === 'COMPLETED') {
      setAnalysisJobId(null) // Stop polling
      refetchAeoResults() // Refresh the results
    } else if (analysisJobData?.status === 'FAILED') {
      setAnalysisJobId(null) // Stop polling
    }
  }, [analysisJobData, refetchAeoResults])

  // Debug: Log the AEO response data
  useEffect(() => {
    if (existingAeoData) {
      console.log('📊 Module C AEO Response:', existingAeoData)
      console.log('📊 AEO Result Data:', existingAeoData?.data)
      console.log('📊 AEO Modules:', existingAeoData?.data?.modules)
    }
  }, [existingAeoData])

  // Auto-populate sitemap URL when switching to bulk mode
  useEffect(() => {
    if (auditMode === 'bulk' && url && !sitemapUrl) {
      const trimmedUrl = url.trim()
      if (trimmedUrl) {
        const baseUrl = trimmedUrl.endsWith('/') ? trimmedUrl.slice(0, -1) : trimmedUrl
        setSitemapUrl(`${baseUrl}/sitemap.xml`)
      }
    }
  }, [auditMode, url, sitemapUrl])

  const websiteUrl = (url || '').trim()
  
  const handleSingleAnalyze = useCallback(async () => {
    if (!websiteUrl || !jobId) return
    
    try {
      const result = await runModuleCAnalysis({ jobId, url: websiteUrl }).unwrap()
      if (result.data?.analysisJobId) {
        setAnalysisJobId(result.data.analysisJobId)
      }
    } catch (error) {
      console.error('Failed to start Module C analysis:', error)
    }
  }, [websiteUrl, jobId, runModuleCAnalysis])

  const handleBulkAnalyze = () => {
    // TODO: Implement bulk analysis
    const cleanedUrl = sitemapUrl.trim()
    if (!cleanedUrl) return
    console.log('Bulk analysis not yet implemented')
  }

  // Determine loading state
  const isAnalyzing = isRunning || !!analysisJobId
  const isLoadingSingleData = isAnalyzing || isLoadingExisting
  
  // Extract results from the API response
  const aeoResult = existingAeoData?.data || null
  const hasExistingData = !!aeoResult
  
  // Extract metrics from result
  const overallScore = aeoResult?.overall_score || 0
  const modules = aeoResult?.modules || {}
  
  // Extract individual module scores
  const aiPresenceScore = modules.ai_presence?.score || 0
  const answerabilityScore = modules.answerability?.score || 0
  const knowledgeBaseScore = modules.knowledge_base?.score || 0
  const llmConsistencyScore = modules.llm_simulator?.cross_model_metrics?.consistency_score || 0

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500'
    if (score >= 50) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getScoreBg = (score: number) => {
    if (score >= 70) return 'bg-green-500/20 border-green-500/30'
    if (score >= 50) return 'bg-yellow-500/20 border-yellow-500/30'
    return 'bg-red-500/20 border-red-500/30'
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header Section with Tabs */}
      <div className="space-y-6">
        {/* Mode Tabs */}
        <div className="flex items-center gap-2 border-white/10 bg-white/5 backdrop-blur-xl p-2 rounded-lg border w-fit">
          <Button
            onClick={() => handleAuditModeChange('single')}
            variant={auditMode === 'single' ? 'default' : 'ghost'}
            size="lg"
            className={cn(
              "text-base font-semibold px-8 py-3 rounded-lg transition-all cursor-pointer",
              auditMode === 'single' 
                ? 'bg-primary text-primary-foreground shadow-lg' 
                : 'hover:bg-muted'
            )}
          >
            AEO Analysis
          </Button>
          <Button
            onClick={() => handleAuditModeChange('bulk')}
            variant={auditMode === 'bulk' ? 'default' : 'ghost'}
            size="lg"
            className={cn(
              "text-base font-semibold px-8 py-3 rounded-lg transition-all cursor-pointer",
              auditMode === 'bulk' 
                ? 'bg-primary text-primary-foreground shadow-lg' 
                : 'hover:bg-muted'
            )}
          >
            Bulk Audit
          </Button>
        </div>
      </div>

      {/* Single Mode */}
      {auditMode === 'single' && (
        <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-xl p-6 space-y-6">
          {/* No Job ID Warning */}
          {!jobId && (
            <div className="p-4 border border-yellow-500/50 bg-yellow-500/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-500" />
                <p className="text-sm text-yellow-500">
                  Please run a crawl first to enable AEO analysis.
                </p>
              </div>
            </div>
          )}

          {/* Empty State - Show only when no data is available */}
          {jobId && !hasExistingData && !isLoadingSingleData && (
            <div className="p-6 border border-border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-4">
                Click Run Analysis to check how easily AI models can understand, trust, and use your content.
              </p>
              <Button
                onClick={handleSingleAnalyze}
                disabled={!websiteUrl || isAnalyzing}
                size="lg"
                className="w-full sm:w-auto px-8 cursor-pointer"
              >
                <Rocket className="w-5 h-5 mr-2" />
                Run AEO Analysis
              </Button>
            </div>
          )}

          {/* Loading State */}
          {isLoadingSingleData && (
            <div className="p-8 text-center border border-border rounded-lg bg-muted/50">
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                {isLoadingExisting ? 'Loading existing analysis...' : 
                 analysisJobId ? 'Running AEO analysis... This may take a few minutes.' : 
                 'Starting analysis...'}
              </p>
              {analysisJobData?.status && (
                <Badge variant="outline" className="mt-2">
                  Status: {analysisJobData.status}
                </Badge>
              )}
            </div>
          )}

          {/* Results Display */}
          {hasExistingData && !isLoadingSingleData && (
            <div className="space-y-4">
              {/* Show badge if displaying existing data */}
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Analysis completed • {aeoResult?.timestamp ? new Date(aeoResult.timestamp).toLocaleString() : 'Unknown'}
                </Badge>
                <Button
                  onClick={handleSingleAnalyze}
                  disabled={!websiteUrl || isAnalyzing}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Re-analyzing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Run New Analysis
                    </>
                  )}
                </Button>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Main Score Card */}
                <div className="border border-border rounded-lg p-6 bg-muted/30">
                  <h4 className="text-sm font-medium text-muted-foreground mb-4 text-center">
                    Overall AEO Score
                  </h4>
                  <div className="flex items-center justify-center mb-4">
                    <div className={`text-6xl font-bold ${getScoreColor(overallScore)}`}>
                      {Math.round(overallScore)}
                    </div>
                  </div>
                  <p className="text-xs text-center text-muted-foreground leading-relaxed">
                    <strong>AEO Analysis:</strong> How well your content is optimized for AI answer engines.
                  </p>
                </div>

                {/* Module Scores List */}
                <div className="space-y-3">
                  {/* AI Presence Score */}
                  <div className="border border-border rounded-lg p-4 bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        🤖 AI Presence
                      </span>
                      <span className={`text-lg font-bold ${getScoreColor(aiPresenceScore)}`}>
                        {Math.round(aiPresenceScore)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          aiPresenceScore > 70 ? 'bg-green-500' : aiPresenceScore > 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${aiPresenceScore}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      How visible your content is to AI systems.
                    </p>
                  </div>

                  {/* Answerability Score */}
                  <div className="border border-border rounded-lg p-4 bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        💬 Answerability
                      </span>
                      <span className={`text-lg font-bold ${getScoreColor(answerabilityScore)}`}>
                        {Math.round(answerabilityScore)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          answerabilityScore > 70 ? 'bg-green-500' : answerabilityScore > 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${answerabilityScore}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      How well your content answers user queries.
                    </p>
                  </div>

                  {/* Knowledge Base Score */}
                  <div className="border border-border rounded-lg p-4 bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        📚 Knowledge Base
                      </span>
                      <span className={`text-lg font-bold ${getScoreColor(knowledgeBaseScore)}`}>
                        {Math.round(knowledgeBaseScore)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          knowledgeBaseScore > 70 ? 'bg-green-500' : knowledgeBaseScore > 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${knowledgeBaseScore}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Structured data and knowledge graph readiness.
                    </p>
                  </div>

                  {/* LLM Consistency Score */}
                  <div className="border border-border rounded-lg p-4 bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        🔄 LLM Consistency
                      </span>
                      <span className={`text-lg font-bold ${getScoreColor(llmConsistencyScore)}`}>
                        {Math.round(llmConsistencyScore)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          llmConsistencyScore > 70 ? 'bg-green-500' : llmConsistencyScore > 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${llmConsistencyScore}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Consistency across different LLM responses.
                    </p>
                  </div>
                </div>
              </div>

              {/* Detailed Modules Section */}
              {modules.actionable_insights && (
                <div className="mt-6 border border-border rounded-lg p-4 bg-background">
                  <h4 className="text-sm font-semibold text-foreground mb-3">
                    📋 Actionable Insights
                  </h4>
                  <div className="text-sm text-muted-foreground">
                    {typeof modules.actionable_insights === 'object' && modules.actionable_insights !== null ? (
                      <pre className="whitespace-pre-wrap text-xs">
                        {JSON.stringify(modules.actionable_insights, null, 2)}
                      </pre>
                    ) : (
                      <p>No actionable insights available.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bulk Mode */}
      {auditMode === 'bulk' && (
        <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-xl p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="text"
                placeholder="Enter Sitemap URL (e.g. https://example.com/sitemap.xml)"
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                className="flex-1 bg-background border border-white/30 h-12 text-base focus:border-primary"
              />
              <Button
                onClick={handleBulkAnalyze}
                disabled={!sitemapUrl.trim()}
                size="lg"
                className="shrink-0 px-8 cursor-pointer"
              >
                <Rocket className="w-5 h-5 mr-2" />
                Run Bulk Audit
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter a sitemap URL to analyze multiple pages at once. This feature is coming soon.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
