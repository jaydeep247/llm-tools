'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Loader2, 
  BarChart3, 
  Cpu, 
  AlertTriangle, 
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  Layers,
  Target,
  Activity,
  Shield,
  Play
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetModuleCResultQuery, useRunModuleCAnalysisMutation } from '@/store/api/module_C/moduleCApi'
import { useGetJobStatusQuery } from '@/store/api/jobApi'
import { useMemo, useState, useEffect } from 'react'

interface ModelComparisonProps {
  jobId?: string | null
  url?: string
}

// Circular progress component for consistency score
function ConsistencyGauge({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 45
  const strokeDashoffset = circumference - (value / 100) * circumference
  
  const getColor = (score: number) => {
    if (score >= 70) return { stroke: '#10B981', text: 'text-emerald-400' }
    if (score >= 50) return { stroke: '#F59E0B', text: 'text-amber-400' }
    return { stroke: '#EF4444', text: 'text-red-400' }
  }
  
  const colors = getColor(value)
  
  return (
    <div className="relative w-32 h-32">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={colors.stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-bold", colors.text)}>{value}%</span>
        <span className="text-xs text-zinc-400">Consistency</span>
      </div>
    </div>
  )
}

// Mini bar for scores
function MiniBar({ value, maxValue = 100, color }: { value: number; maxValue?: number; color: string }) {
  const percentage = Math.min((value / maxValue) * 100, 100)
  return (
    <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
      <div 
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

export default function ModelComparison({ jobId, url = '' }: ModelComparisonProps) {
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null)

  const { 
    data: moduleCData, 
    isLoading, 
    refetch 
  } = useGetModuleCResultQuery(jobId || '', { 
    skip: !jobId,
    refetchOnMountOrArgChange: true
  })

  const [runAnalysis] = useRunModuleCAnalysisMutation()

  const { data: analysisJobData } = useGetJobStatusQuery(analysisJobId || '', {
    skip: !analysisJobId,
    pollingInterval: analysisJobId ? 2000 : 0,
  })

  useEffect(() => {
    if (analysisJobData?.status === 'COMPLETED' || analysisJobData?.status === 'FAILED') {
      setAnalysisJobId(null)
      if (analysisJobData?.status === 'COMPLETED') {
        refetch()
      }
    }
  }, [analysisJobData?.status, refetch])

  const handleRunAnalysis = async () => {
    if (!jobId) return
    try {
      const result = await runAnalysis({ jobId, url }).unwrap()
      if (result.data?.analysisJobId) {
        setAnalysisJobId(result.data.analysisJobId)
      }
    } catch (error) {
      console.error('Failed to start analysis:', error)
    }
  }

  const isAnalyzing = !!analysisJobId

  const result = moduleCData?.data
  const llmSimulator = result?.modules?.llm_simulator
  const metrics = llmSimulator?.cross_model_metrics

  // Model colors mapping
  const modelColors: Record<string, { bg: string; icon: string; bar: string }> = {
    'gpt': { bg: 'bg-zinc-800/50', icon: 'text-emerald-400', bar: 'bg-emerald-500' },
    'claude': { bg: 'bg-zinc-800/50', icon: 'text-orange-400', bar: 'bg-orange-500' },
    'gemini': { bg: 'bg-zinc-800/50', icon: 'text-blue-400', bar: 'bg-blue-500' },
    'llama': { bg: 'bg-zinc-800/50', icon: 'text-blue-400', bar: 'bg-purple-500' },
    'mistral': { bg: 'bg-zinc-800/50', icon: 'text-cyan-400', bar: 'bg-cyan-500' },
  }

  const getModelColor = (model: string) => {
    const lowerModel = model.toLowerCase()
    for (const [key, colors] of Object.entries(modelColors)) {
      if (lowerModel.includes(key)) return colors
    }
    return { bg: 'bg-zinc-800/50', icon: 'text-zinc-300', bar: 'bg-zinc-500' }
  }

  const models = useMemo(() => {
    if (!metrics?.model_scores) return []
    return Object.entries(metrics.model_scores)
  }, [metrics?.model_scores])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Model Comparison</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Cross-model consistency and performance analysis
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          variant="outline"
          size="sm"
          disabled={isLoading}
          className="bg-zinc-800/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      )}

      {/* Content */}
      {!isLoading && metrics ? (
        <>
          {/* Hero Stats Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Consistency Score Card */}
            <div className="lg:col-span-4 bg-zinc-800/50 rounded-2xl p-6 border border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-zinc-400" />
                    <span className="text-xs text-zinc-400 uppercase tracking-wider">Consistency</span>
                  </div>
                  <p className="text-sm text-zinc-400 max-w-37.5">
                    How consistent are responses across all AI models
                  </p>
                </div>
                <ConsistencyGauge value={metrics.consistency_score ?? 0} />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-blue-500/20 rounded-xl">
                    <Cpu className="w-4 h-4 text-blue-400" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-white">{models.length}</div>
                <div className="text-xs text-zinc-400 mt-1">Models Compared</div>
              </div>

              <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-blue-500/20 rounded-xl">
                    <Layers className="w-4 h-4 text-blue-400" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-white">
                  {((metrics.variation_analysis?.reasoning_level?.similarity ?? 0) * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-zinc-400 mt-1">Reasoning Similarity</div>
              </div>

              <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-amber-500/20 rounded-xl">
                    <Target className="w-4 h-4 text-amber-400" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-white">
                  {metrics.variation_analysis?.specificity_level?.depth_score ?? 0}
                </div>
                <div className="text-xs text-zinc-400 mt-1">Depth Score</div>
              </div>

              <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn(
                    "p-2 rounded-xl",
                    (metrics.coverage_gaps?.length ?? 0) === 0 ? "bg-emerald-500/20" : "bg-red-500/20"
                  )}>
                    {(metrics.coverage_gaps?.length ?? 0) === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                </div>
                <div className={cn(
                  "text-2xl font-bold",
                  (metrics.coverage_gaps?.length ?? 0) === 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {metrics.coverage_gaps?.length ?? 0}
                </div>
                <div className="text-xs text-zinc-400 mt-1">Coverage Gaps</div>
              </div>
            </div>
          </div>

          {/* Variation Analysis */}
          {metrics.variation_analysis && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Outcome Level */}
              <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-emerald-500/20 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-sm font-medium text-white">Outcome Level</span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-semibold capitalize">
                    {metrics.variation_analysis.outcome_level?.agreement || 'N/A'}
                  </span>
                  <Badge className="bg-zinc-800 text-zinc-300 border-0">
                    Score: {metrics.variation_analysis.outcome_level?.score ?? 'N/A'}
                  </Badge>
                </div>
                {metrics.variation_analysis.outcome_level?.note && (
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {metrics.variation_analysis.outcome_level.note}
                  </p>
                )}
              </div>

              {/* Tone Analysis */}
              <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-blue-500/20 rounded-xl">
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-white">Tone Analysis</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Confidence</span>
                    <Badge className="bg-blue-500/20 text-blue-300 border-0 capitalize">
                      {metrics.variation_analysis.tone_analysis?.confidence || 'N/A'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Risk Posture</span>
                    <Badge className="bg-amber-500/20 text-amber-300 border-0 capitalize">
                      {metrics.variation_analysis.tone_analysis?.risk_posture || 'N/A'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Specificity Level */}
              <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-blue-500/20 rounded-xl">
                    <Shield className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-white">Specificity Level</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Depth</div>
                    <div className="text-2xl font-bold text-white">
                      {metrics.variation_analysis.specificity_level?.depth_score ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Completeness</div>
                    <div className="text-2xl font-bold text-white">
                      {metrics.variation_analysis.specificity_level?.completeness_score ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Model Scores Cards */}
          {models.length > 0 && (
            <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 overflow-hidden">
              <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-white">Model Performance</span>
                <Badge className="bg-zinc-800 text-zinc-300 border-0 ml-auto">
                  {models.length} models
                </Badge>
              </div>

              <div className="divide-y divide-zinc-800/50">
                {models.map(([model, scores]) => {
                  const colors = getModelColor(model)
                  const overall = ((scores.overall ?? 0) * 100)
                  const agreement = ((scores.agreement ?? 0) * 100)
                  const depth = ((scores.depth ?? 0) * 100)
                  
                  return (
                    <div key={model} className="p-4 hover:bg-zinc-800/50 transition-all">
                      <div className="flex items-center gap-4">
                        <div className={cn("p-2.5 rounded-xl", colors.bg)}>
                          <Cpu className={cn("w-5 h-5", colors.icon)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-white capitalize">
                              {model.replace(/_/g, ' ')}
                            </span>
                            <Badge className={cn(
                              "border",
                              overall >= 70 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                              overall >= 50 ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                              "bg-red-500/20 text-red-300 border-red-500/30"
                            )}>
                              {overall.toFixed(0)}% Overall
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs text-zinc-400">Agreement</span>
                                <span className="text-xs font-medium text-white">{agreement.toFixed(0)}%</span>
                              </div>
                              <MiniBar value={agreement} color={colors.bar} />
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs text-zinc-400">Depth</span>
                                <span className="text-xs font-medium text-white">{depth.toFixed(0)}%</span>
                              </div>
                              <MiniBar value={depth} color={colors.bar} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Claim Matrix Section */}
          {result?.modules?.multi_model_insights?.claim_matrix && (result.modules.multi_model_insights.claim_matrix as any[]).length > 0 && (
            <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 overflow-hidden">
              <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <Layers className="w-4 h-4 text-blue-400" />
                </div>
                <span className="text-sm font-medium text-white">Claim Verification Matrix</span>
                <Badge className="bg-blue-500/20 text-blue-300 border-0 ml-auto">
                  {(result.modules.multi_model_insights.claim_matrix as any[]).length} claims
                </Badge>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {(result.modules.multi_model_insights.claim_matrix as any[]).map((claim: any, i: number) => (
                  <div key={i} className="p-4 hover:bg-zinc-800/50 transition-all">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <p className="text-sm text-zinc-200 flex-1">{claim.claim}</p>
                      <Badge variant="outline" className="text-zinc-400 border-zinc-700 shrink-0 text-xs">
                        {claim.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-zinc-500">Confirmed by:</span>
                      {claim.providers && Object.entries(claim.providers)
                        .filter(([, confirmed]) => confirmed)
                        .map(([provider]) => (
                          <Badge key={provider} className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs capitalize">
                            {provider}
                          </Badge>
                        ))
                      }
                      {claim.providers && Object.entries(claim.providers)
                        .filter(([, confirmed]) => !confirmed)
                        .map(([provider]) => (
                          <Badge key={provider} className="bg-red-500/20 text-red-300 border-red-500/30 text-xs capitalize">
                            {provider} ✗
                          </Badge>
                        ))
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coverage Gaps */}
          {metrics.coverage_gaps && metrics.coverage_gaps.length > 0 && (
            <div className="bg-zinc-800/50 rounded-2xl border border-red-500/30 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-red-500/20 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <span className="text-sm font-medium text-red-400">
                  Coverage Gaps ({metrics.coverage_gaps.length})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {metrics.coverage_gaps.map((gap, i) => (
                  <div 
                    key={i} 
                    className="text-sm text-zinc-300 bg-zinc-800/50 rounded-xl px-4 py-2.5 border border-zinc-800"
                  >
                    {typeof gap === 'string' ? gap : (
                      <div className="space-y-1">
                        <div className="font-medium text-zinc-200">{gap.type}</div>
                        {gap.description && <div className="text-xs text-zinc-400">{gap.description}</div>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {gap.severity && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              gap.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                              gap.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-zinc-700 text-zinc-400'
                            }`}>{gap.severity}</span>
                          )}
                          {gap.missing_from && gap.missing_from.length > 0 && (
                            <span className="text-xs text-red-400">Missing: {gap.missing_from.join(', ')}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : !isLoading ? (
        <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 p-12 text-center">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No Model Comparison Data</h3>
          <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
            Run an AI Visibility analysis to see cross-model consistency and performance.
          </p>
          <Button
            onClick={handleRunAnalysis}
            disabled={!jobId || isAnalyzing}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Analysis...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run AI Visibility Analysis
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
