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
  projectId?: string | null
}

export default function AIIntelligenceModule({ url, sessionId, jobId, projectId }: AIIntelligenceModuleProps) {
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
  } = useGetModuleCResultQuery({ jobId: jobId || '', url }, { 
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
    if (score >= 70) return 'text-emerald-600'
    if (score >= 50) return 'text-amber-600'
    return 'text-rose-600'
  }

  return (
    <div className="space-y-5">
      {/* Header Section with Tabs */}
      <div className="space-y-4">
        {/* Mode Tabs */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl w-fit"
          style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}
        >
          {(['single', 'bulk'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleAuditModeChange(mode)}
              className={cn(
                'px-6 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer',
                auditMode === mode
                  ? 'shadow-sm'
                  : 'bg-transparent',
              )}
              style={
                auditMode === mode
                  ? { background: 'var(--nd-purple)', color: '#ffffff' }
                  : { background: 'transparent', color: 'var(--nd-text-secondary)' }
              }
            >
              {mode === 'single' ? 'AEO Analysis' : 'Bulk Audit'}
            </button>
          ))}
        </div>
      </div>

      {/* Single Mode */}
      {auditMode === 'single' && (
        <div
          className="rounded-2xl p-5 space-y-5"
          style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}
        >
          {/* No Job ID Warning */}
          {!jobId && (
            <div
              className="p-4 rounded-xl flex items-center gap-2"
              style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" style={{ color: '#D97706' }} />
              <p className="text-sm" style={{ color: '#92400E' }}>
                Please run a crawl first to enable AEO analysis.
              </p>
            </div>
          )}

          {/* Empty State - Show only when no data is available */}
          {jobId && !hasExistingData && !isLoadingSingleData && (
            <AnalysisEmptyState
              icon={<Brain className="w-8 h-8" style={{ color: 'var(--nd-text-secondary)' }} />}
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
                <div
                  className="p-8 text-center rounded-xl"
                  style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}
                >
                  <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: 'var(--nd-purple)' }} />
                  <p className="text-sm font-bold" style={{ color: 'var(--nd-text-secondary)' }}>Loading existing analysis...</p>
                </div>
              )}
            </div>
          )}

          {/* Results Display */}
          {hasExistingData && !isLoadingSingleData && (
            <div className="space-y-4">
              {/* Top bar: timestamp */}
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs font-bold" style={{ borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}>
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Analysis completed • {aeoResult?.timestamp ? new Date(aeoResult.timestamp).toLocaleString() : 'Unknown'}
                </Badge>
              </div>

              {/* Sub-tab navigation */}
              <div
                className="flex gap-1 p-1 rounded-xl overflow-x-auto"
                style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}
              >
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
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all',
                    )}
                    style={
                      activeSubTab === key
                        ? { background: 'var(--nd-purple)', color: '#ffffff', boxShadow: '0 1px 4px rgba(83,71,206,0.25)' }
                        : { background: 'transparent', color: 'var(--nd-text-secondary)' }
                    }
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Sub-tab content */}
              <div className="min-h-0">
                {activeSubTab === 'overview' && (
                  <AIVisibilityScorecards jobId={jobId} url={url} projectId={projectId} />
                )}
                {activeSubTab === 'entities' && (
                  <EntityGapAnalysis jobId={jobId} url={url} projectId={projectId} />
                )}
                {activeSubTab === 'answers' && (
                  <AIAnswerPreview jobId={jobId} url={url} projectId={projectId} />
                )}
                {activeSubTab === 'models' && (
                  <ModelComparison jobId={jobId} url={url} projectId={projectId} />
                )}
                {activeSubTab === 'actions' && (
                  <ImprovementActions jobId={jobId} url={url} projectId={projectId} />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Mode */}
      {auditMode === 'bulk' && (
        <div
          className="rounded-2xl p-5 space-y-5"
          style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="text"
                placeholder="Enter Sitemap URL (e.g. https://example.com/sitemap.xml)"
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                className="flex-1 h-12 text-base nd-input"
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
            <p className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>
              Enter a sitemap URL to analyze multiple pages at once. This feature is coming soon.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
