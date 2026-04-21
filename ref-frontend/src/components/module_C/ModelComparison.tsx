'use client'

import { useState, useMemo, useRef, useEffect, type FormEvent } from 'react'
import {
  Loader2, BarChart3, AlertTriangle,
  TrendingUp, Users, Zap, AlertCircle, ChevronDown, ChevronUp, MessageSquare
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  Cell, PieChart, Pie
} from 'recharts'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleCAskAiChatShell, type ModuleCAskAiChatTurn } from './ModuleCAskAiChatShell'
import { useGetModuleCResultQuery, useAskModuleCAIMutation, useGetModuleCSuggestedQuestionsMutation } from '@/store/api/module_C/moduleCApi'
import { useModuleCAnalysis } from '@/hooks/useModuleCAnalysis'
import ModuleCProgressLoader from './ModuleCProgressLoader'

interface ModelComparisonProps {
  jobId?: string | null
  url?: string
  projectId?: string | null
}

const TOOLTIPS = {
  accuracyOverall: 'Overall accuracy score across all LLM models. Measures how correctly models describe your brand based on your page content.',
  accuracyPerModel: 'Per-model accuracy score (0-100). Higher means the model more accurately represents information from your page.',
  completenessOverall: 'How completely models cover all relevant information when responding about your brand.',
  completenessPerModel: 'Per-model completeness score (0-100). A high score means the model surfaces most of your key facts.',
  consistencyScore: 'How consistent responses are across different AI models and sessions. Low scores indicate unstable AI visibility.',
  consistencyFlag: 'Qualitative assessment of consistency risk based on score thresholds.',
  modelFriendlinessAvg: 'Average friendliness score across all models. Reflects how well your content is optimised for each model.',
  modelFriendlinessPerModel: 'How friendly your page is for this specific AI model — higher means the model is more likely to cite you accurately.',
  variationScore: 'Degree of variation in responses across models. 0 = identical answers, 100 = completely different answers.',
  avgSimilarity: 'Semantic similarity between responses from different models. Higher = more consistent AI answers.',
  contradictions: 'Specific factual contradictions identified between different model responses about your brand.',
  coverageScore: 'How well your content is covered across all models combined. 0 = no model cites from your page.',
  modelsNotCiting: 'Models that did not cite or reference your page content in their responses.',
  totalModels: 'Number of AI models tested in this multi-model analysis.',
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-lg" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
      <p className="font-semibold mb-1" style={{ color: 'var(--nd-text-primary)' }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold" style={{ color: 'var(--nd-text-primary)' }}>{p.value}</span></p>
      ))}
    </div>
  )
}

function ConsistencyGauge({ score, flag }: { score: number; flag?: string }) {
  const color = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : score >= 30 ? '#f97316' : '#ef4444'
  const radius = 50
  const circumference = radius * Math.PI * 2 * 0.75
  const offset = circumference - (Math.min(score, 100) / 100) * circumference
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: 120, height: 120 }}>
        <svg width={120} height={120} viewBox="0 0 120 120">
          <circle cx={60} cy={60} r={radius} fill="none" stroke="rgba(83,71,206,0.10)"
            strokeWidth={10} strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * 0.125} transform="rotate(-225 60 60)" />
          <circle cx={60} cy={60} r={radius} fill="none" stroke={color}
            strokeWidth={10} strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset + circumference * 0.125}
            transform="rotate(-225 60 60)" className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{Math.round(score)}</span>
                    <span className="text-[10px] font-medium" style={{ color: 'var(--nd-text-secondary)' }}>/100</span>
        </div>
      </div>
      {flag && <p className="text-xs text-center max-w-32 leading-relaxed" style={{ color: 'var(--nd-text-primary)' }}>{flag}</p>}
    </div>
  )
}

export default function ModelComparison({ jobId, url, projectId }: ModelComparisonProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
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

  const llmSim = modules.llm_simulator as any
  const multiModel = modules.multi_model as any

  // Canonical display names for the raw Python model keys
  const MODEL_DISPLAY: Record<string, string> = {
    openai:   'ChatGPT',
    chat_gpt: 'ChatGPT',
    gemini:   'Gemini',
    claude:   'Claude',
  }

  // Per-model grouped bar chart data
  const perModelChartData = useMemo(() => {
    const accuracy = llmSim?.accuracy?.per_model ?? {}
    const completeness = llmSim?.completeness?.per_model ?? {}
    const friendliness = multiModel?.model_friendliness?.per_model ?? {}
    const allModels = new Set([...Object.keys(accuracy), ...Object.keys(completeness), ...Object.keys(friendliness)])
    return Array.from(allModels).map((model) => ({
      name: MODEL_DISPLAY[model] ?? (model.charAt(0).toUpperCase() + model.slice(1)),
      _key: model,
      'Accuracy': Math.round(accuracy[model] ?? 0),
      'Completeness': Math.round(completeness[model] ?? 0),
      'Friendliness': Math.round(friendliness[model] ?? 0),
    }))
  }, [llmSim, multiModel])

  // Radar chart data for multi-model overview
  const radarData = useMemo(() => {
    if (!perModelChartData.length) return []
    const metrics = ['Accuracy', 'Completeness', 'Friendliness'] as const
    return metrics.map((metric) => {
      const entry: Record<string, any> = { metric }
      perModelChartData.forEach((m) => { entry[m.name] = m[metric] })
      return entry
    })
  }, [perModelChartData])

  const consistencyScore = llmSim?.consistency?.consistency_score ?? 0
  const consistencyFlag = llmSim?.consistency?.flag ?? ''
  const accuracyOverall = llmSim?.accuracy?.overall ?? 0
  const completenessOverall = llmSim?.completeness?.overall ?? 0
  const modelFriendlinessAvg = multiModel?.model_friendliness?.average ?? 0
  const variationScore = multiModel?.answer_variation?.variation_score ?? 0
  const avgSimilarity = multiModel?.answer_variation?.avg_similarity ?? 0
  const contradictions: any[] = multiModel?.answer_variation?.contradictions ?? []
  const coverageScore = multiModel?.coverage_gaps?.coverage_score ?? 0
  const modelsNotCiting: string[] = multiModel?.coverage_gaps?.models_not_citing ?? []
  const totalModels = multiModel?.coverage_gaps?.total_models ?? 0

  const MODEL_COLORS: Record<string, string> = { Accuracy: '#5347CE', Completeness: '#10b981', Friendliness: '#f59e0b' }
  const RADAR_COLORS = ['#5347CE', '#10b981', '#f59e0b', '#ef4444']

  const toggle = (key: string) => setExpandedSection(v => v === key ? null : key)

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
          <h2 className="text-xl font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Multi-Model AI Comparison</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--nd-text-secondary)' }}>How different AI engines perceive and represent your brand</p>
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
          title="Comparing AI Model Responses"
        />
      )}

      {!hasData && !isLoadingData && !isAnalyzing && jobId && (
        <AnalysisEmptyState
          icon={<BarChart3 className="w-8 h-8 text-zinc-600" />}
          title="No Model Comparison Data"
          description="Run an analysis to compare how different AI models respond to queries about your brand."
          onRunAnalysis={handleRunAnalysis}
          isAnalyzing={isAnalyzing}
        />
      )}

      {hasData && !isLoadingData && !isAnalyzing && (
        <>
          {/* SECTION 1: Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Accuracy Overall', val: `${Math.round(accuracyOverall)}`, tip: TOOLTIPS.accuracyOverall, textStyle: { color: '#2563EB' }, sub: '/100' },
              { label: 'Completeness', val: `${Math.round(completenessOverall)}`, tip: TOOLTIPS.completenessOverall, textStyle: { color: '#059669' }, sub: '/100' },
              { label: 'Model Friendliness', val: modelFriendlinessAvg.toFixed(1), tip: TOOLTIPS.modelFriendlinessAvg, textStyle: { color: 'var(--nd-purple)' }, sub: 'avg' },
              { label: 'Coverage Score', val: `${Math.round(coverageScore)}`, tip: TOOLTIPS.coverageScore, textStyle: { color: coverageScore > 50 ? '#059669' : '#DC2626' }, sub: '/100' },
            ].map(({ label, val, tip, textStyle, sub }) => (
              <div key={label} className="rounded-2xl p-4 text-center" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
                <div className="flex justify-center items-center gap-1 mb-2">
                  <span className="text-[10px]" style={{ color: 'var(--nd-text-muted)' }}>{label}</span>
                  <FieldTooltip description={tip} />
                </div>
                <span className="text-3xl font-bold" style={textStyle}>{val}</span>
                <span className="text-xs block" style={{ color: 'var(--nd-text-muted)' }}>{sub}</span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                runMetricAskAi(
                  'Model Comparison Summary',
                  `Interpret this multi-model summary and identify the largest reliability risks.\n${JSON.stringify({
                    accuracy_overall: accuracyOverall,
                    completeness_overall: completenessOverall,
                    model_friendliness_average: modelFriendlinessAvg,
                    coverage_score: coverageScore,
                    total_models: totalModels,
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

          {/* SECTION 2: Per-Model Grouped Bar Chart */}
          {perModelChartData.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Per-Model Score Comparison</span>
                <FieldTooltip description="Side-by-side comparison of Accuracy, Completeness, and Friendliness for each AI model tested." />
                <button
                  type="button"
                  onClick={() =>
                    runMetricAskAi(
                      'Per-Model Score Comparison',
                      `Compare models and explain which model underperforms and why.\n${JSON.stringify({
                        per_model_scores: perModelChartData,
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
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={perModelChartData} barCategoryGap="25%" barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--nd-border)" />
                  <XAxis dataKey="name" tick={{ fill: '#737890', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#737890', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(83,71,206,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#737890' }} />
                  {(['Accuracy', 'Completeness', 'Friendliness'] as const).map((metric, i) => (
                    <Bar key={metric} dataKey={metric} fill={Object.values(MODEL_COLORS)[i]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* Per-model breakdown table */}
              <div className="mt-4 space-y-2">
                {perModelChartData.map(({ name, Accuracy, Completeness, Friendliness }) => (
                  <div key={name} className="flex items-center gap-3 py-2.5 px-3 rounded-xl" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                    <span className="text-xs font-semibold w-20 shrink-0" style={{ color: 'var(--nd-text-primary)' }}>{name}</span>
                    {[
                      { label: 'Accuracy', val: Accuracy, color: '#5347CE', tip: TOOLTIPS.accuracyPerModel },
                      { label: 'Completeness', val: Completeness, color: '#10b981', tip: TOOLTIPS.completenessPerModel },
                      { label: 'Friendliness', val: Friendliness, color: '#f59e0b', tip: TOOLTIPS.modelFriendlinessPerModel },
                    ].map(({ label, val, color, tip }) => (
                      <div key={label} className="flex-1 text-center">
                        <div className="flex justify-center items-center gap-1 mb-0.5">
                          <span className="text-[10px]" style={{ color: 'var(--nd-text-secondary)' }}>{label}</span>
                          <FieldTooltip description={tip} />
                        </div>
                        <span className="text-sm font-bold" style={{ color }}>{val}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: Radar Overview */}
          {radarData.length > 0 && perModelChartData.length > 1 && (
            <div className="rounded-2xl p-5" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--nd-purple)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Multi-Metric Radar</span>
                <FieldTooltip description="Radar chart showing accuracy, completeness, and friendliness for each model simultaneously." />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData} cx="50%" cy="50%">
                  <PolarGrid stroke="var(--nd-border)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#737890', fontSize: 11 }} />
                  {perModelChartData.map(({ name }, i) => (
                    <Radar key={name} name={name} dataKey={name} stroke={RADAR_COLORS[i % RADAR_COLORS.length]}
                      fill={RADAR_COLORS[i % RADAR_COLORS.length]} fillOpacity={0.12} strokeWidth={2} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11, color: '#737890' }} />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* SECTION 4: Consistency */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Response Consistency</span>
              <FieldTooltip description={TOOLTIPS.consistencyScore} />
              <button
                type="button"
                onClick={() =>
                  runMetricAskAi(
                    'Response Consistency',
                    `Explain this consistency profile and provide stabilization recommendations.\n${JSON.stringify({
                      consistency_score: consistencyScore,
                      consistency_flag: consistencyFlag,
                      variation_score: variationScore,
                      avg_similarity: avgSimilarity,
                      models_not_citing: modelsNotCiting,
                      contradictions_sample: contradictions.slice(0, 10),
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
              <div className="flex justify-center">
                <ConsistencyGauge score={consistencyScore} flag={consistencyFlag} />
              </div>
              <div className="sm:col-span-2 space-y-3">
                {[
                  { label: 'Consistency Score', val: `${Math.round(consistencyScore)}/100`, tip: TOOLTIPS.consistencyScore, textStyle: { color: consistencyScore >= 60 ? '#059669' : '#DC2626' } },
                  { label: 'Answer Variation', val: `${Math.round(variationScore)}%`, tip: TOOLTIPS.variationScore, textStyle: { color: variationScore > 50 ? '#DC2626' : '#059669' } },
                  { label: 'Avg Response Similarity', val: `${Math.round(avgSimilarity)}%`, tip: TOOLTIPS.avgSimilarity, textStyle: { color: 'var(--nd-text-primary)' } },
                  { label: 'Models Tested', val: totalModels, tip: TOOLTIPS.totalModels, textStyle: { color: '#2563EB' } },
                  { label: 'Models Not Citing', val: modelsNotCiting.length, tip: TOOLTIPS.modelsNotCiting, textStyle: { color: modelsNotCiting.length > 0 ? '#DC2626' : '#059669' } },
                ].map(({ label, val, tip, textStyle }) => (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b last:border-0" style={{ borderColor: 'var(--nd-border)' }}>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium" style={{ color: 'var(--nd-text-primary)' }}>{label}</span>
                      <FieldTooltip description={tip} />
                    </div>
                    <span className="text-sm font-bold" style={textStyle}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {consistencyFlag && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-xl" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">{consistencyFlag}</p>
              </div>
            )}
          </div>

          {/* SECTION 5: Models Not Citing */}
          {modelsNotCiting.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Models Not Citing Your Page</span>
                <FieldTooltip description={TOOLTIPS.modelsNotCiting} />
              </div>
              <div className="flex flex-wrap gap-2">
                {modelsNotCiting.map((model: string, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                    <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                    <span className="text-xs font-medium text-red-700 capitalize">{model}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 6: Contradictions */}
          {contradictions.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
              <button
                onClick={() => toggle('contradictions')}
                className="w-full flex items-center justify-between transition-colors rounded-lg -mx-2 px-2 py-1"
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--nd-nav-hover-bg)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Detected Contradictions</span>
                  <FieldTooltip description={TOOLTIPS.contradictions} />
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FFF1F2', color: '#E11D48', border: '1px solid #FECDD3' }}>{contradictions.length}</span>
                </div>
                {expandedSection === 'contradictions'
                  ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--nd-text-muted)' }} />
                  : <ChevronDown className="w-4 h-4" style={{ color: 'var(--nd-text-muted)' }} />}
              </button>
              {expandedSection === 'contradictions' && (
                <div className="mt-4 space-y-2">
                  {contradictions.map((c: any, i: number) => (
                    <div key={i} className="p-3 rounded-xl" style={{ background: '#FFF1F2', border: '1px solid #FECDD3' }}>
                      <p className="text-xs text-rose-800">{typeof c === 'string' ? c : JSON.stringify(c)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
