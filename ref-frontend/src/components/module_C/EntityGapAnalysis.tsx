'use client'

import { useState, useMemo, useRef, useEffect, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Database, AlertTriangle, XCircle,
  Hash, Target, AlertCircle, ChevronDown, ChevronUp, MessageSquare
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

interface EntityGapAnalysisProps {
  jobId?: string | null
  url?: string
  projectId?: string | null
}

const TOOLTIPS = {
  totalEntities: 'Total named entities detected on the page using NLP. Includes persons, organisations, locations, products, concepts, etc.',
  entityTypes: 'Distribution of entity types found. A balanced mix signals comprehensive, well-structured content.',
  entityDensity: 'Detected entities per 500 visible words. Higher values usually indicate richer topical coverage, as long as the content stays natural.',
  wordCount: 'Total visible word count after stripping HTML. Used to calibrate entity density and readability metrics.',
  entityCoveragePct: 'What percentage of the expected topical entities are actually present on the page.',
  matchedCount: 'Number of expected entities your page explicitly mentions.',
  expectedCount: 'Total number of entities that authoritative sources associate with your topic.',
  missingEntities: 'Expected topical entities absent from your page. AI models cite pages that mention these.',
  criticalMissing: 'High-importance missing entities that significantly impact AI citation probability.',
  missingFacts: 'Factual statements that AI models expect but cannot find on your page.',
  classification: 'Severity breakdown of all missing information. Critical gaps directly reduce AI citation rates.',
  gapPct: 'Percentage of all expected knowledge that is currently absent from your page.',
  riskLevel: 'Overall risk rating for AI discoverability based on knowledge completeness.',
  missingEntityCount: 'Number of distinct entity names missing from the page.',
  missingFactCount: 'Number of factual claims missing from the page content.',
  totalMissing: 'Combined count of missing entities and missing facts.',
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

function Section({ title, icon, children, defaultOpen = true, badge }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; badge?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-zinc-800/30 border border-zinc-800 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen((v: boolean) => !v)}
        className="w-full flex items-center justify-between p-5 hover:bg-zinc-800/40 transition-colors">
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="text-sm font-semibold text-white">{title}</span>
          {badge}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

export default function EntityGapAnalysis({ jobId, url, projectId }: EntityGapAnalysisProps) {
  const [showAllMissing, setShowAllMissing] = useState(false)
  const [showAllFacts, setShowAllFacts] = useState(false)
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

  const entityExt = modules.entity_extraction as any
  const entityCov = modules.entity_coverage as any
  const missingInfo = modules.missing_info as any

  const entityTypeData = useMemo(() => {
    if (!entityExt?.entity_types_breakdown) return []
    const colors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16']
    return Object.entries(entityExt.entity_types_breakdown as Record<string, string[] | number>)
      .map(([name, rawValue], i) => {
        const entities = Array.isArray(rawValue) ? rawValue : []
        const examples = entities.slice(0, 3)
        const value = typeof rawValue === 'number' ? rawValue : entities.length
        return { name, value, fill: colors[i % colors.length], examples }
      })
      .filter(({ value }) => value > 0)
      .sort((a, b) => b.value - a.value)
  }, [entityExt])

  const classificationData = useMemo(() => {
    if (!missingInfo?.classification) return []
    return [
      { name: 'Critical', value: missingInfo.classification.critical_count ?? 0, fill: '#ef4444' },
      { name: 'Important', value: missingInfo.classification.important_count ?? 0, fill: '#f59e0b' },
      { name: 'Minor', value: missingInfo.classification.minor_count ?? 0, fill: '#6b7280' },
    ].filter((d) => d.value > 0)
  }, [missingInfo])

  const coveragePct = entityCov?.entity_coverage_pct ?? entityCov?.coverage?.entity_coverage_pct ?? 0
  const matchedCount = entityCov?.coverage?.matched_count ?? 0
  const expectedCount = entityCov?.coverage?.expected_count ?? 0
  const missingCount = Math.max(0, expectedCount - matchedCount)

  const coverageDonut = useMemo(() => [
    { name: 'Matched', value: matchedCount, fill: '#10b981' },
    { name: 'Missing', value: missingCount, fill: '#ef4444' },
  ], [matchedCount, missingCount])

  const riskLevel = missingInfo?.gap?.risk_level ?? 'Unknown'
  const riskColor = riskLevel === 'High Risk' ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : riskLevel === 'Medium Risk' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
    : 'text-green-400 bg-green-500/10 border-green-500/20'

  const missingEntities: any[] = entityCov?.missing_entities ?? []
  const criticalMissing: any[] = entityCov?.critical_missing ?? []
  const missingFacts: string[] = missingInfo?.missing_facts ?? []

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
          <h2 className="text-xl font-semibold text-white">Entity &amp; Knowledge Gap Analysis</h2>
          <p className="text-sm text-zinc-400 mt-0.5">What your page is missing that AI engines expect to find</p>
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
          title="Analyzing Entity and Gap Coverage"
        />
      )}

      {!hasData && !isLoadingData && !isAnalyzing && jobId && (
        <AnalysisEmptyState
          icon={<Database className="w-8 h-8 text-zinc-600" />}
          title="No Entity Analysis Data"
          description="Run an analysis to discover entity gaps between your page and AI model expectations."
          onRunAnalysis={handleRunAnalysis}
          isAnalyzing={isAnalyzing}
        />
      )}

      {hasData && !isLoadingData && !isAnalyzing && (
        <>
          <div className={cn('flex items-center gap-3 p-4 rounded-xl border', riskColor)}>
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">Knowledge Gap Risk:</span>
                <span className="text-sm font-bold">{riskLevel}</span>
                <FieldTooltip description={TOOLTIPS.riskLevel} />
              </div>
              {missingInfo?.gap?.gap_pct !== undefined && (
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-xs opacity-80">{missingInfo.gap.gap_pct}% of expected knowledge is absent from this page</p>
                  <FieldTooltip description={TOOLTIPS.gapPct} />
                </div>
              )}
            </div>
          </div>

          <Section title="Entity Extraction" icon={<Hash className="w-4 h-4 text-blue-400" />}
            badge={entityExt?.total_entities_detected !== undefined ? (
              <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/20 text-xs ml-1">
                {entityExt.total_entities_detected} entities
              </Badge>
            ) : undefined}>
            <div className="mb-3">
              <button
                type="button"
                onClick={() =>
                  runMetricAskAi(
                    'Entity Extraction',
                    `Interpret entity extraction results and what they imply for AI retrieval.\n${JSON.stringify({
                      total_entities_detected: entityExt?.total_entities_detected,
                      entity_density: entityExt?.entity_density,
                      word_count: entityExt?.word_count,
                      entity_types_breakdown: entityExt?.entity_types_breakdown,
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Detected', val: entityExt?.total_entities_detected ?? 0, tip: TOOLTIPS.totalEntities, color: 'text-blue-400' },
                { label: 'Density / 500w', val: (entityExt?.entity_density ?? 0).toFixed(1), tip: TOOLTIPS.entityDensity, color: 'text-purple-400' },
                { label: 'Word Count', val: (entityExt?.word_count ?? 0).toLocaleString(), tip: TOOLTIPS.wordCount, color: 'text-cyan-400' },
                { label: 'Unique Types', val: Object.keys(entityExt?.entity_types_breakdown ?? {}).length, tip: TOOLTIPS.entityTypes, color: 'text-amber-400' },
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
            {entityTypeData.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-3">
                  <span className="text-xs text-zinc-400">Entity Type Distribution</span>
                  <FieldTooltip description={TOOLTIPS.entityTypes} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={entityTypeData} layout="vertical" barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
                      <Tooltip content={<PieTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Count">
                        {entityTypeData.map((_: any, idx: number) => <Cell key={idx} fill={entityTypeData[idx].fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {entityTypeData.map(({ name, value, fill, examples }: any) => (
                      <div key={name} className="py-1.5 px-2 rounded-lg bg-zinc-800/40">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: fill }} />
                            <span className="text-xs text-zinc-300">{name}</span>
                          </div>
                          <span className="text-xs font-semibold text-white">{value}</span>
                        </div>
                        {examples.length > 0 && (
                          <p className="mt-1 pl-4 text-[10px] text-zinc-500 truncate">
                            {examples.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section title="Entity Coverage" icon={<Target className="w-4 h-4 text-emerald-400" />}>
            <div className="mb-3">
              <button
                type="button"
                onClick={() =>
                  runMetricAskAi(
                    'Entity Coverage',
                    `Interpret this entity coverage snapshot and identify highest-impact missing entities.\n${JSON.stringify({
                      entity_coverage_pct: coveragePct,
                      matched_count: matchedCount,
                      expected_count: expectedCount,
                      missing_entities_count: missingEntities.length,
                      critical_missing_count: entityCov?.critical_missing_count ?? 0,
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="flex flex-col items-center">
                <div className="relative" style={{ width: 180, height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={coverageDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={75} dataKey="value" strokeWidth={0}>
                        {coverageDonut.map((_: any, idx: number) => <Cell key={idx} fill={coverageDonut[idx].fill} />)}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-bold text-white">{Math.round(coveragePct)}%</span>
                    <span className="text-[10px] text-zinc-500">coverage</span>
                  </div>
                </div>
                <div className="flex gap-4 mt-2">
                  {[{ name: 'Matched', fill: '#10b981' }, { name: 'Missing', fill: '#ef4444' }].map(({ name, fill }) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: fill }} />
                      <span className="text-xs text-zinc-400">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Entity Coverage', val: `${Math.round(coveragePct)}%`, tip: TOOLTIPS.entityCoveragePct, color: coveragePct > 50 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Matched Entities', val: matchedCount, tip: TOOLTIPS.matchedCount, color: 'text-emerald-400' },
                  { label: 'Expected Entities', val: expectedCount, tip: TOOLTIPS.expectedCount, color: 'text-zinc-300' },
                  { label: 'Missing Entities', val: missingEntities.length, tip: TOOLTIPS.missingEntities, color: 'text-red-400' },
                  { label: 'Critical Missing', val: entityCov?.critical_missing_count ?? 0, tip: TOOLTIPS.criticalMissing, color: 'text-rose-400' },
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
          </Section>

          {criticalMissing.length > 0 && (
            <Section title="Critical Missing Entities" icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
              badge={
                <Badge className="bg-rose-500/15 text-rose-300 border border-rose-500/20 text-xs ml-1">
                  {criticalMissing.length} critical
                </Badge>
              }>
              <div className="flex items-center gap-1 mb-3">
                <span className="text-xs text-zinc-500">High-importance entities whose absence most strongly reduces AI citation probability</span>
                <FieldTooltip description={TOOLTIPS.criticalMissing} />
              </div>
              <div className="flex flex-wrap gap-2">
                {criticalMissing.map((entity: any, i: number) => {
                  const name = typeof entity === 'string' ? entity : (entity?.name ?? entity?.text ?? String(entity))
                  const type = entity?.type ?? entity?.label ?? ''
                  return (
                    <div key={i} className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-1.5">
                      <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                      <span className="text-xs text-rose-200 font-medium">{name}</span>
                      {type && <span className="text-[10px] text-rose-400/70">({type})</span>}
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {missingEntities.length > 0 && (
            <Section title="All Missing Entities" icon={<XCircle className="w-4 h-4 text-red-400" />}
              badge={
                <Badge className="bg-red-500/15 text-red-300 border border-red-500/20 text-xs ml-1">
                  {missingEntities.length} missing
                </Badge>
              }>
              <div className="flex items-center gap-1 mb-3">
                <span className="text-xs text-zinc-500">All expected entities not found on this page</span>
                <FieldTooltip description={TOOLTIPS.missingEntities} />
              </div>
              <div className="flex flex-wrap gap-2">
                {(showAllMissing ? missingEntities : missingEntities.slice(0, 20)).map((entity: any, i: number) => {
                  const name = typeof entity === 'string' ? entity : (entity?.name ?? entity?.text ?? String(entity))
                  const type = entity?.type ?? entity?.label ?? ''
                  return (
                    <div key={i} className="flex items-center gap-1.5 bg-zinc-800/60 border border-zinc-700 rounded-lg px-2.5 py-1">
                      <span className="text-xs text-zinc-300">{name}</span>
                      {type && <span className="text-[10px] text-zinc-500">({type})</span>}
                    </div>
                  )
                })}
              </div>
              {missingEntities.length > 20 && (
                <button onClick={() => setShowAllMissing((v: boolean) => !v)}
                  className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  {showAllMissing ? 'Show less' : `Show all ${missingEntities.length} entities`}
                </button>
              )}
            </Section>
          )}

          <Section title="Knowledge Gap Analysis" icon={<AlertCircle className="w-4 h-4 text-amber-400" />}>
            <div className="mb-3">
              <button
                type="button"
                onClick={() =>
                  runMetricAskAi(
                    'Knowledge Gap Analysis',
                    `Explain this knowledge gap profile and prioritize what to add first.\n${JSON.stringify({
                      missing_entity_count: missingInfo?.missing_entity_count ?? 0,
                      missing_fact_count: missingInfo?.missing_fact_count ?? 0,
                      total_missing: missingInfo?.total_missing ?? 0,
                      gap: missingInfo?.gap,
                      classification: missingInfo?.classification,
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
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Missing Entities', val: missingInfo?.missing_entity_count ?? 0, tip: TOOLTIPS.missingEntityCount, color: 'text-red-400' },
                { label: 'Missing Facts', val: missingInfo?.missing_fact_count ?? 0, tip: TOOLTIPS.missingFactCount, color: 'text-amber-400' },
                { label: 'Total Missing', val: missingInfo?.total_missing ?? 0, tip: TOOLTIPS.totalMissing, color: 'text-white' },
              ].map(({ label, val, tip, color }) => (
                <div key={label} className="bg-zinc-800/50 rounded-xl p-3 text-center">
                  <div className="flex justify-center items-center gap-1 mb-1">
                    <span className="text-[10px] text-zinc-500">{label}</span>
                    <FieldTooltip description={tip} />
                  </div>
                  <span className={cn('text-2xl font-bold', color)}>{val}</span>
                </div>
              ))}
            </div>
            {classificationData.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-1 mb-3">
                  <span className="text-xs text-zinc-400">Missing Info Classification</span>
                  <FieldTooltip description={TOOLTIPS.classification} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div style={{ height: 160 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={classificationData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" strokeWidth={0}>
                          {classificationData.map((_: any, idx: number) => <Cell key={idx} fill={classificationData[idx].fill} />)}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {classificationData.map(({ name, value, fill }: any) => (
                      <div key={name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-800/40">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: fill }} />
                          <span className="text-xs text-zinc-300">{name}</span>
                        </div>
                        <span className="text-sm font-bold text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {missingFacts.length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-3">
                  <span className="text-xs text-zinc-400">Missing Fact Statements</span>
                  <FieldTooltip description={TOOLTIPS.missingFacts} />
                </div>
                <div className="space-y-2">
                  {(showAllFacts ? missingFacts : missingFacts.slice(0, 5)).map((fact: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-xs text-amber-200/90 leading-relaxed">{fact}</span>
                    </div>
                  ))}
                </div>
                {missingFacts.length > 5 && (
                  <button onClick={() => setShowAllFacts((v: boolean) => !v)}
                    className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    {showAllFacts ? 'Show less' : `Show all ${missingFacts.length} facts`}
                  </button>
                )}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
