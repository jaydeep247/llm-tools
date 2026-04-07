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
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs shadow-2xl">
      <p style={{ color: payload[0].payload.fill }} className="font-semibold">{payload[0].name}</p>
      <p className="text-white font-bold">{payload[0].value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const lower = (status ?? '').toLowerCase()
  const isFullyAnswered = lower === 'fully_answered' || lower === 'fully answered' || lower === 'answered'
  const isPartial = lower === 'partially_answered' || lower === 'partial' || lower.includes('partial')
  if (isFullyAnswered) return <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 text-[10px]">Answered</Badge>
  if (isPartial) return <Badge className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/20 text-[10px]">Partial</Badge>
  return <Badge className="bg-red-500/15 text-red-300 border border-red-500/20 text-[10px]">Not Answered</Badge>
}

function QuestionRow({ q, index }: { q: any; index: number }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start justify-between gap-3 p-3 hover:bg-zinc-800/40 transition-colors text-left">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="text-[10px] text-zinc-600 font-mono w-5 shrink-0 pt-0.5">Q{index + 1}</span>
          <span className="text-xs text-zinc-200 leading-relaxed">{q.question}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={q.status} />
          {expanded ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
        </div>
      </button>
      {expanded && q.evidence !== undefined && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-800/50">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Evidence / Gap</span>
            <FieldTooltip description={TOOLTIPS.evidence} />
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-800/50 rounded-lg p-3">{q.evidence || 'No evidence found on page.'}</p>
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

  const scoreColor = completenessScore >= 70 ? 'text-emerald-400'
    : completenessScore >= 50 ? 'text-yellow-400'
    : completenessScore >= 30 ? 'text-orange-400' : 'text-red-400'

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
          <h2 className="text-xl font-semibold text-white">AI Answer Preview</h2>
          <p className="text-sm text-zinc-400 mt-0.5">How accurately and completely AI models answer questions about your brand</p>
        </div>
        <button
          type="button"
          onClick={openAskAiDialog}
          disabled={!projectId || isAskingAI}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border-0 px-5 py-2.5 text-sm font-extrabold uppercase tracking-wider text-black shadow-lg shadow-fuchsia-950/30',
            'bg-gradient-to-r from-purple-500 via-pink-500 to-amber-300 hover:opacity-95',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <MessageSquare className="size-4 shrink-0" />
          Ask AI
        </button>
      </div>

      {isLoadingData && (
        <div className="flex items-center justify-center p-16 border border-zinc-800 rounded-2xl bg-zinc-800/30">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm text-zinc-400">Loading...</p>
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
          <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-6">
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
                className="inline-flex items-center gap-1 rounded-full border border-violet-500/35 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300 disabled:opacity-40"
              >
                <MessageSquare className="size-3" />
                Ask AI
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              {/* Pie chart + legend */}
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 self-start">
                  <span className="text-sm font-semibold text-white">Q&A Status Breakdown</span>
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
                          <span className="text-xs text-zinc-400">{name}</span>
                          <span className="text-xs font-bold text-white ml-auto pl-2">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">No Q&A data available</p>
                )}
              </div>

              {/* Stats */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                    <div className="flex justify-center items-center gap-1 mb-1">
                      <span className="text-[10px] text-zinc-500">Completeness Score</span>
                      <FieldTooltip description={TOOLTIPS.completenessScore} />
                    </div>
                    <span className={cn('text-4xl font-bold', scoreColor)}>{completenessScore.toFixed(1)}</span>
                    <span className="text-xs text-zinc-500 block">/100</span>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                    <div className="flex justify-center items-center gap-1 mb-1">
                      <span className="text-[10px] text-zinc-500">Questions Tested</span>
                      <FieldTooltip description={TOOLTIPS.questionsGenerated} />
                    </div>
                    <span className="text-4xl font-bold text-blue-400">{questionsGenerated}</span>
                    <span className="text-xs text-zinc-500 block">total</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Fully Answered', val: fullyAnswered, tip: TOOLTIPS.fullyAnswered, color: 'text-emerald-400', icon: <CheckCircle className="w-3 h-3" /> },
                    { label: 'Partial', val: partiallyAnswered, tip: TOOLTIPS.partiallyAnswered, color: 'text-yellow-400', icon: <AlertCircle className="w-3 h-3" /> },
                    { label: 'Not Answered', val: notAnswered, tip: TOOLTIPS.notAnswered, color: 'text-red-400', icon: <XCircle className="w-3 h-3" /> },
                  ].map(({ label, val, tip, color, icon }) => (
                    <div key={label} className="bg-zinc-800/50 rounded-xl p-3 text-center">
                      <div className="flex justify-center items-center gap-1 mb-1">
                        <span className={cn('opacity-70', color)}>{icon}</span>
                        <span className="text-[10px] text-zinc-500">{label}</span>
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
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-white">Question-by-Question Analysis</span>
                <FieldTooltip description="Each question was generated based on your page topic and tested against your content to see if an LLM could answer it." />
                <Badge className="bg-purple-500/15 text-purple-300 border border-purple-500/20 text-xs ml-auto">{results.length} questions</Badge>
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
                  className="inline-flex items-center gap-1 rounded-full border border-violet-500/35 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300 disabled:opacity-40"
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
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-semibold text-white">Unanswerable Questions</span>
                <FieldTooltip description={TOOLTIPS.missingQuestions} />
                <Badge className="bg-red-500/15 text-red-300 border border-red-500/20 text-xs ml-auto">{missingQuestions.length}</Badge>
              </div>
              <div className="space-y-2">
                {missingQuestions.map((q: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-red-200/80 leading-relaxed">{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gaps summary */}
          {Object.keys(gaps).length > 0 && (
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">Identified Gaps</span>
                <FieldTooltip description={TOOLTIPS.gaps} />
              </div>
              <div className="space-y-2">
                {Object.entries(gaps).slice(0, 6).map(([q, gap]: [string, any], i) => (
                  <div key={i} className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                    <p className="text-xs font-medium text-amber-200 mb-1">{q}</p>
                    <p className="text-xs text-amber-200/70">{typeof gap === 'string' ? gap : JSON.stringify(gap)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: Prompts Used */}
          {promptsUsed.length > 0 && (
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-white">Prompts Sent to LLMs</span>
                <FieldTooltip description={TOOLTIPS.promptsUsed} />
                <Badge className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/20 text-xs ml-auto">{promptsUsed.length} prompts</Badge>
              </div>
              <div className="space-y-2">
                {(showAllPrompts ? promptsUsed : promptsUsed.slice(0, 3)).map((prompt: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl">
                    <span className="text-[10px] text-zinc-600 font-mono w-5 shrink-0 pt-0.5">P{i + 1}</span>
                    <span className="text-xs text-zinc-300 leading-relaxed">{prompt}</span>
                  </div>
                ))}
              </div>
              {promptsUsed.length > 3 && (
                <button onClick={() => setShowAllPrompts(v => !v)}
                  className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  {showAllPrompts ? 'Show less' : `Show all ${promptsUsed.length} prompts`}
                </button>
              )}
            </div>
          )}

          {/* SECTION 4: Raw LLM Answers */}
          {Object.keys(rawAnswers).length > 0 && (
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-white">Raw LLM Responses</span>
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
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-violet-500/35 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300 disabled:opacity-40"
                >
                  <MessageSquare className="size-3" />
                  Ask AI
                </button>
              </div>

              {/* Model tabs */}
              <div className="flex gap-1 mb-4 bg-zinc-900/60 rounded-xl p-1">
                {modelTabs.map(({ key, label, icon }) => {
                  const answers = (rawAnswers[key] as string[]) ?? []
                  if (!answers.length) return null
                  return (
                    <button key={key} onClick={() => setActiveModelTab(key)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all',
                        activeModelTab === key
                          ? 'bg-zinc-700 text-white shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-300'
                      )}>
                      <span>{icon}</span>
                      <span>{label}</span>
                      <Badge className="bg-zinc-600/50 text-zinc-400 text-[9px] px-1.5 py-0 border-0">{answers.length}</Badge>
                    </button>
                  )
                })}
              </div>

              {/* Active model answers */}
              {activeAnswers.length > 0 ? (
                <div className="space-y-3">
                  {activeAnswers.map((answer: string, i: number) => (
                    <div key={i} className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Response {i + 1}</span>
                        <FieldTooltip description={TOOLTIPS.rawAnswer} />
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{answer}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 text-center py-6">No responses from this model</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
