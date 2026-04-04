'use client'

import { useMemo, useRef, useState, useEffect, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { 
  Loader2, Brain, MessageCircle, Database, Cpu, Lightbulb,
  CheckCircle, AlertCircle, Shield, Globe, BookOpen,
  BarChart3, Zap, FileText, Eye, Activity, MessageSquare
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, PieChart, Pie
} from 'recharts'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'
import { 
  useGetModuleCResultQuery,
  useAskModuleCAIMutation,
  useGetModuleCSuggestedQuestionsMutation,
} from '@/store/api/module_C/moduleCApi'
import { useModuleCAnalysis } from '@/hooks/useModuleCAnalysis'
import ModuleCProgressLoader from './ModuleCProgressLoader'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleCAskAiChatShell, type ModuleCAskAiChatTurn } from './ModuleCAskAiChatShell'

interface AIVisibilityScorecardsProps {
  url: string
  sessionId?: string | number
  jobId?: string | null
  projectId?: string | null
}

// ── Tooltip descriptions ────────────────────────────────────────────────────
const TOOLTIPS = {
  overallScore: 'Combined AI Visibility score across all analysis modules. Higher is better. Scores above 70 indicate strong LLM readability.',
  llmFriendliness: 'AEO Checker score (0–100). Measures how easily LLMs can crawl, parse, and extract information from your page.',
  entityCoverage: 'Percentage of expected topical entities that are actually present on the page. Low coverage means AI models lack facts to cite you.',
  answerCompleteness: 'How completely your page answers likely user questions. Scored from 0–100 based on question-by-question analysis.',
  llmConsistency: 'How consistent AI model responses are when queried about your brand. Low consistency means models give conflicting information.',
  pageActions: 'Number of recommended fixes identified. Completing all actions can raise your LLM Friendliness score to the predicted level.',
  crawlAccess: 'Whether AI bots can access your page. Includes robots.txt, sitemap presence, and server response checks.',
  schemaSignals: 'Schema.org structured data score. Higher values mean your page has richer machine-readable markup for AI to extract.',
  contentScore: 'Content structure quality for AI. Evaluates heading hierarchy, paragraph structure, and entity-rich passages.',
  techHygiene: 'Technical health score including HTTPS, page speed, mobile readiness, and canonical signals.',
  structureScore: 'Page structure readability for LLMs including section delineation and information hierarchy.',
  readabilityScore: 'Flesch-Kincaid readability score adapted for AI. Higher = easier for LLMs to parse and re-use.',
  fogIndex: 'Gunning Fog Index — measures content complexity. Lower is more readable and preferable for AI.',
  avgSentenceLen: 'Average sentence length in words. Sentences under 20 words are easier for LLMs to process accurately.',
  structuredDataTypes: 'Coverage percentage of recommended Schema.org types present on the page.',
  structuredDataCompletion: 'How completely the detected Schema.org types are filled with required properties.',
  structuredDataValidation: 'Whether detected structured data passes Schema.org validation rules (0 errors = 100%).',
  entityRatio: 'Proportion of words that are named entities. Higher entity density helps AI models identify key facts.',
  currentScore: 'Your current LLM Friendliness score — how well AI models can understand your page right now.',
  predictedScore: 'Projected score after implementing all recommended page actions.',
  scoreDelta: 'Potential improvement available if you apply all recommended page actions.',
  wordCount: 'Total words in visible page content. Pages with 500–2000 words tend to rank well in AI-generated answers.',
  pageType: 'Detected page type (homepage, article, product page, etc.) used to calibrate scoring benchmarks.',
  pageTopic: 'Primary topic extracted from the page by the AEO analyzer.',
}

// Circular Progress
function CircularProgress({ value, size = 120, strokeWidth = 8, label, sublabel }: {
  value: number; size?: number; strokeWidth?: number; label?: string; sublabel?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (Math.min(value, 100) / 100) * circumference
  const color = value >= 70 ? '#22c55e' : value >= 50 ? '#eab308' : value >= 30 ? '#f97316' : '#ef4444'
  return (
    <div className="relative inline-flex flex-col items-center justify-center gap-1">
      <div className="relative inline-flex items-center justify-center">
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-700 ease-out" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-white">{Math.round(value)}</span>
          <span className="text-xs text-zinc-500">/100</span>
        </div>
      </div>
      {label && <span className="text-xs font-medium text-zinc-300">{label}</span>}
      {sublabel && <span className="text-[10px] text-zinc-500">{sublabel}</span>}
    </div>
  )
}

// Score pill label
function ScoreLabel({ score }: { score: number }) {
  const { text, cls } = score >= 70 ? { text: 'Good', cls: 'text-green-400 bg-green-500/10 border-green-500/20' }
    : score >= 50 ? { text: 'Fair', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' }
    : score >= 30 ? { text: 'Poor', cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' }
    : { text: 'Critical', cls: 'text-red-400 bg-red-500/10 border-red-500/20' }
  return <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', cls)}>{text}</span>
}

// Mini progress bar
function MiniBar({ value, color = 'bg-blue-500' }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  )
}

// Custom dark tooltip for recharts
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs shadow-2xl">
      <p className="text-zinc-300 font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold text-white">{p.value}</span></p>
      ))}
    </div>
  )
}

// Metric card
function MetricCard({ label, value, sublabel, tooltip, icon, accent = 'blue', large }: {
  label: string; value: string | number; sublabel?: string; tooltip?: string; icon?: React.ReactNode; accent?: string; large?: boolean
}) {
  const accentMap: Record<string, string> = {
    blue: 'bg-blue-500/15 border-blue-500/20',
    green: 'bg-green-500/15 border-green-500/20',
    yellow: 'bg-yellow-500/15 border-yellow-500/20',
    red: 'bg-red-500/15 border-red-500/20',
    purple: 'bg-purple-500/15 border-purple-500/20',
    cyan: 'bg-cyan-500/15 border-cyan-500/20',
    orange: 'bg-orange-500/15 border-orange-500/20',
  }
  return (
    <div className={cn('rounded-xl border p-4 flex flex-col gap-1', accentMap[accent] || accentMap['blue'])}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="opacity-70">{icon}</span>}
        <span className="text-xs text-zinc-400">{label}</span>
        {tooltip && <FieldTooltip description={tooltip} />}
      </div>
      <span className={cn('font-bold text-white', large ? 'text-3xl' : 'text-xl')}>{value}</span>
      {sublabel && <span className="text-[10px] text-zinc-500">{sublabel}</span>}
    </div>
  )
}

function chatMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function AIVisibilityScorecards({ url, sessionId, jobId, projectId }: AIVisibilityScorecardsProps) {
  const { data: moduleCData, isLoading: isLoadingData, refetch: refetchData } = useGetModuleCResultQuery({ jobId: jobId || '', url }, { 
    skip: !jobId, refetchOnMountOrArgChange: true, refetchOnFocus: true, refetchOnReconnect: true,
  })
  const { isAnalyzing, progress, phaseLabel, runAnalysis } = useModuleCAnalysis({
    jobId,
    url,
    onCompleted: refetchData,
  })
  const [askModuleCAI, { isLoading: isAskingAI, error: askAIError, reset: resetAskAI }] = useAskModuleCAIMutation()
  const [getSuggestedQuestions] = useGetModuleCSuggestedQuestionsMutation()
  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ModuleCAskAiChatTurn[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const handleRunAnalysis = async () => {
    try {
      await runAnalysis()
    } catch (e) {
      console.error(e)
    }
  }
  const result = moduleCData?.data
  const modules = result?.modules || {}
  const hasData = !!result

  const aeo = modules.aeo_checker as any
  const entityCov = modules.entity_coverage as any
  const answerComp = modules.answer_completeness as any
  const llmSim = modules.llm_simulator as any
  const pageAct = modules.page_actions as any

  const overallScore = result?.overall_score ?? 0
  const llmScore = aeo?.llm_friendliness_score ?? 0
  const entityPct = entityCov?.entity_coverage_pct ?? entityCov?.coverage?.entity_coverage_pct ?? 0
  const completenessScore = answerComp?.completeness_score ?? 0
  const consistencyScore = llmSim?.consistency?.consistency_score ?? 0

  // Build sub-scores bar chart data
  const subScoreData = useMemo(() => {
    if (!aeo?.sub_scores) return []
    const ss = aeo.sub_scores
    return [
      { name: 'Crawl Access', score: ss.crawl_access?.total ?? 0, fill: '#3b82f6' },
      { name: 'Schema', score: ss.schema?.total ?? 0, fill: '#8b5cf6' },
      { name: 'Content', score: ss.content?.total ?? 0, fill: '#10b981' },
      { name: 'Tech Hygiene', score: ss.tech_hygiene?.total ?? 0, fill: '#06b6d4' },
      { name: 'Structure', score: ss.structure?.total ?? 0, fill: '#f59e0b' },
    ]
  }, [aeo])

  // Module overview chart
  const moduleOverviewData = useMemo(() => [
    { name: 'LLM Score', value: Math.round(llmScore), fill: '#3b82f6' },
    { name: 'Entity Cov.', value: Math.round(entityPct), fill: '#10b981' },
    { name: 'Completeness', value: Math.round(completenessScore), fill: '#8b5cf6' },
    { name: 'Consistency', value: Math.round(consistencyScore), fill: '#f59e0b' },
  ], [llmScore, entityPct, completenessScore, consistencyScore])

  useEffect(() => {
    if (!askDialogOpen || !chatScrollRef.current) return
    const el = chatScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [askDialogOpen, chatMessages, isAskingAI])

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

  return (
    <div className="space-y-6">
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

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">AI Visibility Scorecards</h2>
          <p className="text-sm text-zinc-400 mt-0.5">How well your page performs across all AI engine dimensions</p>
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

      {/* ── No Job Warning ───────────────────────────────────────────────────── */}
      {!jobId && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">Run a crawl first to enable AI Visibility analysis.</p>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {isLoadingData && (
        <div className="flex items-center justify-center p-16 border border-zinc-800 rounded-2xl bg-zinc-800/30">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm text-zinc-400">Loading data…</p>
          </div>
        </div>
      )}

      {isAnalyzing && (
        <ModuleCProgressLoader
          progress={progress}
          phaseLabel={phaseLabel}
          title="Building AI Visibility Scorecards"
        />
      )}

      {/* ── Empty State ───────────────────────────────────────────────────────── */}
      {!hasData && !isLoadingData && !isAnalyzing && jobId && (
        <AnalysisEmptyState
          icon={<Brain className="w-8 h-8 text-zinc-600" />}
          title="No Analysis Data Yet"
          description="Run an AI Visibility analysis to see comprehensive scorecards for your website."
          onRunAnalysis={handleRunAnalysis}
          isAnalyzing={isAnalyzing}
        />
      )}

      {hasData && !isLoadingData && !isAnalyzing && (
        <>
          {/* ── SECTION 1: Hero Score ─────────────────────────────────────────── */}
          <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-6">
            <div className="flex flex-col lg:flex-row gap-8 items-center">
              {/* Big circle */}
              <div className="shrink-0 flex flex-col items-center gap-2">
                <CircularProgress value={overallScore} size={150} strokeWidth={12} />
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm text-zinc-400">Overall Score</span>
                  <FieldTooltip description={TOOLTIPS.overallScore} />
                </div>
                <ScoreLabel score={overallScore} />
              </div>

              {/* Page info + improvement potential */}
              <div className="flex-1 space-y-4">
                {(aeo?.page_topic || aeo?.page_type) && (
                  <div className="flex flex-wrap gap-2 items-center">
                    {aeo.page_type && (
                      <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/20 text-xs capitalize">
                        {aeo.page_type}
                      </Badge>
                    )}
                    {aeo.page_topic && (
                      <span className="text-xs text-zinc-400 italic line-clamp-1 max-w-xs">"{aeo.page_topic}"</span>
                    )}
                    <FieldTooltip description={TOOLTIPS.pageTopic} />
                  </div>
                )}

                {/* Mini module overview bars */}
                <div className="space-y-2.5">
                  {[
                    { label: 'LLM Friendliness', val: llmScore, tip: TOOLTIPS.llmFriendliness, color: 'bg-blue-500' },
                    { label: 'Entity Coverage', val: entityPct, tip: TOOLTIPS.entityCoverage, color: 'bg-emerald-500' },
                    { label: 'Answer Completeness', val: completenessScore, tip: TOOLTIPS.answerCompleteness, color: 'bg-purple-500' },
                    { label: 'LLM Consistency', val: consistencyScore, tip: TOOLTIPS.llmConsistency, color: 'bg-amber-500' },
                  ].map(({ label, val, tip, color }) => (
                    <div key={label}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-zinc-400">{label}</span>
                          <FieldTooltip description={tip} />
                        </div>
                        <span className="text-xs font-semibold text-white">{Math.round(val)}</span>
                      </div>
                      <MiniBar value={val} color={color} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Score potential */}
              {pageAct && (
                <div className="shrink-0 grid grid-cols-1 gap-3 min-w-36">
                  <div className="bg-zinc-900/70 border border-zinc-700 rounded-xl p-4 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Current</span>
                      <FieldTooltip description={TOOLTIPS.currentScore} />
                    </div>
                    <span className="text-2xl font-bold text-white">{pageAct.current_llm_friendliness ?? overallScore}</span>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <span className="text-[10px] text-emerald-400 uppercase tracking-wide">Predicted</span>
                      <FieldTooltip description={TOOLTIPS.predictedScore} />
                    </div>
                    <span className="text-2xl font-bold text-emerald-400">{pageAct.predicted_llm_friendliness ?? '--'}</span>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl p-4 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <span className="text-[10px] text-blue-400 uppercase tracking-wide">Potential</span>
                      <FieldTooltip description={TOOLTIPS.scoreDelta} />
                    </div>
                    <span className="text-2xl font-bold text-blue-400">+{pageAct.predicted_llm_friendliness_delta ?? 0}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 2: Module Overview Chart ────────────────────────────── */}
          <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-semibold text-white">Module Score Overview</span>
              <FieldTooltip description="Comparison of scores across all four main AI analysis modules." />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={moduleOverviewData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Score">
                  {moduleOverviewData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── SECTION 3: AEO Sub-Score Breakdown ──────────────────────────── */}
          {aeo?.sub_scores && (
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Shield className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-white">AEO Checker — Sub-Score Breakdown</span>
                <FieldTooltip description="Detailed breakdown of the five pillars that make up the LLM Friendliness score." />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart */}
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={subScoreData} layout="vertical" barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]} name="Score">
                      {subScoreData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Sub-score detail breakdown */}
                <div className="space-y-3">
                  {[
                    { key: 'crawl_access', label: 'Crawl Access', tip: TOOLTIPS.crawlAccess, color: 'bg-blue-500' },
                    { key: 'schema', label: 'Schema Signals', tip: TOOLTIPS.schemaSignals, color: 'bg-purple-500' },
                    { key: 'content', label: 'Content Quality', tip: TOOLTIPS.contentScore, color: 'bg-emerald-500' },
                    { key: 'tech_hygiene', label: 'Tech Hygiene', tip: TOOLTIPS.techHygiene, color: 'bg-cyan-500' },
                    { key: 'structure', label: 'Structure', tip: TOOLTIPS.structureScore, color: 'bg-amber-500' },
                  ].map(({ key, label, tip, color }) => {
                    const val = aeo.sub_scores[key]?.total ?? 0
                    return (
                      <div key={key}>
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-zinc-300">{label}</span>
                            <FieldTooltip description={tip} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">{val}/100</span>
                            <ScoreLabel score={val} />
                          </div>
                        </div>
                        <MiniBar value={val} color={color} />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION 4: Readability + Structured Data ────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Readability */}
            {aeo?.readability && (
              <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-white">Readability Signals</span>
                  <FieldTooltip description="Readability metrics used by AI engines to assess how parseable your content is." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Readability Score', val: aeo.readability.readability_score ?? 0, tip: TOOLTIPS.readabilityScore },
                    { label: 'Flesch Ease', val: aeo.readability.fk_ease ?? 0, tip: 'Flesch Reading Ease score. 60–70 is the standard readable range.' },
                    { label: 'Fog Index', val: aeo.readability.fog_index ?? 0, tip: TOOLTIPS.fogIndex },
                    { label: 'Avg Sentence Len', val: aeo.readability.avg_sentence_length ?? 0, tip: TOOLTIPS.avgSentenceLen },
                  ].map(({ label, val, tip }) => (
                    <div key={label} className="bg-zinc-800/50 rounded-xl p-3">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[10px] text-zinc-500">{label}</span>
                        <FieldTooltip description={tip} />
                      </div>
                      <span className="text-lg font-bold text-white">{val}</span>
                    </div>
                  ))}
                </div>
                {aeo.word_count && (
                  <div className="mt-3 flex items-center justify-between p-2 bg-zinc-800/40 rounded-lg">
                    <div className="flex items-center gap-1">
                      <FileText className="w-3 h-3 text-zinc-500" />
                      <span className="text-xs text-zinc-400">Word Count</span>
                      <FieldTooltip description={TOOLTIPS.wordCount} />
                    </div>
                    <span className="text-sm font-semibold text-white">{aeo.word_count?.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            {/* Structured Data */}
            {aeo?.structured_data && (
              <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold text-white">Structured Data Signals</span>
                  <FieldTooltip description="Schema.org markup analysis — AI models rely heavily on structured data to cite accurate information." />
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Type Coverage', val: `${aeo.structured_data.type_coverage_pct ?? 0}%`, tip: TOOLTIPS.structuredDataTypes, color: 'text-blue-400' },
                    { label: 'Completeness', val: `${aeo.structured_data.completeness_score ?? 0}`, tip: TOOLTIPS.structuredDataCompletion, color: 'text-purple-400' },
                    { label: 'Validation', val: `${aeo.structured_data.validation_score ?? 0}%`, tip: TOOLTIPS.structuredDataValidation, color: 'text-emerald-400' },
                  ].map(({ label, val, tip, color }) => (
                    <div key={label} className="bg-zinc-800/50 rounded-xl p-3 text-center">
                      <div className="flex justify-center items-center gap-1 mb-1">
                        <span className="text-[10px] text-zinc-500">{label}</span>
                        <FieldTooltip description={tip} />
                      </div>
                      <span className={cn('text-lg font-bold', color)}>{val}</span>
                    </div>
                  ))}
                </div>
                {aeo.structured_data.missing_types?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Missing Schema Types</span>
                      <FieldTooltip description="Schema.org types that are recommended for this page type but not currently present." />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {aeo.structured_data.missing_types.map((t: string) => (
                        <span key={t} className="text-[10px] bg-red-500/10 text-red-300 border border-red-500/20 rounded-full px-2 py-0.5">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── SECTION 5: Entity Ratio + Page Actions Summary ───────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Entity ratio */}
            {aeo?.entity_ratio && (
              <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-semibold text-white">Entity Signals</span>
                  <FieldTooltip description="How many expected named entities your page contains vs. how many are expected for your topic." />
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {[
                    { label: 'Detected', val: aeo.entity_ratio.detected_count ?? 0, tip: 'Entities detected on the page by spaCy NER.' },
                    { label: 'Expected', val: aeo.entity_ratio.expected_count ?? 0, tip: 'Entities expected for this page topic based on industry benchmarks.' },
                    { label: 'Matched', val: aeo.entity_ratio.matched_count ?? 0, tip: 'Entities present on the page that match the expected entity list.' },
                  ].map(({ label, val, tip }) => (
                    <div key={label} className="bg-zinc-800/50 rounded-xl p-3 text-center">
                      <div className="flex justify-center items-center gap-1 mb-1">
                        <span className="text-[10px] text-zinc-500">{label}</span>
                        <FieldTooltip description={tip} />
                      </div>
                      <span className="text-xl font-bold text-white">{val}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-zinc-400">Entity Ratio</span>
                      <FieldTooltip description={TOOLTIPS.entityRatio} />
                    </div>
                    <span className="text-xs font-semibold text-white">{((aeo.entity_ratio.entity_ratio_pct ?? 0)).toFixed(1)}%</span>
                  </div>
                  <MiniBar value={aeo.entity_ratio.entity_ratio_pct ?? 0} color="bg-cyan-500" />
                </div>
              </div>
            )}

            {/* Page Actions Summary */}
            {pageAct && (
              <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">Actions Summary</span>
                  <FieldTooltip description={TOOLTIPS.pageActions} />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: 'Total Actions', val: pageAct.total_actions ?? 0, tip: 'Total recommended improvements identified.', color: 'text-white' },
                    { label: 'High Priority', val: pageAct.high_priority ?? 0, tip: 'Actions with the highest impact on your LLM Friendliness score.', color: 'text-red-400' },
                    { label: 'Medium Priority', val: pageAct.medium_priority ?? 0, tip: 'Moderate-impact improvements.', color: 'text-yellow-400' },
                    { label: 'Low Priority', val: pageAct.low_priority ?? 0, tip: 'Minor improvements with lower urgency.', color: 'text-zinc-400' },
                  ].map(({ label, val, tip, color }) => (
                    <div key={label} className="bg-zinc-800/50 rounded-xl p-3 text-center">
                      <div className="flex justify-center items-center gap-1 mb-1">
                        <span className="text-[10px] text-zinc-500">{label}</span>
                        <FieldTooltip description={tip} />
                      </div>
                      <span className={cn('text-xl font-bold', color)}>{val}</span>
                    </div>
                  ))}
                </div>
                {/* Score improvement bar */}
                <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-700/40">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3 text-emerald-400" />
                      <span className="text-xs text-zinc-400">Score Improvement Potential</span>
                      <FieldTooltip description="The gap between your current and predicted score after all actions are applied." />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 w-8">{pageAct.current_llm_friendliness ?? 0}</span>
                    <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden relative">
                      <div className="h-full bg-zinc-600 rounded-full" style={{ width: `${pageAct.current_llm_friendliness ?? 0}%` }} />
                      <div className="absolute inset-0 h-full bg-emerald-500/30 rounded-full" style={{ width: `${pageAct.predicted_llm_friendliness ?? 0}%` }} />
                    </div>
                    <span className="text-xs text-emerald-400 w-8">{pageAct.predicted_llm_friendliness ?? 0}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── SECTION 6: Answer Completeness Snapshot ─────────────────────── */}
          {answerComp && (
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageCircle className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-white">Answer Completeness Snapshot</span>
                <FieldTooltip description={TOOLTIPS.answerCompleteness} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Completeness Score', val: answerComp.completeness_score ?? 0, tip: 'Out-of-100 overall completeness score based on question analysis.', color: 'text-purple-400' },
                  { label: 'Fully Answered', val: answerComp.fully_answered ?? 0, tip: 'Questions for which the page provides a full answer.', color: 'text-emerald-400' },
                  { label: 'Partially Answered', val: answerComp.partially_answered ?? 0, tip: 'Questions where only partial information is available.', color: 'text-yellow-400' },
                  { label: 'Not Answered', val: answerComp.not_answered ?? 0, tip: 'Questions that have no relevant information on the page.', color: 'text-red-400' },
                ].map(({ label, val, tip, color }) => (
                  <div key={label} className="bg-zinc-800/50 rounded-xl p-4 text-center">
                    <div className="flex justify-center items-center gap-1 mb-1">
                      <span className="text-[10px] text-zinc-500">{label}</span>
                      <FieldTooltip description={tip} />
                    </div>
                    <span className={cn('text-2xl font-bold', color)}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
