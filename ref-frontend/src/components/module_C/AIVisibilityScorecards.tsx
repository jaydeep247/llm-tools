'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Loader2, 
  Brain, 
  MessageCircle, 
  Database, 
  Cpu, 
  Lightbulb,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  ArrowUpRight,
  ChevronDown,
  Shield,
  Globe
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { 
  useGetModuleCResultQuery,
  useRunModuleCAnalysisMutation,
} from '@/store/api/module_C/moduleCApi'
import { useGetJobStatusQuery } from '@/store/api/jobApi'

interface AIVisibilityScorecardsProps {
  url: string
  sessionId?: string | number
  jobId?: string | null
}

// Circular Progress Component
function CircularProgress({ 
  value, 
  size = 120, 
  strokeWidth = 8,
  className 
}: { 
  value: number
  size?: number
  strokeWidth?: number
  className?: string 
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (value / 100) * circumference

  const getColor = (v: number) => {
    if (v >= 80) return '#22c55e' // green
    if (v >= 60) return '#eab308' // yellow
    if (v >= 40) return '#f97316' // orange
    return '#ef4444' // red
  }

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(value)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white">{value.toFixed(0)}</span>
        <span className="text-xs text-zinc-400">/ 100</span>
      </div>
    </div>
  )
}

// Score Card Component - Redesigned
interface ScoreCardProps {
  title: string
  score: number | null
  icon: React.ReactNode
  color: string
  trend?: number
  subStats?: { label: string; value: string | number }[]
  error?: string
  isLoading?: boolean
}

function ScoreCard({ title, score, icon, color, trend, subStats, error, isLoading }: ScoreCardProps) {
  const getScoreLabel = (s: number) => {
    if (s >= 80) return { text: 'Excellent', color: 'text-green-400 bg-green-500/10' }
    if (s >= 60) return { text: 'Good', color: 'text-yellow-400 bg-yellow-500/10' }
    if (s >= 40) return { text: 'Fair', color: 'text-orange-400 bg-orange-500/10' }
    return { text: 'Needs Work', color: 'text-red-400 bg-red-500/10' }
  }

  if (isLoading) {
    return (
      <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-800" />
          <div className="h-4 w-24 bg-zinc-800 rounded" />
        </div>
        <div className="h-12 w-20 bg-zinc-800 rounded mt-4" />
      </div>
    )
  }

  return (
    <div className="bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800 hover:bg-zinc-800/50 transition-all duration-300 group">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-xl", color)}>
            {icon}
          </div>
          <span className="text-sm font-medium text-zinc-200">{title}</span>
        </div>
        {score !== null && !error && (
          <span className={cn(
            "text-xs px-2 py-1 rounded-full font-medium",
            getScoreLabel(score).color
          )}>
            {getScoreLabel(score).text}
          </span>
        )}
      </div>

      {/* Score */}
      <div className="flex items-end justify-between">
        <div>
          {error ? (
            <div className="flex items-center gap-2 text-red-400">
              <XCircle className="w-5 h-5" />
              <span className="text-sm">Error</span>
            </div>
          ) : score !== null ? (
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-white">{score.toFixed(1)}</span>
              <span className="text-sm text-zinc-500">/100</span>
            </div>
          ) : (
            <span className="text-3xl font-bold text-zinc-600">--</span>
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

        {/* Mini Stats */}
        {subStats && subStats.length > 0 && !error && (
          <div className="flex gap-3">
            {subStats.slice(0, 2).map((stat, i) => (
              <div key={i} className="text-right">
                <div className="text-xs text-zinc-500">{stat.label}</div>
                <div className="text-sm font-semibold text-white">{stat.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-300/70 mt-2 line-clamp-2">{error}</p>
      )}
    </div>
  )
}

export default function AIVisibilityScorecards({ url, sessionId, jobId }: AIVisibilityScorecardsProps) {
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null)

  // Fetch Module C results
  const { 
    data: moduleCData, 
    isLoading: isLoadingData, 
    refetch: refetchData 
  } = useGetModuleCResultQuery(jobId || '', { 
    skip: !jobId,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  })

  const [runAnalysis, { isLoading: isRunning }] = useRunModuleCAnalysisMutation()

  // Poll for analysis job status
  const { data: analysisJobData } = useGetJobStatusQuery(analysisJobId || '', {
    skip: !analysisJobId,
    pollingInterval: analysisJobId ? 2000 : 0,
  })

  // Check if analysis job is complete
  useEffect(() => {
    if (analysisJobData?.status === 'COMPLETED') {
      setAnalysisJobId(null)
      refetchData()
    } else if (analysisJobData?.status === 'FAILED') {
      setAnalysisJobId(null)
    }
  }, [analysisJobData, refetchData])

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

  const isAnalyzing = isRunning || !!analysisJobId
  const result = moduleCData?.data
  const modules = result?.modules || {}
  const hasData = !!result

  // Extract scores
  const overallScore = result?.overall_score ?? null
  const aiPresence = modules.ai_presence
  const answerability = modules.answerability
  const knowledgeBase = modules.knowledge_base
  const llmSimulator = modules.llm_simulator
  const actionableInsights = modules.actionable_insights

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white">AI Visibility Scorecards</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Comprehensive AEO analysis scores for your website
        </p>
      </div>

      {/* No Job Warning */}
      {!jobId && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-sm text-amber-300">
              Please run a crawl first to enable AI Visibility analysis.
            </p>
          </div>
        </div>
      )}

      {/* Main Score Hero Card */}
      {hasData && (
        <div className="bg-zinc-800/50 rounded-2xl p-6 border border-zinc-800">
          <div className="flex flex-col lg:flex-row gap-8 items-center">
            {/* Score Circle */}
            <div className="shrink-0">
              <CircularProgress value={overallScore ?? 0} size={140} strokeWidth={10} />
            </div>

            {/* Score Details */}
            <div className="flex-1 text-center lg:text-left">
              <h3 className="text-lg font-semibold text-white mb-2">Overall AI Visibility Score</h3>
              <p className="text-sm text-zinc-400 mb-4">Combined score across all analysis modules</p>
              
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      overallScore !== null && overallScore >= 70 ? 'bg-green-500' :
                      overallScore !== null && overallScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    )}
                    style={{ width: `${overallScore ?? 0}%` }}
                  />
                </div>
              </div>

              {/* Score Status */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-4">
                <div className="flex items-center gap-2">
                  {overallScore !== null && overallScore >= 70 ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                  )}
                  <span className={cn(
                    "text-sm font-medium",
                    overallScore !== null && overallScore >= 70 ? "text-green-400" :
                    overallScore !== null && overallScore >= 50 ? "text-yellow-400" : "text-red-400"
                  )}>
                    {overallScore !== null && overallScore >= 80 ? 'Excellent Performance' :
                     overallScore !== null && overallScore >= 60 ? 'Good Performance' :
                     overallScore !== null && overallScore >= 40 ? 'Needs Improvement' : 'Critical Issues'}
                  </span>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            {actionableInsights && (
              <div className="grid grid-cols-3 gap-4 shrink-0">
                <div className="bg-zinc-800/50 rounded-xl p-4 text-center min-w-25">
                  <div className="text-2xl font-bold text-white">{actionableInsights.currentScore ?? '--'}</div>
                  <div className="text-xs text-zinc-400 mt-1">Current</div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4 text-center min-w-25">
                  <div className="text-2xl font-bold text-emerald-400">{actionableInsights.predictedScore ?? '--'}</div>
                  <div className="text-xs text-zinc-400 mt-1">Predicted</div>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-4 text-center min-w-25">
                  <div className="text-2xl font-bold text-emerald-400">+{actionableInsights.improvement ?? 0}</div>
                  <div className="text-xs text-zinc-400 mt-1">Potential</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Module Score Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* AI Presence */}
        <ScoreCard
          title="AI Presence"
          score={aiPresence?.score ?? null}
          icon={<Brain className="w-5 h-5 text-blue-400" />}
          color="bg-blue-500/20"
          isLoading={isLoadingData}
          subStats={aiPresence ? [
            { label: 'Robots', value: aiPresence.robots_checks ? Object.values(aiPresence.robots_checks).filter(Boolean).length + '/' + Object.keys(aiPresence.robots_checks).length : '--' },
            { label: 'Signals', value: aiPresence.content_checks ? Object.values(aiPresence.content_checks).filter(Boolean).length : '--' }
          ] : undefined}
        />

        {/* Answerability */}
        <ScoreCard
          title="Answerability"
          score={answerability?.score ?? null}
          icon={<MessageCircle className="w-5 h-5 text-blue-400" />}
          color="bg-blue-500/20"
          isLoading={isLoadingData}
          subStats={answerability ? [
            { label: 'Depth', value: answerability.depth_score ?? '--' },
            { label: 'Complete', value: `${answerability.completeness_score ?? '--'}%` }
          ] : undefined}
        />

        {/* Knowledge Base */}
        <ScoreCard
          title="Knowledge Base"
          score={knowledgeBase?.score ?? null}
          icon={<Database className="w-5 h-5 text-green-400" />}
          color="bg-green-500/20"
          isLoading={isLoadingData}
          subStats={knowledgeBase ? [
            { label: 'Coverage', value: `${knowledgeBase.entity_coverage?.coverage_score ?? '--'}%` },
            { label: 'Density', value: knowledgeBase.fact_density?.toFixed(1) ?? '--' }
          ] : undefined}
        />

        {/* LLM Simulator */}
        <ScoreCard
          title="LLM Simulator"
          score={llmSimulator?.cross_model_metrics?.consistency_score ?? null}
          icon={<Cpu className="w-5 h-5 text-cyan-400" />}
          color="bg-cyan-500/20"
          isLoading={isLoadingData}
          subStats={llmSimulator?.simulations ? [
            { label: 'Models', value: Object.keys(llmSimulator.simulations).length },
            { label: 'Agree', value: llmSimulator.cross_model_metrics?.variation_analysis?.outcome_level?.agreement ?? '--' }
          ] : undefined}
        />

        {/* Actionable Insights */}
        <ScoreCard
          title="Actionable Insights"
          score={actionableInsights?.currentScore ?? null}
          icon={<Lightbulb className="w-5 h-5 text-yellow-400" />}
          color="bg-yellow-500/20"
          isLoading={isLoadingData}
          subStats={actionableInsights ? [
            { label: 'Actions', value: actionableInsights.totalActions ?? '--' },
            { label: 'High', value: actionableInsights.priorityBreakdown?.high ?? 0 }
          ] : undefined}
        />
      </div>

      {/* AI Presence Detailed Breakdown */}
      {hasData && aiPresence && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Robot Accessibility */}
          <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/20 rounded-xl">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-sm font-medium text-white">Robot Accessibility</span>
              <Badge className="bg-zinc-800 text-zinc-400 border-0 ml-auto text-xs">
                {aiPresence.robots_checks ? Object.values(aiPresence.robots_checks).filter(Boolean).length : 0}/{aiPresence.robots_checks ? Object.keys(aiPresence.robots_checks).length : 0} checks
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-300">GPTBot Access</span>
                </div>
                {aiPresence.robots_checks?.robots_gptbot ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Allowed</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span className="text-xs">Blocked</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <span className="text-sm text-zinc-300">Google Extended</span>
                {aiPresence.robots_checks?.robots_google_extended ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Allowed</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span className="text-xs">Blocked</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <span className="text-sm text-zinc-300">ClaudeBot Access</span>
                {aiPresence.robots_checks?.robots_claudebot ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Allowed</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span className="text-xs">Blocked</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <span className="text-sm text-zinc-300">Sitemap Present</span>
                {aiPresence.robots_checks?.sitemap_present ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Found</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span className="text-xs">Missing</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Content Signals */}
          <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/20 rounded-xl">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-sm font-medium text-white">Content Signals</span>
              <Badge className="bg-zinc-800 text-zinc-400 border-0 ml-auto text-xs">
                {aiPresence.content_checks ? Object.values(aiPresence.content_checks).filter(v => v === true).length : 0} found
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <span className="text-sm text-zinc-300">Organization Schema</span>
                {aiPresence.content_checks?.org_schema_present ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Present</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span className="text-xs">Missing</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <span className="text-sm text-zinc-300">Organization Logo</span>
                {aiPresence.content_checks?.org_logo_present ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Present</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span className="text-xs">Missing</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <span className="text-sm text-zinc-300">Wikipedia/Wikidata Link</span>
                {aiPresence.content_checks?.sameas_wikidata_or_wikipedia ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Linked</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-amber-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs">Not Found</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <span className="text-sm text-zinc-300">Open Graph Tags</span>
                {aiPresence.content_checks?.open_graph_present ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Present</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span className="text-xs">Missing</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <span className="text-sm text-zinc-300">Twitter Card</span>
                {aiPresence.content_checks?.twitter_card_present ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Present</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span className="text-xs">Missing</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Answerability Breakdown */}
      {hasData && answerability?.metrics && (
        <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-xl">
              <MessageCircle className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm font-medium text-white">Answerability Metrics</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{answerability.metrics.question_count ?? 0}</div>
              <div className="text-xs text-zinc-400 mt-1">Questions Found</div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{answerability.metrics.answer_count ?? 0}</div>
              <div className="text-xs text-zinc-400 mt-1">Answers Found</div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{((answerability.metrics.qa_balance ?? 0) * 100).toFixed(0)}%</div>
              <div className="text-xs text-zinc-400 mt-1">Q&A Balance</div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-cyan-400">{answerability.metrics.percent_questions_answered ?? 0}%</div>
              <div className="text-xs text-zinc-400 mt-1">Questions Answered</div>
            </div>
          </div>
          
          {/* Missing Answers/Gaps */}
          {answerability.ai_analysis?.missing_answers_gaps && answerability.ai_analysis.missing_answers_gaps.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-zinc-400 uppercase tracking-wider">Missing Answer Gaps</span>
              </div>
              <div className="space-y-2">
                {answerability.ai_analysis.missing_answers_gaps.slice(0, 5).map((gap, i) => (
                  <div key={i} className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                    <p className="text-sm text-amber-200">{gap}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Data State */}
      {!hasData && !isLoadingData && jobId && (
        <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 p-12 text-center">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No Analysis Data Yet</h3>
          <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
            Run an AI Visibility analysis to see comprehensive scorecards for your website.
          </p>
          <Button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="bg-emerald-600 hover:bg-emerald-700"
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
      )}
    </div>
  )
}
