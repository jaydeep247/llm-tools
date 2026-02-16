'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
// import { useGetAnswerCompletenessQuery as useAeoAnswerCompletenessQuery } from '@/store/api/module_C/aeoApi'

interface AnswerCompletenessModuleProps {
  url: string
  sessionId?: number
}

export default function AnswerCompletenessModule({ url, sessionId }: AnswerCompletenessModuleProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  

  // Fetch answer completeness data using new RTK query from aeoApi
  // Mock removed query
  const completeness: any = null
  const isLoading = false
  const error = null
  const refetch = () => {}
  /*
  const { data: completeness, isLoading, error, refetch } = useAeoAnswerCompletenessQuery(
    sessionId!,
    {
      skip: !sessionId,
      refetchOnMountOrArgChange: true
    }
  )
  */

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500'
    if (score >= 60) return 'text-yellow-500'
    if (score >= 40) return 'text-orange-500'
    return 'text-red-500'
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500/20 border-green-500/30'
    if (score >= 60) return 'bg-yellow-500/20 border-yellow-500/30'
    if (score >= 40) return 'bg-orange-500/20 border-orange-500/30'
    return 'bg-red-500/20 border-red-500/30'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Excellent'
    if (score >= 80) return 'Very Good'
    if (score >= 70) return 'Good'
    if (score >= 60) return 'Fair'
    if (score >= 50) return 'Needs Improvement'
    return 'Poor'
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header Section */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Answer Completeness Score</h2>
        <p className="text-sm text-muted-foreground">Comprehensive analysis of how completely your content answers user queries</p>
      </div>

      <div className="rounded-lg border border-white/20 bg-white/10 backdrop-blur-xl p-6 space-y-6">
        {/* Empty State */}
        {!completeness && !isLoading && !error && (
          <div className="p-6 border border-border rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground mb-4">
              No answer completeness data available yet. Run an AEO analysis to see completeness insights.
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="p-8 text-center border border-border rounded-lg bg-muted/50">
            <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading answer completeness data...</p>
          </div>
        )}

        {/* Error Display */}
        {error && !completeness && (
          <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <p className="text-sm text-destructive">
                {((error as any)?.data?.error ?? (error as any)?.message ?? 'Failed to load completeness data')}
              </p>
            </div>
          </div>
        )}

        {/* Answer Completeness Results */}
        {completeness && (
          <div className="space-y-6">
            {/* Primary Metrics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Completeness Score */}
              <div className="border border-border rounded-lg p-6 bg-muted/30">
                <div className="flex items-start gap-3 mb-4">
                  <div className="text-3xl">📊</div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground mb-1">Completeness Score</h4>
                    <p className="text-xs text-muted-foreground">Overall answer completeness (0-100)</p>
                  </div>
                </div>
                <div className="flex items-center justify-center mb-4">
                  <div className={`text-5xl font-bold ${getScoreColor(completeness.overall_score || 0)}`}>
                    {completeness.overall_score || 0}
                  </div>
                </div>
                <div className="text-center">
                  <Badge variant="outline" className="text-xs font-medium">
                    {getScoreLabel(completeness.overall_score || 0)}
                  </Badge>
                </div>
              </div>

              {/* Questions Fully Answered */}
              <div className="border border-border rounded-lg p-6 bg-muted/30">
                <div className="flex items-start gap-3 mb-4">
                  <div className="text-3xl">✅</div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground mb-1">Questions Answered</h4>
                    <p className="text-xs text-muted-foreground">% of questions fully answered</p>
                  </div>
                </div>
                <div className="flex items-center justify-center mb-4">
                  <div className={`text-5xl font-bold ${getScoreColor(completeness.completeness_percentage || 0)}`}>
                    {completeness.completeness_percentage || 0}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Coverage Status:</div>
                  <div className="text-xs text-foreground font-medium">
                    {completeness.key_aspects_covered.length} answered, {completeness.missing_aspects.length} missing
                  </div>
                </div>
              </div>

              {/* Missing / Partial Coverage */}
              <div className="border border-border rounded-lg p-6 bg-muted/30">
                <div className="flex items-start gap-3 mb-4">
                  <div className="text-3xl">⚠️</div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-foreground mb-1">Missing Coverage</h4>
                    <p className="text-xs text-muted-foreground">Gaps in answer completeness</p>
                  </div>
                </div>
                <div className="flex items-center justify-center mb-4">
                  <div className={`text-5xl font-bold ${completeness.missing_aspects.length > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {completeness.missing_aspects.length}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Partial Coverage:</div>
                  <div className="text-xs text-foreground font-medium">
                    {100 - (completeness.completeness_percentage || 0)}% incomplete
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Metrics (if available) */}
            {(completeness.depth_score !== undefined || completeness.breadth_score !== undefined || completeness.relevance_score !== undefined) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {completeness.depth_score !== undefined && (
                  <div className="border border-border rounded-lg p-4 bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        📏 Depth Score
                      </span>
                      <span className={`text-lg font-bold ${getScoreColor(completeness.depth_score)}`}>
                        {completeness.depth_score}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          completeness.depth_score >= 70 
                            ? 'bg-green-500' 
                            : completeness.depth_score >= 50 
                            ? 'bg-yellow-500' 
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${completeness.depth_score}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      How thoroughly topics are covered
                    </p>
                  </div>
                )}

                {completeness.breadth_score !== undefined && (
                  <div className="border border-border rounded-lg p-4 bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        📐 Breadth Score
                      </span>
                      <span className={`text-lg font-bold ${getScoreColor(completeness.breadth_score)}`}>
                        {completeness.breadth_score}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          completeness.breadth_score >= 70 
                            ? 'bg-green-500' 
                            : completeness.breadth_score >= 50 
                            ? 'bg-yellow-500' 
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${completeness.breadth_score}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Range of topics addressed
                    </p>
                  </div>
                )}

                {completeness.relevance_score !== undefined && (
                  <div className="border border-border rounded-lg p-4 bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        🎯 Relevance Score
                      </span>
                      <span className={`text-lg font-bold ${getScoreColor(completeness.relevance_score)}`}>
                        {completeness.relevance_score}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          completeness.relevance_score >= 70 
                            ? 'bg-green-500' 
                            : completeness.relevance_score >= 50 
                            ? 'bg-yellow-500' 
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${completeness.relevance_score}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Alignment with user intent
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Key Aspects Coverage & Missing Aspects */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Key Aspects Covered */}
              {completeness.key_aspects_covered.length > 0 && (
                <div className="border border-green-500/30 rounded-lg p-4 bg-green-500/10">
                  <h4 className="text-sm font-semibold text-green-300 mb-3 flex items-center gap-2">
                    <span>✅</span>
                    Key Aspects Covered ({completeness.key_aspects_covered.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {completeness.key_aspects_covered.map((aspect: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="border-green-500/50 text-green-300">
                        {aspect}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Aspects */}
              {completeness.missing_aspects.length > 0 && (
                <div className="border border-amber-500/30 rounded-lg p-4 bg-amber-500/10">
                  <h4 className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
                    <span>⚠️</span>
                    Missing Aspects ({completeness.missing_aspects.length})
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {completeness.missing_aspects.map((aspect: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="border-amber-500/50 text-amber-300">
                        {aspect}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recommendations */}
            {completeness.recommendations && completeness.recommendations.length > 0 && (
              <div className="border border-border rounded-lg p-4 bg-muted/30">
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="text-lg">💡</span>
                  Recommendations
                </h4>
                <div className="space-y-2">
                  {completeness.recommendations.map((rec: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 transition-colors">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="text-sm text-foreground">{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
