'use client'

import { useState, useMemo, useRef, useEffect, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Zap, ChevronDown, ChevronUp,
  TrendingUp, AlertCircle, CheckCircle, Filter, MessageSquare
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleCAskAiChatShell, type ModuleCAskAiChatTurn } from './ModuleCAskAiChatShell'
import { useGetModuleCResultQuery, useAskModuleCAIMutation, useGetModuleCSuggestedQuestionsMutation } from '@/store/api/module_C/moduleCApi'
import { useModuleCAnalysis } from '@/hooks/useModuleCAnalysis'
import ModuleCProgressLoader from './ModuleCProgressLoader'

interface ImprovementActionsProps {
  jobId?: string | null
  url?: string
  projectId?: string | null
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
  High: 'bg-red-50 text-red-700 border border-red-200',
  Medium: 'bg-amber-50 text-amber-700 border border-amber-200',
  Low: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
  high: 'bg-red-50 text-red-700 border border-red-200',
  medium: 'bg-amber-50 text-amber-700 border border-amber-200',
  low: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs shadow-lg"
      style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}
    >
      <p style={{ color: payload[0].payload.fill }} className="font-semibold">{payload[0].name}</p>
      <p className="font-bold" style={{ color: 'var(--nd-text-primary)' }}>{payload[0].value} actions</p>
    </div>
  )
}

function ActionCard({ action, index }: { action: any; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const priority = action.priority ?? 'Low'
  const impact = action.impact_points ?? action.impact ?? 0
  const type = action.type ?? action.action_type ?? ''
  const category = action.category ?? action.aivs_dimension ?? ''
  const description = action.action ?? action.description ?? action.suggestion ?? action.recommendation ?? ''

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--nd-border)' }}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start justify-between gap-3 p-3.5 text-left transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--nd-nav-hover-bg)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-[10px] font-mono w-5 shrink-0 pt-0.5 text-right" style={{ color: 'var(--nd-text-muted)' }}>{index + 1}</span>
          <div className="min-w-0">
            <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--nd-text-primary)' }}>{description}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {type && (
                <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: 'var(--nd-bg)', color: 'var(--nd-text-muted)', border: '1px solid var(--nd-border)' }}>{type}</span>
              )}
              {category && (
                <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' }}>{category}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div>
            <div className="flex items-center justify-end gap-1 mb-1">
              <span className="text-[9px]" style={{ color: 'var(--nd-text-muted)' }}>impact</span>
              <FieldTooltip description={TOOLTIPS.actionImpact} />
            </div>
            <span className="text-xs font-bold text-emerald-600 text-right block">+{typeof impact === 'number' ? impact.toFixed(1) : impact}</span>
          </div>
          <Badge className={cn('text-[10px]', PRIORITY_BADGE[priority] ?? PRIORITY_BADGE['Low'])}>
            {priority}
          </Badge>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--nd-text-muted)' }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--nd-text-muted)' }} />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {[
              { label: 'Type', val: type || 'N/A', tip: TOOLTIPS.actionType },
              { label: 'Category', val: category || 'N/A', tip: TOOLTIPS.actionCategory },
              { label: 'Priority', val: priority, tip: TOOLTIPS.highPriority },
              { label: 'Estimated Impact', val: `+${typeof impact === 'number' ? impact.toFixed(1) : impact} pts`, tip: TOOLTIPS.actionImpact },
            ].filter(({ val }) => val && val !== 'N/A').map(({ label, val, tip }) => (
              <div key={label} className="rounded-lg p-2.5" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--nd-text-muted)' }}>{label}</span>
                  <FieldTooltip description={tip} />
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--nd-text-primary)' }}>{val}</span>
              </div>
            ))}
          </div>
          {description && description.length > 100 && (
            <div className="mt-3">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--nd-text-muted)' }}>Full Description</span>
                <FieldTooltip description={TOOLTIPS.actionDescription} />
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-primary)' }}>{description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ImprovementActions({ jobId, url, projectId }: ImprovementActionsProps) {
  const [filterPriority, setFilterPriority] = useState<'All' | 'High' | 'Medium' | 'Low'>('All')
  const [filterCategory, setFilterCategory] = useState<string>('All')
  const [askModuleCAI, { isLoading: isAskingAI, error: askAIError, reset: resetAskAI }] = useAskModuleCAIMutation()
  const [getSuggestedQuestions] = useGetModuleCSuggestedQuestionsMutation()
  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ModuleCAskAiChatTurn[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const { data: moduleCData, isLoading: isLoadingData, refetch: refetchData } = useGetModuleCResultQuery({ jobId: jobId || '', url }, {
    skip: !jobId, refetchOnMountOrArgChange: true,
  })
  const { isAnalyzing, progress, phaseLabel, runAnalysis } = useModuleCAnalysis({
    jobId,
    url: url || '',
    onCompleted: refetchData,
  })

  const handleRunAnalysis = async () => {
    try {
      await runAnalysis()
    } catch (e) { console.error(e) }
  }

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
  const scoreDelta = pageAct?.predicted_llm_friendliness_delta ?? Math.max(0, predictedScore - currentScore)

  const actions: any[] = useMemo(() => {
    const rawActions: any[] = pageAct?.actions ?? []
    const totalWeight = rawActions.reduce((sum, action) => {
      const weight = typeof action?.dimension_weight === 'number' ? action.dimension_weight : 0
      return sum + Math.max(weight, 0)
    }, 0)

    const priorityRank: Record<string, number> = { High: 0, Medium: 1, Low: 2, high: 0, medium: 1, low: 2 }

    return rawActions
      .map((action) => {
        const explicitImpact = typeof action?.impact_points === 'number'
          ? action.impact_points
          : typeof action?.impact === 'number'
            ? action.impact
            : null

        const derivedImpact = explicitImpact ?? (
          totalWeight > 0 && typeof action?.dimension_weight === 'number'
            ? Number(((scoreDelta * action.dimension_weight) / totalWeight).toFixed(1))
            : 0
        )

        return {
          ...action,
          impact_points: derivedImpact,
          impact: derivedImpact,
          category: action.category ?? action.aivs_dimension ?? '',
          description: action.action ?? action.description ?? action.suggestion ?? action.recommendation ?? '',
        }
      })
      .sort((left, right) => {
        const priorityDiff = (priorityRank[left.priority] ?? 99) - (priorityRank[right.priority] ?? 99)
        if (priorityDiff !== 0) return priorityDiff
        return (right.impact_points ?? 0) - (left.impact_points ?? 0)
      })
  }, [pageAct, scoreDelta])

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
    { name: 'Current', score: Math.round(currentScore), fill: '#5347CE' },
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

  useEffect(() => {
    if (!askDialogOpen || !chatScrollRef.current) return
    const el = chatScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [askDialogOpen, chatMessages, isAskingAI])

  const chatMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const openAskAiDialog = async () => {
    if (!projectId) return
    resetAskAI()
    setChatMessages([])
    setChatInput('')
    setAskDialogOpen(true)
    try {
      const res = await getSuggestedQuestions({ project_id: projectId }).unwrap()
      setSuggestions(Array.isArray(res?.questions) ? res.questions.filter(Boolean).slice(0, 12) : [])
    } catch {
      setSuggestions([])
    }
  }

  const submitAskAi = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!projectId || !chatInput.trim() || isAskingAI) return
    const question = chatInput.trim()
    setChatInput('')
    const priorHistory = chatMessages.slice(-6).map((m) => ({ role: m.role, content: m.content }))
    const userTurn: ModuleCAskAiChatTurn = { id: chatMessageId(), role: 'user', content: question }
    setChatMessages((prev) => [...prev, userTurn])
    try {
      const res = await askModuleCAI({
        project_id: projectId,
        job_id: jobId || undefined,
        question,
        conversation_history: priorHistory.length ? priorHistory : undefined,
      }).unwrap()
      const text = res?.answer?.trim() || res?.data?.answer?.trim() || ''
      const sources = res?.sources || res?.data?.sources
      if (!text) return
      setChatMessages((prev) => [...prev, { id: chatMessageId(), role: 'assistant', content: text, sources }])
    } catch {
      setChatMessages((prev) => prev.filter((m) => m.id !== userTurn.id))
      setChatInput(question)
    }
  }

  const runMetricAskAi = async (displayLabel: string, prompt: string) => {
    if (!projectId || !jobId || isAskingAI) return
    resetAskAI()
    setChatInput('')
    setChatMessages([{ id: chatMessageId(), role: 'user', content: `Explain: ${displayLabel}` }])
    setAskDialogOpen(true)
    try {
      const res = await askModuleCAI({
        project_id: projectId,
        job_id: jobId,
        question: prompt,
      }).unwrap()
      const text = res?.answer?.trim() || res?.data?.answer?.trim() || ''
      const sources = res?.sources || res?.data?.sources
      if (!text) return
      setChatMessages((prev) => [...prev, { id: chatMessageId(), role: 'assistant', content: text, sources }])
    } catch {
      setChatMessages([])
      setAskDialogOpen(false)
    }
  }

  return (
    <div className="space-y-5">
      <Dialog
        open={askDialogOpen}
        onOpenChange={(open) => {
          setAskDialogOpen(open)
          if (!open) {
            resetAskAI()
            setChatMessages([])
            setChatInput('')
          }
        }}
      >
        <DialogContent
          className={cn(
            'w-[calc(100vw-1rem)] max-h-[95vh] gap-0 overflow-visible border-0 bg-transparent p-0 pt-10 shadow-none sm:max-w-3xl lg:max-w-5xl',
            'data-[state=open]:zoom-in-[0.98]',
          )}
          showCloseButton
        >
          <ModuleCAskAiChatShell
            chatScrollRef={chatScrollRef}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            isAskingAI={isAskingAI}
            askAIError={askAIError}
            onSubmit={submitAskAi}
            onSuggestionClick={(text) => setChatInput(text)}
            suggestions={suggestions}
          />
        </DialogContent>
      </Dialog>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Improvement Actions</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--nd-text-secondary)' }}>Prioritised fixes to maximise your AI Visibility score</p>
        </div>
        <button
          type="button"
          onClick={openAskAiDialog}
          disabled={!projectId || isAskingAI}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border-0 px-5 py-2.5 text-sm font-extrabold uppercase tracking-wider text-black shadow-lg shadow-fuchsia-950/30',
            'bg-linear-to-r from-purple-500 via-pink-500 to-amber-300 hover:opacity-95',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <MessageSquare className="size-4 shrink-0" />
          Ask AI
        </button>
      </div>

      {isLoadingData && (
        <div
          className="flex items-center justify-center p-16 rounded-2xl"
          style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}
        >
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--nd-purple)' }} />
            <p className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>Loading...</p>
          </div>
        </div>
      )}

      {isAnalyzing && (
        <ModuleCProgressLoader
          progress={progress}
          phaseLabel={phaseLabel}
          title="Preparing Improvement Actions"
        />
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
          <div className="rounded-2xl p-5" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Score Improvement Potential</span>
              <FieldTooltip description="The projected improvement in your LLM Friendliness score if all recommended actions are implemented." />
              <button
                type="button"
                onClick={() =>
                  runMetricAskAi(
                    'Score Improvement Potential',
                    `Interpret this projected score improvement and explain what drives the delta.\n${JSON.stringify({
                      current_llm_friendliness: currentScore,
                      predicted_llm_friendliness: predictedScore,
                      predicted_llm_friendliness_delta: scoreDelta,
                    })}`,
                  )
                }
                disabled={!projectId || !jobId || isAskingAI}
                className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40"
                style={{ color: 'var(--nd-purple)', background: 'var(--nd-purple-subtle)', borderColor: 'rgba(83,71,206,0.25)' }}
              >
                <MessageSquare className="size-3" />
                Ask AI
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              {/* Score visual */}
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl p-4 text-center" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                    <div className="flex justify-center items-center gap-1 mb-1">
                      <span className="text-[10px]" style={{ color: 'var(--nd-text-secondary)' }}>Current</span>
                      <FieldTooltip description={TOOLTIPS.currentScore} />
                    </div>
                    <span className="text-3xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{Math.round(currentScore)}</span>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                    <div className="flex justify-center items-center gap-1 mb-1">
                      <span className="text-[10px] text-emerald-600">Potential</span>
                      <FieldTooltip description={TOOLTIPS.scoreDelta} />
                    </div>
                    <span className="text-3xl font-bold text-emerald-600">+{scoreDelta}</span>
                  </div>
                  <div className="rounded-xl p-4 text-center" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                    <div className="flex justify-center items-center gap-1 mb-1">
                      <span className="text-[10px] text-blue-600">Predicted</span>
                      <FieldTooltip description={TOOLTIPS.predictedScore} />
                    </div>
                    <span className="text-3xl font-bold text-blue-600">{Math.round(predictedScore)}</span>
                  </div>
                </div>

                {/* Visual progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs" style={{ color: 'var(--nd-text-muted)' }}>
                    <span className="flex items-center gap-1">Current: {Math.round(currentScore)} <FieldTooltip description={TOOLTIPS.currentScore} /></span>
                    <span className="flex items-center gap-1">Target: {Math.round(predictedScore)} <FieldTooltip description={TOOLTIPS.predictedScore} /></span>
                  </div>
                  <div className="h-4 rounded-full overflow-hidden relative" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                    <div className="absolute inset-y-0 left-0 transition-all duration-700" style={{ width: `${Math.min(currentScore, 100)}%`, background: 'rgba(83,71,206,0.35)' }} />
                    <div className="absolute inset-y-0 left-0 transition-all duration-700" style={{ width: `${Math.min(predictedScore, 100)}%`, background: 'rgba(16,185,129,0.45)' }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--nd-text-primary)' }}>{Math.round(currentScore)} → {Math.round(predictedScore)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bar chart */}
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={scoreBarData} barCategoryGap="40%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nd-border)" />
                    <XAxis dataKey="name" tick={{ fill: '#737890', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#737890', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="rounded-xl px-3 py-2 text-xs shadow-lg" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
                          <p className="font-semibold" style={{ color: 'var(--nd-text-primary)' }}>{label}: <span className="font-bold">{payload[0].value}</span></p>
                        </div>
                      )
                    }} cursor={{ fill: 'rgba(83,71,206,0.04)' }} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]} name="Score">
                    {scoreBarData.map((_: any, idx: number) => <Cell key={idx} fill={scoreBarData[idx].fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SECTION 2: Priority Breakdown */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Priority Breakdown</span>
              <FieldTooltip description="Distribution of recommended actions by priority level." />
              <button
                type="button"
                onClick={() =>
                  runMetricAskAi(
                    'Priority Breakdown',
                    `Explain this action priority distribution and recommended implementation order.\n${JSON.stringify({
                      total_actions: totalActions,
                      high_priority: highPriority,
                      medium_priority: mediumPriority,
                      low_priority: lowPriority,
                    })}`,
                  )
                }
                disabled={!projectId || !jobId || isAskingAI}
                className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40"
                style={{ color: 'var(--nd-purple)', background: 'var(--nd-purple-subtle)', borderColor: 'rgba(83,71,206,0.25)' }}
              >
                <MessageSquare className="size-3" />
                Ask AI
              </button>
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
                        <span className="text-xs" style={{ color: 'var(--nd-text-primary)' }}>{name}</span>
                        <span className="text-xs font-bold ml-auto pl-4" style={{ color: 'var(--nd-text-primary)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                {[
                  { label: 'Total Actions', val: totalActions, tip: TOOLTIPS.totalActions, textStyle: { color: 'var(--nd-text-primary)', fontWeight: 700 } },
                  { label: 'High Priority', val: highPriority, tip: TOOLTIPS.highPriority, textStyle: { color: '#DC2626', fontWeight: 700 } },
                  { label: 'Medium Priority', val: mediumPriority, tip: TOOLTIPS.mediumPriority, textStyle: { color: '#D97706', fontWeight: 700 } },
                  { label: 'Low Priority', val: lowPriority, tip: TOOLTIPS.lowPriority, textStyle: { color: '#4A5068', fontWeight: 700 } },
                ].map(({ label, val, tip, textStyle }) => (
                  <div key={label} className="flex justify-between items-center py-2 border-b last:border-0" style={{ borderColor: 'var(--nd-border)' }}>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium" style={{ color: 'var(--nd-text-primary)' }}>{label}</span>
                      <FieldTooltip description={tip} />
                    </div>
                    <span className="text-sm font-bold" style={textStyle}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION 3: Actions List */}
          {actions.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Recommended Actions</span>
                <FieldTooltip description="Complete list of improvements, ordered by priority. Click any action to see full details." />
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full ml-auto" style={{ background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>
                  {filteredActions.length} of {actions.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    runMetricAskAi(
                      'Recommended Actions',
                      `Review these recommended actions and provide an execution plan grouped by impact and effort.\n${JSON.stringify({
                        total_actions: actions.length,
                        filtered_actions: filteredActions.slice(0, 20),
                        active_priority_filter: filterPriority,
                        active_category_filter: filterCategory,
                      })}`,
                    )
                  }
                  disabled={!projectId || !jobId || isAskingAI}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40"
                  style={{ color: 'var(--nd-purple)', background: 'var(--nd-purple-subtle)', borderColor: 'rgba(83,71,206,0.25)' }}
                >
                  <MessageSquare className="size-3" />
                  Ask AI
                </button>
              </div>

              {/* Filters */}
              <div className="flex gap-2 flex-wrap mb-4">
                <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--nd-text-secondary)' }}>
                  <Filter className="w-3 h-3" />
                  <span>Priority:</span>
                </div>
                {(['All', 'High', 'Medium', 'Low'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilterPriority(p)}
                    className="text-xs px-2.5 py-1 rounded-lg border transition-all"
                    style={
                      filterPriority === p
                        ? { background: 'var(--nd-purple-subtle)', borderColor: 'rgba(83,71,206,0.3)', color: 'var(--nd-purple)' }
                        : { background: 'transparent', borderColor: 'var(--nd-border)', color: 'var(--nd-text-muted)' }
                    }
                  >
                    {p}
                  </button>
                ))}
                {categories.length > 1 && (
                  <>
                    <div className="flex items-center gap-1 text-[10px] ml-2" style={{ color: 'var(--nd-text-secondary)' }}>
                      <span>Category:</span>
                    </div>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setFilterCategory(cat)}
                        className="text-xs px-2.5 py-1 rounded-lg border transition-all"
                        style={
                          filterCategory === cat
                            ? { background: 'var(--nd-purple-subtle)', borderColor: 'rgba(83,71,206,0.3)', color: 'var(--nd-purple)' }
                            : { background: 'transparent', borderColor: 'var(--nd-border)', color: 'var(--nd-text-muted)' }
                        }
                      >
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
                  <div className="flex items-center justify-center py-8" style={{ color: 'var(--nd-text-muted)' }}>
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
