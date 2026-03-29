'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, BarChart3, AlertTriangle,
  TrendingUp, Users, Zap, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  Cell, PieChart, Pie
} from 'recharts'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { FieldTooltip } from '@/components/module_A/FieldTooltip'
import { useGetModuleCResultQuery } from '@/store/api/module_C/moduleCApi'
import { useModuleCAnalysis } from '@/hooks/useModuleCAnalysis'
import ModuleCProgressLoader from './ModuleCProgressLoader'

interface ModelComparisonProps {
  jobId?: string | null
  url?: string
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
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs shadow-2xl">
      <p className="text-zinc-300 font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold text-white">{p.value}</span></p>
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
          <circle cx={60} cy={60} r={radius} fill="none" stroke="rgba(255,255,255,0.06)"
            strokeWidth={10} strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * 0.125} transform="rotate(-225 60 60)" />
          <circle cx={60} cy={60} r={radius} fill="none" stroke={color}
            strokeWidth={10} strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset + circumference * 0.125}
            transform="rotate(-225 60 60)" className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{Math.round(score)}</span>
          <span className="text-[9px] text-zinc-500">/100</span>
        </div>
      </div>
      {flag && <p className="text-[11px] text-zinc-400 text-center max-w-32 leading-relaxed">{flag}</p>}
    </div>
  )
}

export default function ModelComparison({ jobId, url }: ModelComparisonProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

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

  // Per-model grouped bar chart data
  const perModelChartData = useMemo(() => {
    const accuracy = llmSim?.accuracy?.per_model ?? {}
    const completeness = llmSim?.completeness?.per_model ?? {}
    const friendliness = multiModel?.model_friendliness?.per_model ?? {}
    const allModels = new Set([...Object.keys(accuracy), ...Object.keys(completeness), ...Object.keys(friendliness)])
    return Array.from(allModels).map((model) => ({
      name: model.charAt(0).toUpperCase() + model.slice(1),
      'Accuracy': Math.round(accuracy[model] ?? 0),
      'Completeness': Math.round(completeness[model] ?? 0),
      'Friendliness': Math.round((friendliness[model] ?? 0) * 10),
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

  const MODEL_COLORS: Record<string, string> = { Accuracy: '#3b82f6', Completeness: '#10b981', Friendliness: '#8b5cf6' }
  const RADAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

  const toggle = (key: string) => setExpandedSection(v => v === key ? null : key)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Multi-Model AI Comparison</h2>
          <p className="text-sm text-zinc-400 mt-0.5">How different AI engines perceive and represent your brand</p>
        </div>
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
              { label: 'Accuracy Overall', val: `${Math.round(accuracyOverall)}`, tip: TOOLTIPS.accuracyOverall, color: 'text-blue-400', sub: '/100' },
              { label: 'Completeness', val: `${Math.round(completenessOverall)}`, tip: TOOLTIPS.completenessOverall, color: 'text-emerald-400', sub: '/100' },
              { label: 'Model Friendliness', val: modelFriendlinessAvg.toFixed(1), tip: TOOLTIPS.modelFriendlinessAvg, color: 'text-purple-400', sub: 'avg' },
              { label: 'Coverage Score', val: `${Math.round(coverageScore)}`, tip: TOOLTIPS.coverageScore, color: coverageScore > 50 ? 'text-emerald-400' : 'text-red-400', sub: '/100' },
            ].map(({ label, val, tip, color, sub }) => (
              <div key={label} className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-4 text-center">
                <div className="flex justify-center items-center gap-1 mb-2">
                  <span className="text-[10px] text-zinc-500">{label}</span>
                  <FieldTooltip description={tip} />
                </div>
                <span className={cn('text-3xl font-bold', color)}>{val}</span>
                <span className="text-xs text-zinc-500 block">{sub}</span>
              </div>
            ))}
          </div>

          {/* SECTION 2: Per-Model Grouped Bar Chart */}
          {perModelChartData.length > 0 && (
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-white">Per-Model Score Comparison</span>
                <FieldTooltip description="Side-by-side comparison of Accuracy, Completeness, and Friendliness for each AI model tested." />
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={perModelChartData} barCategoryGap="25%" barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
                  {(['Accuracy', 'Completeness', 'Friendliness'] as const).map((metric, i) => (
                    <Bar key={metric} dataKey={metric} fill={Object.values(MODEL_COLORS)[i]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* Per-model breakdown table */}
              <div className="mt-4 space-y-2">
                {perModelChartData.map(({ name, Accuracy, Completeness, Friendliness }) => (
                  <div key={name} className="flex items-center gap-3 py-2.5 px-3 bg-zinc-800/40 rounded-xl">
                    <span className="text-xs font-semibold text-white w-20 shrink-0">{name}</span>
                    {[
                      { label: 'Accuracy', val: Accuracy, color: '#3b82f6', tip: TOOLTIPS.accuracyPerModel },
                      { label: 'Completeness', val: Completeness, color: '#10b981', tip: TOOLTIPS.completenessPerModel },
                      { label: 'Friendliness', val: Friendliness, color: '#8b5cf6', tip: TOOLTIPS.modelFriendlinessPerModel },
                    ].map(({ label, val, color, tip }) => (
                      <div key={label} className="flex-1 text-center">
                        <div className="flex justify-center items-center gap-1 mb-0.5">
                          <span className="text-[9px] text-zinc-500">{label}</span>
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
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-white">Multi-Metric Radar</span>
                <FieldTooltip description="Radar chart showing accuracy, completeness, and friendliness for each model simultaneously." />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData} cx="50%" cy="50%">
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                  {perModelChartData.map(({ name }, i) => (
                    <Radar key={name} name={name} dataKey={name} stroke={RADAR_COLORS[i % RADAR_COLORS.length]}
                      fill={RADAR_COLORS[i % RADAR_COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* SECTION 4: Consistency */}
          <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold text-white">Response Consistency</span>
              <FieldTooltip description={TOOLTIPS.consistencyScore} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
              <div className="flex justify-center">
                <ConsistencyGauge score={consistencyScore} flag={consistencyFlag} />
              </div>
              <div className="sm:col-span-2 space-y-3">
                {[
                  { label: 'Consistency Score', val: `${Math.round(consistencyScore)}/100`, tip: TOOLTIPS.consistencyScore, color: consistencyScore >= 60 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Answer Variation', val: `${Math.round(variationScore)}%`, tip: TOOLTIPS.variationScore, color: variationScore > 50 ? 'text-red-400' : 'text-emerald-400' },
                  { label: 'Avg Response Similarity', val: `${Math.round(avgSimilarity)}%`, tip: TOOLTIPS.avgSimilarity, color: 'text-zinc-300' },
                  { label: 'Models Tested', val: totalModels, tip: TOOLTIPS.totalModels, color: 'text-blue-400' },
                  { label: 'Models Not Citing', val: modelsNotCiting.length, tip: TOOLTIPS.modelsNotCiting, color: modelsNotCiting.length > 0 ? 'text-red-400' : 'text-emerald-400' },
                ].map(({ label, val, tip, color }) => (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-zinc-800/60 last:border-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-zinc-400">{label}</span>
                      <FieldTooltip description={tip} />
                    </div>
                    <span className={cn('text-sm font-bold', color)}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {consistencyFlag && (
              <div className="mt-4 flex items-start gap-2 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/90 leading-relaxed">{consistencyFlag}</p>
              </div>
            )}
          </div>

          {/* SECTION 5: Models Not Citing */}
          {modelsNotCiting.length > 0 && (
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-red-400" />
                <span className="text-sm font-semibold text-white">Models Not Citing Your Page</span>
                <FieldTooltip description={TOOLTIPS.modelsNotCiting} />
              </div>
              <div className="flex flex-wrap gap-2">
                {modelsNotCiting.map((model: string, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
                    <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                    <span className="text-xs text-red-200 font-medium capitalize">{model}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 6: Contradictions */}
          {contradictions.length > 0 && (
            <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl p-5">
              <button onClick={() => toggle('contradictions')}
                className="w-full flex items-center justify-between hover:bg-zinc-800/40 transition-colors rounded-lg -mx-2 px-2 py-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span className="text-sm font-semibold text-white">Detected Contradictions</span>
                  <FieldTooltip description={TOOLTIPS.contradictions} />
                  <Badge className="bg-rose-500/15 text-rose-300 border border-rose-500/20 text-xs">{contradictions.length}</Badge>
                </div>
                {expandedSection === 'contradictions' ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
              </button>
              {expandedSection === 'contradictions' && (
                <div className="mt-4 space-y-2">
                  {contradictions.map((c: any, i: number) => (
                    <div key={i} className="p-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
                      <p className="text-xs text-rose-200/90">{typeof c === 'string' ? c : JSON.stringify(c)}</p>
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
