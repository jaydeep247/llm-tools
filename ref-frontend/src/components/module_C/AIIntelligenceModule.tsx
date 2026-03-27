'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Brain, Rocket, CheckCircle, AlertCircle, BarChart3, GitCompare, Zap, Eye } from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { 
  useGetModuleCResultQuery,
  useGetSessionModuleCResultsQuery,
} from '@/store/api/module_C/moduleCApi'
import { useModuleCAnalysis } from '@/hooks/useModuleCAnalysis'
import ModuleCProgressLoader from './ModuleCProgressLoader'
import AIVisibilityScorecards from './AIVisibilityScorecards'
import EntityGapAnalysis from './EntityGapAnalysis'
import AIAnswerPreview from './AIAnswerPreview'
import ModelComparison from './ModelComparison'
import ImprovementActions from './ImprovementActions'

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
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'entities' | 'answers' | 'models' | 'actions'>('overview')
  
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
  
  // Fetch existing AEO results from database
  const { 
    data: existingAeoData, 
    isLoading: isLoadingExisting, 
    refetch: refetchAeoResults 
  } = useGetModuleCResultQuery(jobId || '', { 
    skip: !jobId || auditMode !== 'single',
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  })

  const websiteUrl = (url || '').trim()

  const { isAnalyzing, progress, phaseLabel, runAnalysis } = useModuleCAnalysis({
    jobId,
    url: websiteUrl,
    onCompleted: refetchAeoResults,
  })

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
  
  const handleSingleAnalyze = useCallback(async () => {
    if (!websiteUrl || !jobId) return
    
    try {
      await runAnalysis()
    } catch (error) {
      console.error('Failed to start Module C analysis:', error)
    }
  }, [websiteUrl, jobId, runAnalysis])

  const handleBulkAnalyze = () => {
    // TODO: Implement bulk analysis
    const cleanedUrl = sitemapUrl.trim()
    if (!cleanedUrl) return
  }

  // Determine loading state
  const isLoadingSingleData = isAnalyzing || isLoadingExisting
  
  // Extract results from the API response
  const aeoResult = existingAeoData?.data || null
  const hasExistingData = !!aeoResult
  
  // Extract metrics from result
  const overallScore = aeoResult?.overall_score || 0
  const modules = aeoResult?.modules || {}
  
  // Extract individual module scores
  const aiPresenceScore = modules.aeo_checker?.llm_friendliness_score || 0
  const answerabilityScore = modules.answer_completeness?.completeness_score || 0
  const knowledgeBaseScore = modules.entity_coverage?.entity_coverage_pct || 0
  const llmConsistencyScore = modules.llm_simulator?.consistency?.overall || 0

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500'
    if (score >= 50) return 'text-yellow-500'
    return 'text-red-500'
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header Section with Tabs */}
      <div className="space-y-6">
        {/* Mode Tabs */}
        <div className="flex items-center gap-2 border-zinc-800 bg-zinc-800/50 p-2 rounded-lg border w-fit">
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
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-6 space-y-6">
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
            <AnalysisEmptyState
              icon={<Brain className="w-8 h-8 text-zinc-600" />}
              title="No AEO Analysis Data"
              description="Click Run Analysis to check how easily AI models can understand, trust, and use your content."
              onRunAnalysis={handleSingleAnalyze}
              isAnalyzing={isAnalyzing}
              disabled={!websiteUrl}
              buttonLabel="Run AEO Analysis"
            />
          )}

          {/* Loading State */}
          {isLoadingSingleData && (
            <div>
              {isAnalyzing ? (
                <ModuleCProgressLoader
                  progress={progress}
                  phaseLabel={phaseLabel}
                  title="Running AEO Analysis"
                />
              ) : (
                <div className="p-8 text-center border border-border rounded-lg bg-muted/50">
                  <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading existing analysis...</p>
                </div>
              )}
            </div>
          )}

          {/* Results Display */}
          {hasExistingData && !isLoadingSingleData && (
            <div className="space-y-4">
              {/* Top bar: timestamp */}
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Analysis completed • {aeoResult?.timestamp ? new Date(aeoResult.timestamp).toLocaleString() : 'Unknown'}
                </Badge>
              </div>

              {/* Sub-tab navigation */}
              <div className="flex gap-1 border border-zinc-800 bg-zinc-900/50 p-1 rounded-xl overflow-x-auto">
                {([
                  { key: 'overview', label: 'Overview', icon: BarChart3 },
                  { key: 'entities', label: 'Entities & Gaps', icon: Brain },
                  { key: 'answers', label: 'Answer Preview', icon: Eye },
                  { key: 'models', label: 'Model Comparison', icon: GitCompare },
                  { key: 'actions', label: 'Actions', icon: Zap },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveSubTab(key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                      activeSubTab === key
                        ? 'bg-zinc-700 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Sub-tab content */}
              <div className="min-h-0">
                {activeSubTab === 'overview' && (
                  <AIVisibilityScorecards jobId={jobId} url={url} />
                )}
                {activeSubTab === 'entities' && (
                  <EntityGapAnalysis jobId={jobId} url={url} />
                )}
                {activeSubTab === 'answers' && (
                  <AIAnswerPreview jobId={jobId} url={url} />
                )}
                {activeSubTab === 'models' && (
                  <ModelComparison jobId={jobId} url={url} />
                )}
                {activeSubTab === 'actions' && (
                  <ImprovementActions jobId={jobId} url={url} />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Mode */}
      {auditMode === 'bulk' && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="text"
                placeholder="Enter Sitemap URL (e.g. https://example.com/sitemap.xml)"
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                className="flex-1 bg-background border border-zinc-600 h-12 text-base focus:border-primary"
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
