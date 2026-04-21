'use client'

import { useState, useMemo, useRef, useEffect, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Eye, MessageSquare, CheckCircle, XCircle,
  AlertCircle, ChevronDown, ChevronUp, Bot, Sparkles
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar
} from 'recharts'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleCAskAiChatShell, type ModuleCAskAiChatTurn } from './ModuleCAskAiChatShell'
import { useGetModuleCResultQuery, useAskModuleCAIMutation, useGetModuleCSuggestedQuestionsMutation } from '@/store/api/module_C/moduleCApi'
import { useModuleCAnalysis } from '@/hooks/useModuleCAnalysis'
import ModuleCProgressLoader from './ModuleCProgressLoader'

interface AIAnswerPreviewProps {
  jobId?: string | null
  url?: string
  projectId?: string | null
}

const TOOLTIPS = {
  completenessScore: 'Overall answer completeness score (0-100). Higher means your page better answers likely AI-generated questions about your topic.',
  fullyAnswered: 'Questions for which the page provides a sufficiently complete answer for AI to cite confidently.',
  partiallyAnswered: 'Questions where only partial information is available. AI may still cite but with caveats.',
  notAnswered: 'Questions with no relevant information on the page. These represent citation gaps.',
  questionsGenerated: 'Total number of likely user questions generated for your page topic and type.',
  promptsUsed: 'The exact prompts sent to LLM simulators to test how AI models respond to queries about your brand.',
  rawAnswer: 'Verbatim response from the LLM simulator for this model and query. This is what users see when they ask AI about you.',
  evidence: 'The specific quote or passage from your page that was used (or should be used) to answer this question.',
  missingQuestions: 'Questions that could not be answered at all from your page content.',
  partialQuestions: 'Questions with incomplete answers found on your page.',
  gaps: 'Specific information gaps identified per question.',
  modelAccuracy: 'How accurately this model responds about your brand based on your page content.',
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-(--nd-border) rounded-xl px-3 py-2 text-xs shadow-lg">
      <p style={{ color: payload[0].payload.fill }} className="font-semibold">{payload[0].name}</p>
      <p className="text-(--nd-text-primary) font-bold">{payload[0].value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const lower = (status ?? '').toLowerCase()
  const isFullyAnswered = lower === 'fully_answered' || lower === 'fully answered' || lower === 'answered'
  const isPartial = lower === 'partially_answered' || lower === 'partial' || lower.includes('partial')
  if (isFullyAnswered) return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Answered</Badge>
  if (isPartial) return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Partial</Badge>
  return <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">Not Answered</Badge>
}

function QuestionRow({ q, index }: { q: any; index: number }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-(--nd-border) rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start justify-between gap-3 p-3 hover:bg-(--nd-bg) transition-colors text-left">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="text-xs text-(--nd-text-muted) font-mono w-5 shrink-0 pt-0.5">Q{index + 1}</span>
          <span className="text-xs text-(--nd-text-primary) leading-relaxed">{q.question}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={q.status} />
          {expanded ? <ChevronUp className="w-3 h-3 text-(--nd-text-muted)" /> : <ChevronDown className="w-3 h-3 text-(--nd-text-muted)" />}
        </div>
      </button>
      {expanded && q.evidence !== undefined && (
        <div className="px-4 pb-4 pt-1 border-t border-(--nd-border)">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-xs font-medium text-(--nd-text-secondary) uppercase tracking-wide">Evidence / Gap</span>
            <FieldTooltip description={TOOLTIPS.evidence} />
          </div>
          <p className="text-xs text-(--nd-text-secondary) leading-relaxed bg-(--nd-bg) rounded-lg p-3">{q.evidence || 'No evidence found on page.'}</p>
        </div>
      )}
    </div>
  )
}

export default function AIAnswerPreview({ jobId, url, projectId }: AIAnswerPreviewProps) {
  const [activeModelTab, setActiveModelTab] = useState<'openai' | 'gemini' | 'claude'>('gemini')
  const [showAllPrompts, setShowAllPrompts] = useState(false)
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

  const answerComp = modules.answer_completeness as any
  const llmSim = modules.llm_simulator as any

  const completenessScore = answerComp?.completeness_score ?? 0
  const fullyAnswered = answerComp?.fully_answered ?? 0
  const partiallyAnswered = answerComp?.partially_answered ?? 0
  const notAnswered = answerComp?.not_answered ?? 0
  const questionsGenerated = answerComp?.questions_generated ?? 0
  const results: any[] = answerComp?.results ?? []
  const missingQuestions: string[] = answerComp?.missing_questions ?? []
  const partialQuestions: string[] = answerComp?.partial_questions ?? []
  const gaps: any = answerComp?.gaps ?? {}

  const rawAnswers = llmSim?.raw_answers ?? {}
  const promptsUsed: string[] = llmSim?.prompts_used ?? []

  const pieData = useMemo(() => [
    { name: 'Fully Answered', value: fullyAnswered, fill: '#10b981' },
    { name: 'Partially Answered', value: partiallyAnswered, fill: '#f59e0b' },
    { name: 'Not Answered', value: notAnswered, fill: '#ef4444' },
  ].filter(d => d.value > 0), [fullyAnswered, partiallyAnswered, notAnswered])

  const scoreColor = completenessScore >= 70 ? 'text-emerald-600'
    : completenessScore >= 50 ? 'text-amber-600'
    : completenessScore >= 30 ? 'text-orange-600' : 'text-red-600'

  const modelTabs = [
    { key: 'gemini' as const, label: 'Gemini', icon: '✦' },
    { key: 'openai' as const, label: 'OpenAI', icon: '○' },
    { key: 'claude' as const, label: 'Claude', icon: '◆' },
  ]

  const activeAnswers: string[] = (rawAnswers[activeModelTab] as string[]) ?? []

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
          <h2 className="nd-page-title">AI Answer Preview</h2>
          <p className="nd-page-subtitle mt-0.5">How accurately and completely AI models answer questions about your brand</p>
        </div>
        <button
          type="button"
          onClick={openAskAiDialog}
          disabled={!projectId || isAskingAI}
          className="nd-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MessageSquare className="size-4 shrink-0" />
          Ask AI
        </button>
      </div>

      {isLoadingData && (
        <div className="flex items-center justify-center p-16 border border-(--nd-border) rounded-2xl bg-white">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-(--nd-purple)" />
            <p className="text-sm text-(--nd-text-muted)">Loading...</p>
          </div>
        </div>
      )}

      {isAnalyzing && (
        <ModuleCProgressLoader
          progress={progress}
          phaseLabel={phaseLabel}
          title="Generating AI Answer Preview"
        />
      )}

      {!hasData && !isLoadingData && !isAnalyzing && jobId && (
        <AnalysisEmptyState
          icon={<Eye className="w-8 h-8 text-zinc-600" />}
          title="No Answer Preview Data"
          description="Run an analysis to see how AI models answer questions about your content."
          onRunAnalysis={handleRunAnalysis}
          isAnalyzing={isAnalyzing}
        />
      )}

      {hasData && !isLoadingData && !isAnalyzing && (
        <>
          {/* SECTION 1: Score Hero */}
          <div className="bg-white border border-(--nd-border) rounded-2xl p-6">
            <div className="mb-3">
              <button
                type="button"
                onClick={() =>
                  runMetricAskAi(
                    'Answer Completeness Score',
                    `Interpret this answer completeness snapshot and prioritize top improvements.\n${JSON.stringify({
                      completeness_score: completenessScore,
                      questions_generated: questionsGenerated,
                      fully_answered: fullyAnswered,
                      partially_answered: partiallyAnswered,
                      not_answered: notAnswered,
                    })}`,
                  )
                }
                disabled={!projectId || !jobId || isAskingAI}
                className="inline-flex items-center gap-1 rounded-full border border-(--nd-border) bg-(--nd-nav-active-bg) px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-(--nd-purple) disabled:opacity-40"
              >
                <MessageSquare className="size-3" />
                Ask AI
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              {/* Pie chart + legend */}
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 self-start">
                  <span className="text-sm font-semibold text-(--nd-text-primary)">Q&A Status Breakdown</span>
                  <FieldTooltip description="How many of the AI-generated questions are fully, partially, or not answered by your page content." />
                </div>
                {pieData.length > 0 ? (
                  <div className="flex gap-6 items-center">
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} dataKey="value" strokeWidth={0}>
                          {pieData.map((_: any, idx: number) => <Cell key={idx} fill={pieData[idx].fill} />)}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {pieData.map(({ name, value, fill }) => (
                        <div key={name} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: fill }} />
                          <span className="text-xs text-(--nd-text-muted)">{name}</span>
                          <span className="text-xs font-bold text-(--nd-text-primary) ml-auto pl-2">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-(--nd-text-muted)">No Q&A data available</p>
                )}
              </div>

              {/* Stats */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-(--nd-bg) rounded-xl p-4 text-center">
                    <div className="flex justify-center items-center gap-1 mb-1">
                        <span className="text-xs text-(--nd-text-secondary)">Completeness Score</span>
                      <FieldTooltip description={TOOLTIPS.completenessScore} />
                    </div>
                    <span className={cn('text-4xl font-bold', scoreColor)}>{completenessScore.toFixed(1)}</span>
                    <span className="text-xs text-(--nd-text-muted) block">/100</span>
                  </div>
                  <div className="bg-(--nd-bg) rounded-xl p-4 text-center">
                    <div className="flex justify-center items-center gap-1 mb-1">
                        <span className="text-xs text-(--nd-text-secondary)">Questions Tested</span>
                      <FieldTooltip description={TOOLTIPS.questionsGenerated} />
                    </div>
                    <span className="text-4xl font-bold text-blue-600">{questionsGenerated}</span>
                    <span className="text-xs text-(--nd-text-muted) block">total</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Fully Answered', val: fullyAnswered, tip: TOOLTIPS.fullyAnswered, color: 'text-emerald-600', icon: <CheckCircle className="w-3 h-3" /> },
                    { label: 'Partial', val: partiallyAnswered, tip: TOOLTIPS.partiallyAnswered, color: 'text-amber-600', icon: <AlertCircle className="w-3 h-3" /> },
                    { label: 'Not Answered', val: notAnswered, tip: TOOLTIPS.notAnswered, color: 'text-red-600', icon: <XCircle className="w-3 h-3" /> },
                  ].map(({ label, val, tip, color, icon }) => (
                    <div key={label} className="bg-(--nd-bg) rounded-xl p-3 text-center">
                      <div className="flex justify-center items-center gap-1 mb-1">
                        <span className={cn('opacity-70', color)}>{icon}</span>
                        <span className="text-xs text-(--nd-text-secondary)">{label}</span>
                        <FieldTooltip description={tip} />
                      </div>
                      <span className={cn('text-xl font-bold', color)}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Per-Question Results */}
          {results.length > 0 && (
            <div className="bg-white border border-(--nd-border) rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold text-(--nd-text-primary)">Question-by-Question Analysis</span>
                <FieldTooltip description="Each question was generated based on your page topic and tested against your content to see if an LLM could answer it." />
                <Badge className="bg-violet-50 text-violet-700 border-violet-200 text-xs ml-auto">{results.length} questions</Badge>
                <button
                  type="button"
                  onClick={() =>
                    runMetricAskAi(
                      'Question-by-Question Analysis',
                      `Review these question-level answer outcomes and explain the biggest answerability gaps.\n${JSON.stringify({
                        total_questions: results.length,
                        sample_results: results.slice(0, 10),
                      })}`,
                    )
                  }
                  disabled={!projectId || !jobId || isAskingAI}
                  className="inline-flex items-center gap-1 rounded-full border border-(--nd-border) bg-(--nd-nav-active-bg) px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-(--nd-purple) disabled:opacity-40"
                >
                  <MessageSquare className="size-3" />
                  Ask AI
                </button>
              </div>
              <div className="space-y-2">
                {results.map((q: any, i: number) => <QuestionRow key={i} q={q} index={i} />)}
              </div>
            </div>
          )}

          {/* Missing questions list */}
          {missingQuestions.length > 0 && (
            <div className="bg-white border border-(--nd-border) rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-semibold text-(--nd-text-primary)">Unanswerable Questions</span>
                <FieldTooltip description={TOOLTIPS.missingQuestions} />
                <Badge className="bg-red-50 text-red-700 border-red-200 text-xs ml-auto">{missingQuestions.length}</Badge>
              </div>
              <div className="space-y-2">
                {missingQuestions.map((q: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
                      <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                      <span className="text-xs text-red-700 leading-relaxed">{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gaps summary */}
          {Object.keys(gaps).length > 0 && (
            <div className="bg-white border border-(--nd-border) rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-(--nd-text-primary)">Identified Gaps</span>
                <FieldTooltip description={TOOLTIPS.gaps} />
              </div>
              <div className="space-y-2">
                {Object.entries(gaps).slice(0, 6).map(([q, gap]: [string, any], i) => (
                    <div key={i} className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-xs font-medium text-amber-700 mb-1">{q}</p>
                      <p className="text-xs text-amber-600">{typeof gap === 'string' ? gap : JSON.stringify(gap)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: Prompts Used */}
          {promptsUsed.length > 0 && (
            <div className="bg-white border border-(--nd-border) rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-(--nd-text-primary)">Prompts Sent to LLMs</span>
                <FieldTooltip description={TOOLTIPS.promptsUsed} />
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs ml-auto">{promptsUsed.length} prompts</Badge>
              </div>
              <div className="space-y-2">
                {(showAllPrompts ? promptsUsed : promptsUsed.slice(0, 3)).map((prompt: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 bg-(--nd-bg) border border-(--nd-border) rounded-xl">
                      <span className="text-xs text-(--nd-text-muted) font-mono w-5 shrink-0 pt-0.5">P{i + 1}</span>
                      <span className="text-xs text-(--nd-text-secondary) leading-relaxed">{prompt}</span>
                  </div>
                ))}
              </div>
              {promptsUsed.length > 3 && (
                <button onClick={() => setShowAllPrompts(v => !v)}
                  className="mt-3 text-xs text-(--nd-purple) hover:opacity-80 transition-opacity">
                  {showAllPrompts ? 'Show less' : `Show all ${promptsUsed.length} prompts`}
                </button>
              )}
            </div>
          )}

          {/* SECTION 4: Raw LLM Answers */}
          {Object.keys(rawAnswers).length > 0 && (
            <div className="bg-white border border-(--nd-border) rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-(--nd-text-primary)">Raw LLM Responses</span>
                <FieldTooltip description={TOOLTIPS.rawAnswer} />
                <button
                  type="button"
                  onClick={() =>
                    runMetricAskAi(
                      'Raw LLM Responses',
                      `Analyze these raw model responses and explain consistency, quality, and citation risk.\n${JSON.stringify({
                        model: activeModelTab,
                        active_answers: activeAnswers.slice(0, 6),
                        prompts_used: promptsUsed.slice(0, 6),
                      })}`,
                    )
                  }
                  disabled={!projectId || !jobId || isAskingAI}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-(--nd-border) bg-(--nd-nav-active-bg) px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-(--nd-purple) disabled:opacity-40"
                >
                  <MessageSquare className="size-3" />
                  Ask AI
                </button>
              </div>

              {/* Model tabs */}
              <div className="flex gap-1 mb-4 bg-(--nd-bg) rounded-xl p-1">
                {modelTabs.map(({ key, label, icon }) => {
                  const answers = (rawAnswers[key] as string[]) ?? []
                  if (!answers.length) return null
                  return (
                    <button key={key} onClick={() => setActiveModelTab(key)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all',
                        activeModelTab === key
                          ? 'bg-white text-(--nd-text-primary) shadow-sm'
                          : 'text-(--nd-text-muted) hover:text-(--nd-text-secondary)'
                      )}>
                      <span>{icon}</span>
                      <span>{label}</span>
                      <Badge className="bg-(--nd-border) text-(--nd-text-muted) text-[9px] px-1.5 py-0 border-0">{answers.length}</Badge>
                    </button>
                  )
                })}
              </div>

              {/* Active model answers */}
              {activeAnswers.length > 0 ? (
                <div className="space-y-3">
                  {activeAnswers.map((answer: string, i: number) => (
                    <div key={i} className="p-4 bg-(--nd-bg) border border-(--nd-border) rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-(--nd-text-secondary) uppercase tracking-wide">Response {i + 1}</span>
                        <FieldTooltip description={TOOLTIPS.rawAnswer} />
                      </div>
                      <p className="text-xs text-(--nd-text-secondary) leading-relaxed whitespace-pre-wrap">{answer}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-(--nd-text-muted) text-center py-6">No responses from this model</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
