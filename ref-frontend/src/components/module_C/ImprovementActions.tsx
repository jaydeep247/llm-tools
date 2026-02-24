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
  ChevronRight,
  Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetModuleCResultQuery } from '@/store/api/module_C/moduleCApi'
import { useState, useMemo } from 'react'

interface ImprovementActionsProps {
  jobId?: string | null
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

export default function ImprovementActions({ jobId }: ImprovementActionsProps) {
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'High' | 'Medium' | 'Low'>('all')
  
  const { 
    data: moduleCData, 
    isLoading, 
    refetch 
  } = useGetModuleCResultQuery(jobId || '', { 
    skip: !jobId,
    refetchOnMountOrArgChange: true
  })

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
          bg: 'bg-white/[0.05]',
          text: 'text-red-400',
          badge: 'bg-red-500/20 text-red-300 border-red-500/30'
        }
      case 'Medium':
        return {
          border: 'border-l-amber-500',
          bg: 'bg-white/[0.05]',
          text: 'text-amber-400',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        }
      default:
        return {
          border: 'border-l-emerald-500',
          bg: 'bg-white/[0.05]',
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
          <p className="text-sm text-white/50 mt-1">
            Prioritized recommendations to improve your AI visibility
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          variant="outline"
          size="sm"
          disabled={isLoading}
          className="bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-white/60" />
        </div>
      )}

      {/* Content */}
      {!isLoading && actionableInsights ? (
        <>
          {/* Hero Stats Section */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Potential Improvement Card */}
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-emerald-500/30">
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
                  <p className="text-xs text-white/50 mt-1">points improvement</p>
                </div>
                <ImprovementGauge value={actionableInsights.improvement ?? 0} />
              </div>
            </div>

            {/* Priority Cards */}
            <div 
              onClick={() => setPriorityFilter(priorityFilter === 'High' ? 'all' : 'High')}
              className={cn(
                "bg-white/5 backdrop-blur-xl rounded-2xl p-5 border cursor-pointer transition-all",
                priorityFilter === 'High' 
                  ? "border-red-500/50" 
                  : "border-white/10 hover:border-white/15"
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-red-500/20 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <span className="text-sm text-white/70">High Priority</span>
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
                "bg-white/5 backdrop-blur-xl rounded-2xl p-5 border cursor-pointer transition-all",
                priorityFilter === 'Medium' 
                  ? "border-amber-500/50" 
                  : "border-white/10 hover:border-white/15"
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-amber-500/20 rounded-xl">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                </div>
                <span className="text-sm text-white/70">Medium Priority</span>
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
                "bg-white/5 backdrop-blur-xl rounded-2xl p-5 border cursor-pointer transition-all",
                priorityFilter === 'Low' 
                  ? "border-emerald-500/50" 
                  : "border-white/10 hover:border-white/15"
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-emerald-500/20 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-sm text-white/70">Low Priority</span>
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
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
              {/* List Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-white/50" />
                  <span className="text-sm font-medium text-white">
                    {priorityFilter === 'all' ? 'All Actions' : `${priorityFilter} Priority Actions`}
                  </span>
                  <Badge className="bg-white/10 text-white/70 border-0">
                    {filteredActions.length}
                  </Badge>
                </div>
                {priorityFilter !== 'all' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPriorityFilter('all')}
                    className="text-xs text-white/50 hover:text-white"
                  >
                    Clear Filter
                  </Button>
                )}
              </div>

              {/* Actions Cards */}
              <div className="divide-y divide-white/5">
                {filteredActions.map((action, i) => {
                  const styles = getPriorityStyles(action.priority || 'Low')
                  
                  return (
                    <div 
                      key={i}
                      className={cn(
                        "p-4 border-l-4 hover:bg-white/5 transition-all",
                        styles.border
                      )}
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
                              <Badge variant="outline" className="text-white/50 border-white/10 text-xs">
                                {action.category}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-white/60 leading-relaxed">
                            {action.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={cn("px-3 py-1.5 rounded-lg", styles.bg)}>
                            <span className={cn("text-sm font-bold", styles.text)}>
                              +{action.impact ?? 0}
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-white/20" />
                        </div>
                      </div>
                    </div>
                  )
                })}
                {filteredActions.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-sm text-white/50">No actions found matching your filter.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : !isLoading ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-12 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lightbulb className="w-8 h-8 text-white/30" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No Improvement Actions</h3>
          <p className="text-sm text-white/50">
            Run an AI Visibility analysis to get prioritized recommendations for improvement.
          </p>
        </div>
      ) : null}
    </div>
  )
}
