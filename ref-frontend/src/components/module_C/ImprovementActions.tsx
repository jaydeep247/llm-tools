'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Zap, RefreshCw, ChevronDown, ChevronUp,
  TrendingUp, AlertCircle, CheckCircle, Filter
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'
import { useGetModuleCResultQuery, useRunModuleCAnalysisMutation } from '@/store/api/module_C/moduleCApi'
import { useGetJobStatusQuery } from '@/store/api/jobApi'

interface ImprovementActionsProps {
  jobId?: string | null
  url?: string
}

const TOOLTIPS = {
  totalActions: 'Total number of recommended improvements identified for this page.',
  highPriority: 'Actions with the largest individual impact on your LLM Friendliness score. Address these first.',
  mediumPriority: 'Moderate-impact improvements. Recommended after completing high-priority actions.',
  lowPriority: 'Minor improvements. Nice to have but low urgency.',
  currentScore: 'Your current LLM Friendliness score — how well AI models can understand your page right now.',
  predictedScore: 'Projected LLM Friendliness score after implementing all recommended actions.',
  scoreDelta: 'Total score improvement available by implementing all recommended actions.',
  actionType: 'The category of action required — e.g., schema markup, content addition, technical fix, entity enrichment.',
  actionImpact: 'Estimated impact of this individual action on your overall LLM Friendliness score.',
  actionCategory: 'High-level category grouping for this action (Content, Technical, Entity, Schema).',
  actionDescription: 'Detailed description of what needs to be changed and why it will improve AI visibility.',
}

const PRIORITY_COLORS: Record<string, string> = {
  High: '#ef4444',
  Medium: '#f59e0b',
  Low: '#6b7280',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
}

const PRIORITY_BADGE: Record<string, string> = {
  High: 'bg-red-500/15 text-red-300 border border-red-500/20',
  Medium: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/20',
  Low: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/20',
  high: 'bg-red-500/15 text-red-300 border border-red-500/20',
  medium: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/20',
  low: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/20',
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs shadow-2xl">
      <p style={{ color: payload[0].payload.fill }} className="font-semibold">{payload[0].name}</p>
      <p className="text-white font-bold">{payload[0].value} actions</p>
    </div>
  )
}

function ActionCard({ action, index }: { action: any; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const priority = action.priority ?? 'Low'
  const impact = action.impact ?? 0
  const type = action.type ?? action.action_type ?? ''
  const category = action.category ?? ''
  const description = action.description ?? action.suggestion ?? action.recommendation ?? ''

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start justify-between gap-3 p-3.5 hover:bg-zinc-800/40 transition-colors text-left">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-[10px] text-zinc-600 font-mono w-5 shrink-0 pt-0.5 text-right">{index + 1}</span>
          <div className="min-w-0">
            <p className="text-xs text-zinc-200 leading-relaxed line-clamp-2">{description}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {type && (
                <span className="text-[10px] bg-zinc-700/50 text-zinc-400 rounded px-1.5 py-0.5">{type}</span>
              )}
              {category && (
                <span className="text-[10px] bg-blue-500/10 text-blue-300 rounded px-1.5 py-0.5">{category}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div>
            <div className="flex items-center justify-end gap-1 mb-1">
              <span className="text-[9px] text-zinc-600">impact</span>
              <FieldTooltip description={TOOLTIPS.actionImpact} />
            </div>
            <span className="text-xs font-bold text-emerald-400 text-right block">+{typeof impact === 'number' ? impact.toFixed(1) : impact}</span>
          </div>
          <Badge className={cn('text-[10px]', PRIORITY_BADGE[priority] ?? PRIORITY_BADGE['Low'])}>
            {priority}
          </Badge>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-800/50 bg-zinc-800/20">
          <div className="grid grid-cols-2 gap-3 mt-2">
            {[
              { label: 'Type', val: type || 'N/A', tip: TOOLTIPS.actionType },
              { label: 'Category', val: category || 'N/A', tip: TOOLTIPS.actionCategory },
              { label: 'Priority', val: priority, tip: TOOLTIPS.highPriority },
              { label: 'Estimated Impact', val: `+${typeof impact === 'number' ? impact.toFixed(1) : impact} pts`, tip: TOOLTIPS.actionImpact },
            ].filter(({ val }) => val && val !== 'N/A').map(({ label, val, tip }) => (
              <div key={label} className="bg-zinc-800/50 rounded-lg p-2.5">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] text-zinc-500 uppercase tracking-wide">{label}</span>
                  <FieldTooltip description={tip} />
                </div>
                <span className="text-xs text-zinc-200 font-medium">{val}</span>
              </div>
            ))}
          </div>
          {description && description.length > 100 && (
            <div className="mt-3">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-[9px] text-zinc-500 uppercase tracking-wide">Full Description</span>
                <FieldTooltip description={TOOLTIPS.actionDescription} />
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ImprovementActions({ jobId, url }: ImprovementActionsProps) {
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<'All' | 'High' | 'Medium' | 'Low'>('All')
  const [filterCategory, setFilterCategory] = useState<string>('All')

  const { data: moduleCData, isLoading: isLoadingData, refetch: refetchData } = useGetModuleCResultQuery(jobId || '', {
    skip: !jobId, refetchOnMountOrArgChange: true,
  })
  const [runAnalysis, { isLoading: isRunning }] = useRunModuleCAnalysisMutation()
  const { data: analysisJobData } = useGetJobStatusQuery(analysisJobId || '', {
    skip: !analysisJobId, pollingInterval: analysisJobId ? 2000 : 0,
  })

  useEffect(() => {
    const status = analysisJobData?.status?.toUpperCase()
    if (status === 'COMPLETED') { setAnalysisJobId(null); refetchData() }
    else if (status === 'FAILED') { setAnalysisJobId(null) }
  }, [analysisJobData, refetchData])

  const handleRunAnalysis = async () => {
    if (!jobId) return
    try {
      const result = await runAnalysis({ jobId, url: url || '' }).unwrap()
      if (result.data?.analysisJobId) setAnalysisJobId(result.data.analysisJobId)
    } catch (e) { console.error(e) }
  }

  const isAnalyzing = isRunning || !!analysisJobId
  const result = moduleCData?.data
  const modules = result?.modules || {}
  const hasData = !!result

  const pageAct = modules.page_actions as any
  const totalActions = pageAct?.total_actions ?? 0
  const highPriority = pageAct?.high_priority ?? 0
  const mediumPriority = pageAct?.medium_priority ?? 0
  const lowPriority = pageAct?.low_priority ?? 0
  const currentScore = pageAct?.current_llm_friendliness ?? 0
  const predictedScore = pageAct?.predicted_llm_friendliness ?? 0
  const scoreDelta = pageAct?.predicted_llm_friendliness_delta ?? 0
  const actions: any[] = pageAct?.actions ?? []

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>(actions.map(a => a.category ?? '').filter(Boolean))
    return ['All', ...Array.from(cats)]
  }, [actions])

  // Priority pie chart
  const priorityPie = useMemo(() => [
    { name: 'High', value: highPriority, fill: '#ef4444' },
    { name: 'Medium', value: mediumPriority, fill: '#f59e0b' },
    { name: 'Low', value: lowPriority, fill: '#6b7280' },
  ].filter(d => d.value > 0), [highPriority, mediumPriority, lowPriority])

  // Score improvement bar chart
  const scoreBarData = useMemo(() => [
    { name: 'Current', score: Math.round(currentScore), fill: '#6b7280' },
    { name: 'Predicted', score: Math.round(predictedScore), fill: '#10b981' },
  ], [currentScore, predictedScore])

  // Filtered actions
  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      const priorityMatch = filterPriority === 'All' || (a.priority ?? '').toLowerCase() === filterPriority.toLowerCase()
      const categoryMatch = filterCategory === 'All' || (a.category ?? '') === filterCategory
      return priorityMatch && categoryMatch
    })
  }, [actions, filterPriority, filterCategory])

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Improvement Actions</h2>
          <p className="text-sm text-zinc-400 mt-0.5">Prioritised fixes to maximise your AI Visibility score</p>
        </div>
        {hasData && (
          <Button onClick={handleRunAnalysis} disabled={!jobId || isAnalyzing} variant="outline" size="sm"
            className="bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
            <RefreshCw className={cn('w-4 h-4 mr-2', isAnalyzing && 'animate-spin')} />
            Re-analyze
          </Button>
        )}
      </div>

      {(isLoadingData || isAnalyzing) && (
        <div className="flex items-center justify-center p-16 border border-zinc-800 rounded-2xl bg-zinc-800/30">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm text-zinc-400">{isAnalyzing ? 'Running analysis...' : 'Loading...'}</p>
          </div>
        </div>
      )}

      {!hasData && !isLoadingData && !isAnalyzing && jobId && (
        <AnalysisEmptyState
          icon={<Zap className="w-8 h-8 text-zinc-600" />}
          title="No Improvement Actions Yet"
          description="Run an analysis to generate a prioritised list of AI visibility improvements."
          onRunAnalysis={handleRunAnalysis}
          isAnalyzing={isAnalyzing}
        />
      )}

      {hasData && !isLoadingData && !isAnalyzing && (
        <>
          {/* SECTION 1: Score Transformation */}
          <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">Score Improvement Potential</span>
              <FieldTooltip description="The projected improvement in your LLM Friendliness score if all recommended actions are implemented." />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              {/* Score visual */}
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                    <div className="flex justify-center items-center gap-1 mb-1">
                      <span className="text-[10px] text-zinc-500">Current</span>
                      <FieldTooltip description={TOOLTIPS.currentScore} />
                    </div>
                    <span className="text-3xl font-bold text-zinc-300">{Math.round(currentScore)}</span>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                    <div className="flex justify-center items-center gap-1 mb-1">
                      <span className="text-[10px] text-emerald-400">Potential</span>
                      <FieldTooltip description={TOOLTIPS.scoreDelta} />
                    </div>
                    <span className="text-3xl font-bold text-emerald-400">+{scoreDelta}</span>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
                    <div className="flex justify-center items-center gap-1 mb-1">
                      <span className="text-[10px] text-blue-400">Predicted</span>
                      <FieldTooltip description={TOOLTIPS.predictedScore} />
                    </div>
                    <span className="text-3xl font-bold text-blue-400">{Math.round(predictedScore)}</span>
                  </div>
                </div>

                {/* Visual progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span className="flex items-center gap-1">Current: {Math.round(currentScore)} <FieldTooltip description={TOOLTIPS.currentScore} /></span>
                    <span className="flex items-center gap-1">Target: {Math.round(predictedScore)} <FieldTooltip description={TOOLTIPS.predictedScore} /></span>
                  </div>
                  <div className="h-4 bg-zinc-800 rounded-full overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 bg-zinc-600 transition-all duration-700" style={{ width: `${Math.min(currentScore, 100)}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-emerald-500/40 transition-all duration-700" style={{ width: `${Math.min(predictedScore, 100)}%` }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-semibold text-white">{Math.round(currentScore)} → {Math.round(predictedScore)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bar chart */}
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={scoreBarData} barCategoryGap="40%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs shadow-xl">
                        <p className="text-zinc-300 font-semibold">{label}: <span className="text-white font-bold">{payload[0].value}</span></p>
                      </div>
                    )
                  }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]} name="Score">
                    {scoreBarData.map((_: any, idx: number) => <Cell key={idx} fill={scoreBarData[idx].fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SECTION 2: Priority Breakdown */}
          <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-white">Priority Breakdown</span>
              <FieldTooltip description="Distribution of recommended actions by priority level." />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              {priorityPie.length > 0 ? (
                <div className="flex gap-6 items-center justify-center">
                  <ResponsiveContainer width={150} height={150}>
                    <PieChart>
                      <Pie data={priorityPie} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" strokeWidth={0}>
                        {priorityPie.map((_: any, idx: number) => <Cell key={idx} fill={priorityPie[idx].fill} />)}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {priorityPie.map(({ name, value, fill }) => (
                      <div key={name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: fill }} />
                        <span className="text-xs text-zinc-400">{name}</span>
                        <span className="text-xs font-bold text-white ml-auto pl-4">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                {[
                  { label: 'Total Actions', val: totalActions, tip: TOOLTIPS.totalActions, color: 'text-white' },
                  { label: 'High Priority', val: highPriority, tip: TOOLTIPS.highPriority, color: 'text-red-400' },
                  { label: 'Medium Priority', val: mediumPriority, tip: TOOLTIPS.mediumPriority, color: 'text-yellow-400' },
                  { label: 'Low Priority', val: lowPriority, tip: TOOLTIPS.lowPriority, color: 'text-zinc-400' },
                ].map(({ label, val, tip, color }) => (
                  <div key={label} className="flex justify-between items-center py-2 border-b border-zinc-800/60 last:border-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-zinc-400">{label}</span>
                      <FieldTooltip description={tip} />
                    </div>
                    <span className={cn('text-sm font-bold', color)}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION 3: Actions List */}
          {actions.length > 0 && (
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-white">Recommended Actions</span>
                <FieldTooltip description="Complete list of improvements, ordered by priority. Click any action to see full details." />
                <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 text-xs ml-auto">
                  {filteredActions.length} of {actions.length}
                </Badge>
              </div>

              {/* Filters */}
              <div className="flex gap-2 flex-wrap mb-4">
                <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <Filter className="w-3 h-3" />
                  <span>Priority:</span>
                </div>
                {(['All', 'High', 'Medium', 'Low'] as const).map((p) => (
                  <button key={p} onClick={() => setFilterPriority(p)}
                    className={cn('text-xs px-2.5 py-1 rounded-lg border transition-all',
                      filterPriority === p
                        ? 'bg-zinc-700 border-zinc-600 text-white'
                        : 'bg-transparent border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                    )}>
                    {p}
                  </button>
                ))}
                {categories.length > 1 && (
                  <>
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500 ml-2">
                      <span>Category:</span>
                    </div>
                    {categories.map((cat) => (
                      <button key={cat} onClick={() => setFilterCategory(cat)}
                        className={cn('text-xs px-2.5 py-1 rounded-lg border transition-all',
                          filterCategory === cat
                            ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                            : 'bg-transparent border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                        )}>
                        {cat}
                      </button>
                    ))}
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {filteredActions.length > 0 ? (
                  filteredActions.map((action: any, i: number) => (
                    <ActionCard key={action.id ?? i} action={action} index={i} />
                  ))
                ) : (
                  <div className="flex items-center justify-center py-8 text-zinc-500">
                    <div className="text-center">
                      <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-40" />
                      <p className="text-xs">No actions match the current filters</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
