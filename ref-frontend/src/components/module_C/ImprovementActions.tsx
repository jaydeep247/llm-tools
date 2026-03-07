'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Loader2, 
  Lightbulb, 
  AlertTriangle, 
  TrendingUp, 
  CheckCircle2, 
  Target,
  RefreshCw,
  ArrowUpRight,
  Zap,
  ChevronDown,
  Sparkles,
  Play
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetModuleCResultQuery, useRunModuleCAnalysisMutation } from '@/store/api/module_C/moduleCApi'
import { useGetJobStatusQuery } from '@/store/api/jobApi'
import { useState, useMemo, useEffect } from 'react'

interface ImprovementActionsProps {
  jobId?: string | null
  url?: string
}

// Circular progress for improvement potential
function ImprovementGauge({ value, max = 100 }: { value: number; max?: number }) {
  const percentage = Math.min((value / max) * 100, 100)
  const circumference = 2 * Math.PI * 40
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  
  return (
    <div className="relative w-24 h-24">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="#10B981"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">+{value}</span>
      </div>
    </div>
  )
}

export default function ImprovementActions({ jobId, url = '' }: ImprovementActionsProps) {
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'High' | 'Medium' | 'Low'>('all')
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null)
  const [expandedAction, setExpandedAction] = useState<number | null>(null)
  
  const { 
    data: moduleCData, 
    isLoading, 
    refetch 
  } = useGetModuleCResultQuery(jobId || '', { 
    skip: !jobId,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    pollingInterval: 5000,
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
  const actionableInsights = result?.modules?.actionable_insights

  // Filter actions
  const filteredActions = useMemo(() => {
    if (!actionableInsights?.actions) return []
    return actionableInsights.actions.filter(action => {
      return priorityFilter === 'all' || action.priority === priorityFilter
    })
  }, [actionableInsights?.actions, priorityFilter])

  // Priority stats
  const priorityStats = useMemo(() => ({
    high: actionableInsights?.priorityBreakdown?.high ?? 0,
    medium: actionableInsights?.priorityBreakdown?.medium ?? 0,
    low: actionableInsights?.priorityBreakdown?.low ?? 0,
    total: (actionableInsights?.priorityBreakdown?.high ?? 0) + 
           (actionableInsights?.priorityBreakdown?.medium ?? 0) + 
           (actionableInsights?.priorityBreakdown?.low ?? 0)
  }), [actionableInsights?.priorityBreakdown])

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'High':
        return {
          border: 'border-l-red-500',
          bg: 'bg-zinc-800/50',
          text: 'text-red-400',
          badge: 'bg-red-500/20 text-red-300 border-red-500/30'
        }
      case 'Medium':
        return {
          border: 'border-l-amber-500',
          bg: 'bg-zinc-800/50',
          text: 'text-amber-400',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        }
      default:
        return {
          border: 'border-l-emerald-500',
          bg: 'bg-zinc-800/50',
          text: 'text-emerald-400',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
        }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Improvement Actions</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Prioritized recommendations to improve your AI visibility
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
      {!isLoading && actionableInsights ? (
        <>
          {/* Hero Stats Section */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Potential Improvement Card */}
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-emerald-400/80 font-medium uppercase tracking-wider">
                      Potential Gain
                    </span>
                  </div>
                  <div className="text-4xl font-bold text-white">
                    +{actionableInsights.improvement ?? 0}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">points improvement</p>
                </div>
                <ImprovementGauge value={actionableInsights.improvement ?? 0} />
              </div>
            </div>

            {/* Priority Cards */}
            <div 
              onClick={() => setPriorityFilter(priorityFilter === 'High' ? 'all' : 'High')}
              className={cn(
                "bg-zinc-800/50 rounded-2xl p-5 border cursor-pointer transition-all",
                priorityFilter === 'High' 
                  ? "border-red-500/50" 
                  : "border-zinc-800 hover:border-zinc-700"
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-red-500/20 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <span className="text-sm text-zinc-300">High Priority</span>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-white">{priorityStats.high}</span>
                <div className="flex items-center gap-1 text-red-400">
                  <ArrowUpRight className="w-4 h-4" />
                  <span className="text-sm font-medium">Critical</span>
                </div>
              </div>
            </div>

            <div 
              onClick={() => setPriorityFilter(priorityFilter === 'Medium' ? 'all' : 'Medium')}
              className={cn(
                "bg-zinc-800/50 rounded-2xl p-5 border cursor-pointer transition-all",
                priorityFilter === 'Medium' 
                  ? "border-amber-500/50" 
                  : "border-zinc-800 hover:border-zinc-700"
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-amber-500/20 rounded-xl">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                </div>
                <span className="text-sm text-zinc-300">Medium Priority</span>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-white">{priorityStats.medium}</span>
                <div className="flex items-center gap-1 text-amber-400">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm font-medium">Important</span>
                </div>
              </div>
            </div>

            <div 
              onClick={() => setPriorityFilter(priorityFilter === 'Low' ? 'all' : 'Low')}
              className={cn(
                "bg-zinc-800/50 rounded-2xl p-5 border cursor-pointer transition-all",
                priorityFilter === 'Low' 
                  ? "border-emerald-500/50" 
                  : "border-zinc-800 hover:border-zinc-700"
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-emerald-500/20 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-sm text-zinc-300">Low Priority</span>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-white">{priorityStats.low}</span>
                <div className="flex items-center gap-1 text-emerald-400">
                  <span className="text-sm font-medium">Quick Wins</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions List */}
          {actionableInsights.actions && actionableInsights.actions.length > 0 && (
            <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 overflow-hidden">
              {/* List Header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm font-medium text-white">
                    {priorityFilter === 'all' ? 'All Actions' : `${priorityFilter} Priority Actions`}
                  </span>
                  <Badge className="bg-zinc-800 text-zinc-300 border-0">
                    {filteredActions.length}
                  </Badge>
                </div>
                {priorityFilter !== 'all' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPriorityFilter('all')}
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    Clear Filter
                  </Button>
                )}
              </div>

              {/* Actions Cards */}
              <div className="divide-y divide-zinc-800/50">
                {filteredActions.map((action, i) => {
                  const styles = getPriorityStyles(action.priority || 'Low')
                  const isExpanded = expandedAction === i
                  
                  return (
                    <div 
                      key={i}
                      className={cn(
                        "border-l-4 transition-all",
                        styles.border
                      )}
                    >
                      <div 
                        className="p-4 cursor-pointer hover:bg-zinc-800/50 transition-all"
                        onClick={() => setExpandedAction(isExpanded ? null : i)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium text-white">
                                {action.type}
                              </span>
                              <Badge className={cn("border text-xs", styles.badge)}>
                                {action.priority}
                              </Badge>
                              {action.category && (
                                <Badge variant="outline" className="text-zinc-400 border-zinc-800 text-xs">
                                  {action.category}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                              {action.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={cn("px-3 py-1.5 rounded-lg", styles.bg)}>
                              <span className={cn("text-sm font-bold", styles.text)}>
                                +{action.impact ?? 0}
                              </span>
                            </div>
                            <ChevronDown className={cn(
                              "w-4 h-4 text-zinc-500 transition-transform duration-200",
                              isExpanded && "rotate-180"
                            )} />
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-zinc-800/50 bg-zinc-900/20">
                          <div className="mt-4 space-y-4">
                            {/* Implementation Details */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="bg-zinc-800/50 rounded-lg p-3">
                                <span className="text-xs text-zinc-500 uppercase tracking-wider">Priority Level</span>
                                <p className={cn("text-sm font-medium mt-1", styles.text)}>
                                  {action.priority}
                                </p>
                              </div>
                              <div className="bg-zinc-800/50 rounded-lg p-3">
                                <span className="text-xs text-zinc-500 uppercase tracking-wider">Expected Impact</span>
                                <p className="text-sm font-medium mt-1 text-emerald-400">
                                  +{action.impact ?? 0} points
                                </p>
                              </div>
                              <div className="bg-zinc-800/50 rounded-lg p-3">
                                <span className="text-xs text-zinc-500 uppercase tracking-wider">Category</span>
                                <p className="text-sm font-medium mt-1 text-zinc-300">
                                  {action.category || 'General'}
                                </p>
                              </div>
                            </div>
                            
                            {/* Full Description */}
                            <div className="bg-zinc-800/50 rounded-lg p-4">
                              <span className="text-xs text-zinc-500 uppercase tracking-wider">Action Required</span>
                              <p className="text-sm text-zinc-300 mt-2 leading-relaxed">
                                {action.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredActions.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-sm text-zinc-400">No actions found matching your filter.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : !isLoading ? (
        <div className="bg-zinc-800/50 rounded-2xl border border-zinc-800 p-12 text-center">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lightbulb className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No Improvement Actions</h3>
          <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
            Run an AI Visibility analysis to get prioritized recommendations for improvement.
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
