'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Brain, Rocket, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { 
  useAnalyzeMutation, 
  useAnalyzeBulkMutation,
  useGetAeoResultsQuery,
  type AnalyzeResponse,
  type AnalyzeBulkResponse 
} from '@/store/api/module_C/aeoApi'

interface AIIntelligenceModuleProps {
  url: string
  sessionId?: number
}

export default function AIIntelligenceModule({ url, sessionId }: AIIntelligenceModuleProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  // Initialize audit mode from URL query params with default fallback
  const subtab = searchParams.get('subtab') || 'aeo'
  const [auditMode, setAuditMode] = useState<'single' | 'bulk'>(subtab === 'bulk' ? 'bulk' : 'single')
  const [sitemapUrl, setSitemapUrl] = useState('')
  
  // Ensure URL always has subtab parameter
  if (!searchParams.get('subtab')) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('subtab', 'aeo')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  
  // Update URL when audit mode changes
  const handleAuditModeChange = (mode: 'single' | 'bulk') => {
    setAuditMode(mode)
    const params = new URLSearchParams(searchParams.toString())
    params.set('subtab', mode === 'bulk' ? 'bulk' : 'aeo')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  
  // RTK Query mutations and queries
  const [analyze, { data: singleResult, isLoading: isSingleLoading, error: singleError }] = useAnalyzeMutation()
  const [analyzeBulk, { data: bulkResult, isLoading: isBulkLoading, error: bulkError }] = useAnalyzeBulkMutation()
  
  // Fetch existing AEO results from database
  const { data: existingAeoData, isLoading: isLoadingExisting, refetch: refetchAeoResults } = useGetAeoResultsQuery(
    sessionId!,
    { 
      skip: !sessionId || auditMode !== 'single',
      refetchOnMountOrArgChange: true
    }
  )

  // Merge existing data with new results
  useEffect(() => {
    // If we have existing data from database and no new result yet, use it
    if (existingAeoData?.success && existingAeoData.results && !singleResult) {
      // The existing data structure matches the analyze response
      console.log('Loaded existing AEO data from database:', existingAeoData)
    }
  }, [existingAeoData, singleResult])

  // Auto-populate sitemap URL when switching to bulk mode
  useEffect(() => {
    if (auditMode === 'bulk' && url && !sitemapUrl) {
      const trimmedUrl = url.trim()
      if (trimmedUrl) {
        // Remove trailing slash if present
        const baseUrl = trimmedUrl.endsWith('/') ? trimmedUrl.slice(0, -1) : trimmedUrl
        setSitemapUrl(`${baseUrl}/sitemap.xml`)
      }
    }
  }, [auditMode, url, sitemapUrl])

  const websiteUrl = (url || '').trim()
  
  const handleSingleAnalyze = async () => {
    if (!websiteUrl) return
    const result = await analyze({ url: websiteUrl, sessionId })
    // Refetch the stored results after new analysis
    if (result && sessionId) {
      refetchAeoResults()
    }
  }

  const handleBulkAnalyze = () => {
    const cleanedUrl = sitemapUrl.trim()
    if (!cleanedUrl) return
    analyzeBulk({ sitemap: cleanedUrl })
  }

  // Use the most recent data: prioritize new analysis results, fallback to existing database results
  const currentSingleData = singleResult || (existingAeoData?.success ? existingAeoData : null)
  
  // Extract metrics from current single result
  // Handle both fresh API response (with metrics) and database response (without metrics)
  const results = currentSingleData?.results || {}
  const metrics = results?.metrics || {}
  
  // For database results, try to extract from module_scores or detailed_analysis
  const entityPresenceRatio = metrics.entity_presence_ratio 
    || results?.module_scores?.entity_coverage 
    || results?.moduleScores?.entity_coverage
    || 0
    
  const structuredDataCompleteness = metrics.structured_data_completeness 
    || results?.module_scores?.structured_data?.completeness_score
    || results?.moduleScores?.structured_data?.completeness_score
    || results?.structured_data?.completeness_score
    || results?.structuredData?.completeness_score
    || 0
    
  const readabilityScore = metrics.readability_score 
    || results?.module_scores?.content_quality?.readability
    || results?.moduleScores?.content_quality?.readability
    || results?.detailed_analysis?.content_quality?.readability_score
    || results?.detailedAnalysis?.content_quality?.readability_score
    || 0
  
  const overallScore = results?.overall_score 
    || results?.overallScore 
    || results?.metrics?.llm_friendliness_score 
    || 0

  // Check if we have existing data to display
  const hasExistingData = existingAeoData?.success && existingAeoData?.results
  const isLoadingSingleData = isSingleLoading || isLoadingExisting

  // Extract bulk results
  const bulkData = bulkResult?.data || {}
  const bulkSummary = bulkData?.summary || {}
  const bulkDetails = bulkData?.details || []

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
        {/* Mode Tabs - Larger size */}
        <div className="flex items-center gap-2 border-white/20 bg-white/10 backdrop-blur-xl  p-2 rounded-lg border w-fit">
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
            AEO Checker
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
        <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl p-6 space-y-6">
          {/* Empty State - Show only when no data is available */}
          {!currentSingleData && !isLoadingSingleData && !singleError && (
            <div className="p-6 border border-border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-4">
                Click Run Analysis to check how easily AI models can understand, trust, and use your content.
              </p>
              <Button
                onClick={handleSingleAnalyze}
                disabled={!websiteUrl}
                size="lg"
                className="w-full sm:w-auto px-8 cursor-pointer"
              >
                <Rocket className="w-5 h-5 mr-2" />
                Run Analysis
              </Button>
            </div>
          )}

          {/* Loading State */}
          {isLoadingSingleData && (
            <div className="p-8 text-center border border-border rounded-lg bg-muted/50">
              <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                {isLoadingExisting ? 'Loading existing analysis...' : 'Analyzing your content...'}
              </p>
            </div>
          )}

          {/* Error Display */}
          {singleError && !currentSingleData && (
            <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm text-destructive">
                  {((singleError as any)?.data?.error ?? (singleError as any)?.message ?? 'Analysis failed')}
                </p>
              </div>
            </div>
          )}

          {/* Results Display - Show when we have either new or existing data */}
          {currentSingleData && (
            <div className="space-y-4">
              {/* Show badge if displaying existing data */}
              {hasExistingData && !singleResult && (
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Showing saved analysis results
                  </Badge>
                  <Button
                    onClick={handleSingleAnalyze}
                    disabled={!websiteUrl || isSingleLoading}
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                  >
                    {isSingleLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Re-analyzing...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-4 h-4 mr-2" />
                        Run New Analysis
                      </>
                    )}
                  </Button>
                </div>
              )}
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Main Score Card */}
              <div className="border border-border rounded-lg p-6 bg-muted/30">
                <h4 className="text-sm font-medium text-muted-foreground mb-4 text-center">
                  LLM-Friendliness Score
                </h4>
                <div className="flex items-center justify-center mb-4">
                  <div className={`text-6xl font-bold ${getScoreColor(overallScore)}`}>
                    {overallScore}
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground leading-relaxed">
                  <strong>Strict Analysis:</strong> How easily AI models can understand, trust, and use your content.
                </p>
              </div>

              {/* Metrics List */}
              <div className="space-y-3">
                {/* Entity Presence Ratio */}
                <div className="border border-border rounded-lg p-4 bg-background">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">
                      🏷️ Entity Presence Ratio
                    </span>
                    <span className={`text-lg font-bold ${getScoreColor(entityPresenceRatio)}`}>
                      {entityPresenceRatio}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        entityPresenceRatio > 70 
                          ? 'bg-green-500' 
                          : 'bg-yellow-500'
                      }`}
                      style={{ width: `${entityPresenceRatio}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Measures the ratio of key entities found vs. expected.
                  </p>
                </div>

                {/* Structured Data Completeness */}
                <div className="border border-border rounded-lg p-4 bg-background">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">
                      🔧 Structured Data Completeness
                    </span>
                    <span className={`text-lg font-bold ${getScoreColor(structuredDataCompleteness)}`}>
                      {structuredDataCompleteness}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        structuredDataCompleteness > 80 
                          ? 'bg-green-500' 
                          : 'bg-yellow-500'
                      }`}
                      style={{ width: `${structuredDataCompleteness}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Completeness of Schema.org implementation.
                  </p>
                </div>

                {/* Readability Score */}
                <div className="border border-border rounded-lg p-4 bg-background">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">
                      📖 Readability Score
                    </span>
                    <span className={`text-lg font-bold ${getScoreColor(readabilityScore)}`}>
                      {readabilityScore}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        readabilityScore > 60 
                          ? 'bg-green-500' 
                          : 'bg-yellow-500'
                      }`}
                      style={{ width: `${readabilityScore}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Flesch-Kincaid Score (Target: 60+ for clear AI parsing).
                  </p>
                </div>
              </div>
            </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Mode */}
      {auditMode === 'bulk' && (
        <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl p-6 space-y-6">
          {/* Show input and Run button if no data or loading */}
          {(!bulkResult || isBulkLoading) && (
            <>
              {/* Bulk Input Section */}
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
                    disabled={isBulkLoading || !sitemapUrl.trim()}
                    size="lg"
                    className="shrink-0 px-8 cursor-pointer"
                  >
                    {isBulkLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-5 h-5 mr-2" />
                        Run Bulk Audit
                      </>
                    )}
                  </Button>
                </div>
                {!isBulkLoading && (
                  <p className="text-sm text-muted-foreground">
                    Enter a sitemap URL to analyze multiple pages at once. This may take a while depending on the number of pages.
                  </p>
                )}
              </div>

              {/* Loading State */}
              {isBulkLoading && (
                <div className="p-8 text-center border border-border rounded-lg bg-muted/50">
                  <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    Crawling & Analyzing pages... This may take a while.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Error Display */}
          {bulkError && (
            <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm text-destructive">
                  {((bulkError as any)?.data?.error ?? (bulkError as any)?.message ?? 'Bulk analysis failed')}
                </p>
              </div>
            </div>
          )}

          {/* Bulk Results */}
          {bulkResult && !isBulkLoading && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="border border-blue-500/30 rounded-lg p-4 bg-blue-500/10">
                  <div className="text-xs font-medium text-blue-300 mb-1">
                    Avg LLM Score
                  </div>
                  <div className="text-3xl font-bold text-blue-400">
                    {bulkSummary?.average_llm_score || 0}
                  </div>
                </div>

                <div className="border border-green-500/30 rounded-lg p-4 bg-green-500/10">
                  <div className="text-xs font-medium text-green-300 mb-1">
                    Avg Readability
                  </div>
                  <div className="text-3xl font-bold text-green-400">
                    {bulkSummary?.average_readability || 0}
                  </div>
                </div>

                <div className="border border-orange-500/30 rounded-lg p-4 bg-orange-500/10">
                  <div className="text-xs font-medium text-orange-300 mb-1">
                    Weak Content %
                  </div>
                  <div className="text-3xl font-bold text-orange-400">
                    {bulkSummary?.weak_content_ratio || 0}%
                  </div>
                </div>

                <div className="border border-red-500/30 rounded-lg p-4 bg-red-500/10">
                  <div className="text-xs font-medium text-red-300 mb-1">
                    Missing Entities %
                  </div>
                  <div className="text-3xl font-bold text-red-400">
                    {bulkSummary?.missing_entities_ratio || 0}%
                  </div>
                </div>
              </div>

              {/* Detailed Table */}
              {bulkDetails.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-muted px-4 py-3">
                    <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                      Detailed Results
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Page URL
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            LLM Score
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Readability
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Entity Ratio
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Structure
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-background divide-y divide-border">
                        {bulkDetails.map((row: any, idx: number) => (
                          <tr key={idx} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-sm max-w-xs truncate">
                              <a
                                href={row.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline font-medium"
                              >
                                {row.url}
                              </a>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge
                                variant={(row.llm_score || 0) >= 60 ? 'default' : 'destructive'}
                                className="font-semibold"
                              >
                                {row.llm_score || 0}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-foreground">
                              {row.readability || 0}
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-foreground">
                              {row.entities_ratio || 0}%
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-foreground">
                              {row.structure_score || 0}%
                            </td>
                            <td className="px-4 py-3 text-center">
                              {row.status === 'Good' ? (
                                <div className="flex items-center justify-center gap-1 text-green-500">
                                  <CheckCircle className="w-4 h-4" />
                                  <span className="text-xs font-medium">Good</span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1 text-amber-500">
                                  <AlertCircle className="w-4 h-4" />
                                  <span className="text-xs font-medium">Weak</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
