'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Play,
  Copy,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Cpu,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Layout,
  Code2,
  Info,
  MessageSquare
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatCard } from '@/components/ui/StatCard'
import { useGetSessionQuery } from '@/store/api/sessionApi'
import { useGetJobSchemaQuery, useGenerateJobSchemaMutation, JobSchemaResult } from '@/store/api/jobApi'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleAAskAiChatShell, type ModuleAAskAiChatTurn } from './ModuleAAskAiChatShell'
import {
  useAskModuleBAIMutation,
  useLazyGetModuleBSuggestedQuestionsQuery,
} from '@/store/api/module_B/moduleBApi'

interface SchemaGeneratorTableProps {
  sessionId: string
  jobId: string | null
  sessionStatus?: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
}

type Tab = 'priority' | 'gaps' | 'patches' | 'schema' | 'aifiles'

function chatMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/* ------------------------------------------------------------------ */
/*  Mini components for decomposition and tags                        */
/* ------------------------------------------------------------------ */

function DimBar({
  label,
  val,
  max,
  accent = 'blue',
  onAskAI,
}: {
  label: string
  val: number
  max: number
  accent?: string
  onAskAI?: () => void
}) {
  const pct = Math.round((val / max) * 100)
  const colorClass = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
  
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-(--nd-text-muted)">
        <div className="flex items-center gap-2">
          <span>{label}</span>
          {onAskAI && (
            <button
              type="button"
              onClick={onAskAI}
              className="text-[9px] px-1.5 py-0.5 rounded border border-(--nd-border) text-(--nd-text-muted) hover:text-(--nd-text-primary) hover:border-(--nd-text-secondary) transition-colors"
            >
              Ask AI
            </button>
          )}
        </div>
        <span className="text-(--nd-text-secondary)">{val.toFixed(1)}<span className="text-(--nd-text-muted)">/{max}</span></span>
      </div>
      <div className="h-1.5 w-full bg-(--nd-border) rounded-full overflow-hidden border border-(--nd-border)">
        <div 
          className={cn('h-full transition-all duration-1000 ease-out rounded-full', colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function SevTag({ s }: { s: string }) {
  const cfg: Record<string, string> = {
    Critical: 'bg-rose-50 text-rose-600 border-rose-200',
    High: 'bg-orange-50 text-orange-600 border-orange-200',
    Medium: 'bg-amber-50 text-amber-600 border-amber-200',
    Low: 'bg-zinc-100 text-zinc-600 border-zinc-300',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight border', cfg[s] || cfg.Medium)}>
      {s}
    </span>
  )
}

function LiftTag({ lift }: { lift: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 uppercase tracking-tight">
      {lift}
    </span>
  )
}

function GradeBadge({ grade }: { grade: string }) {
  const gradeMap: Record<string, string> = {
    'A': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'B': 'bg-blue-50 text-blue-700 border-blue-200',
    'C': 'bg-amber-50 text-amber-700 border-amber-200',
    'D': 'bg-rose-50 text-rose-700 border-rose-200',
    'F': 'bg-rose-50 text-rose-700 border-rose-200',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight border', gradeMap[grade] || 'bg-zinc-100 text-zinc-600 border-zinc-300')}>
      Grade {grade}
    </span>
  )
}

export function SchemaGeneratorTable({
  sessionId,
  jobId,
}: SchemaGeneratorTableProps) {
  const [schemaData, setSchemaData] = useState<JobSchemaResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState('auto')
  const [customUrl, setCustomUrl] = useState('')
  const [schemaJobId, setSchemaJobId] = useState<string | null>(null)
  const [lastCreatedAt, setLastCreatedAt] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('priority')
  const [expandedGap, setExpandedGap] = useState<number | null>(null)
  const [expandedPatch, setExpandedPatch] = useState<number | null>(null)
  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ModuleAAskAiChatTurn[]>([])
  const [chatSuggestions, setChatSuggestions] = useState<string[]>([])
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const { data: sessionData } = useGetSessionQuery(sessionId)
  const session = sessionData?.session
  const [generateJobSchema] = useGenerateJobSchemaMutation()
  const [askModuleBAI, { isLoading: isAskingAI, error: askAIError, reset: resetAskAI }] =
    useAskModuleBAIMutation()
  const [fetchSuggestedQuestions] = useLazyGetModuleBSuggestedQuestionsQuery()
  const { data: schemaResult } = useGetJobSchemaQuery(schemaJobId || '', {
    skip: !schemaJobId,
    pollingInterval: loading ? 3000 : 0,
  })

  const handleGenerate = async () => {
    if (!jobId) {
      setError('No crawl job found. Run a crawl first.')
      return
    }
    setLoading(true)
    setError(null)
    setSchemaData(null)
    try {
      await generateJobSchema({
        jobId,
        schemaType: selectedType === 'auto' ? undefined : selectedType,
        url: customUrl.trim() || undefined,
      }).unwrap()
      setSchemaJobId(jobId)
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Failed to generate schema')
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!schemaResult) return
    const at = schemaResult.createdAt ?? null
    if (lastCreatedAt && at && at <= lastCreatedAt) return
    if (!loading) return
    if (schemaResult.success) {
      setSchemaData(schemaResult)
      setLoading(false)
    } else if (schemaResult.error) {
      setError(schemaResult.message || schemaResult.error || 'Failed')
      setLoading(false)
    }
    if (at) setLastCreatedAt(at)
  }, [loading, schemaResult, lastCreatedAt])

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }

  const S = schemaData?.summary
  const dims = schemaData?.lcs_score_report?.dimension_scores || {}
  const recs = schemaData?.lcs_score_report?.top_recommendations || []
  const gaps = schemaData?.gap_report?.all_gaps || []
  const patches = schemaData?.fix_patches || []
  const ai = S?.ai_file_status || {}
  const score = S?.lcs_score ?? 0

  const originFromUrl = (() => {
    const raw = schemaData?.url || session?.startUrl
    if (!raw) return ''
    try {
      return new URL(raw).origin
    } catch {
      return ''
    }
  })()

  const dimLabels: Record<string, string> = {
    presence: 'Presence',
    completeness: 'Completeness',
    entity_clarity: 'Entity Clarity',
    nesting: 'Nesting',
    freshness: 'Freshness',
    ai_files: 'AI Files',
  }
  const dimMax: Record<string, number> = {
    presence: 20,
    completeness: 25,
    entity_clarity: 20,
    nesting: 10,
    freshness: 12,
    ai_files: 13,
  }

  const llmsPatch = patches.find((p: any) => p.patch_json?._file_type === 'llms.txt')
  const llmsFullPatch = patches.find((p: any) => p.patch_json?._file_type === 'llms-full.txt')
  const factsPatch = patches.find((p: any) => p.patch_json?._file_type === 'facts.json')

  const openAskAiDialog = async (seedQuestion?: string) => {
    if (!jobId) return
    resetAskAI()
    setChatMessages([])
    setChatInput(seedQuestion || '')
    setAskDialogOpen(true)
    try {
      const suggested = await fetchSuggestedQuestions(jobId).unwrap()
      setChatSuggestions(suggested?.questions ?? [])
    } catch {
      setChatSuggestions([])
    }
  }

  const submitAskAi = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!jobId || !chatInput.trim() || isAskingAI) return

    const question = chatInput.trim()
    setChatInput('')

    const priorHistory = chatMessages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const userTurn: ModuleAAskAiChatTurn = { id: chatMessageId(), role: 'user', content: question }
    setChatMessages((prev) => [...prev, userTurn])

    try {
      const res = await askModuleBAI({
        jobId,
        body: {
          question,
          conversationHistory: priorHistory.length ? priorHistory : undefined,
        },
      }).unwrap()

      const text = (res?.data?.answer ?? res?.answer ?? '').trim()
      const sources = res?.data?.sources ?? res?.sources
      if (!text) {
        setChatMessages((prev) => prev.filter((m) => m.id !== userTurn.id))
        setChatInput(question)
        return
      }

      setChatMessages((prev) => [
        ...prev,
        { id: chatMessageId(), role: 'assistant', content: text, sources },
      ])
    } catch {
      setChatMessages((prev) => prev.filter((m) => m.id !== userTurn.id))
      setChatInput(question)
    }
  }

  useEffect(() => {
    if (!askDialogOpen || !chatScrollRef.current) return
    const el = chatScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [askDialogOpen, chatMessages, isAskingAI])

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
            setChatSuggestions([])
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
          <ModuleAAskAiChatShell
            chatScrollRef={chatScrollRef}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            isAskingAI={isAskingAI}
            askAIError={askAIError}
            onSubmit={submitAskAi}
            onSuggestionClick={(text: string) => setChatInput(text)}
            suggestions={chatSuggestions}
          />
        </DialogContent>
      </Dialog>

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-(--nd-text-primary)">Schema Intelligence</h2>
          <p className="text-sm text-(--nd-text-muted) mt-1">Generate and analyze AI-optimized Schema.org markup</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => openAskAiDialog('Summarize my schema intelligence matrix and top priorities.')}
            disabled={!jobId || isAskingAI}
            className="bg-linear-to-r from-purple-500 via-pink-500 to-amber-300 text-black hover:opacity-95 rounded-xl px-4"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Ask AI
          </Button>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">AIVS™ Active</span>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={loading || !jobId}
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 px-6"
          >
            {loading ? (
              <Cpu className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {loading ? 'Generating...' : 'Generate Schema'}
          </Button>
        </div>
      </div>

      {/* Configuration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="Schema Type" description="Select the most appropriate schema for your page">
          <div className="space-y-4">
            <Select value={selectedType} onValueChange={setSelectedType} disabled={loading}>
              <SelectTrigger className="bg-white border-(--nd-border) text-(--nd-text-primary) rounded-xl h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-(--nd-border)">
                {[
                  ['auto', '🤖 Auto-detect (Recommended)'],
                  ['Organization', '🏢 Organization'],
                  ['LocalBusiness', '🏪 Local Business'],
                  ['WebPage', '📄 WebPage'],
                  ['Article', '📰 Article'],
                  ['BlogPosting', '✍️ Blog Post'],
                  ['Product', '🛍️ Product'],
                  ['Service', '⚙️ Service'],
                  ['FAQPage', '❓ FAQ Page'],
                  ['BreadcrumbList', '🍞 Breadcrumb'],
                  ['Person', '👤 Person'],
                  ['Event', '📅 Event'],
                  ['Recipe', '🍳 Recipe'],
                  ['HowTo', '📖 How To'],
                  ['VideoObject', '🎥 Video'],
                  ['Course', '🎓 Course'],
                  ['JobPosting', '💼 Job Posting'],
                  ['Review', '⭐ Review'],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v} className="text-(--nd-text-secondary) focus:bg-(--nd-bg) focus:text-(--nd-text-primary)">
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SectionCard>

        <SectionCard title="Target URL" description="Specify a custom URL or use the session start URL">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={session?.startUrl ? `e.g. ${session.startUrl}` : 'https://example.com/page'}
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              disabled={loading}
              className="bg-white border-(--nd-border) text-(--nd-text-primary) rounded-xl h-11"
            />
            <Button
              variant="outline"
              onClick={() => setCustomUrl(session?.startUrl || '')}
              disabled={loading || !session?.startUrl}
              className="bg-white border-(--nd-border) text-(--nd-text-secondary) hover:text-(--nd-text-primary) hover:bg-(--nd-bg) rounded-xl h-11 whitespace-nowrap"
            >
              Use Start
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          <p className="text-sm text-rose-200/80 font-medium">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="py-24 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-(--nd-bg) flex items-center justify-center relative">
            <Cpu className="w-8 h-8 text-emerald-400 animate-pulse" />
            <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-2xl animate-ping" />
          </div>
          <div className="space-y-1">
            <h3 className="text-(--nd-text-primary) font-semibold">Analyzing Intelligence</h3>
            <p className="text-xs text-(--nd-text-muted) max-w-xs mx-auto">
              Running LCS™ scoring, 4-model analysis, and generating AI-optimized patches...
            </p>
          </div>
        </div>
      )}

      {/* Dashboard Results */}
      {S && !loading && (
        <div className="space-y-6">
          {/* Priority Alert Banner */}
          {S.priority_alert && (
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
              <div className="flex-1">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mr-2">Priority Alert</span>
                <p className="text-sm text-amber-200/90">{S.priority_alert_message}</p>
              </div>
            </div>
          )}

          {/* Schema Types Strip */}
          {S.schema_types_present && S.schema_types_present.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-(--nd-bg) border border-(--nd-border)">
              <span className="text-[10px] font-bold text-(--nd-text-muted) uppercase tracking-wider">Types Detected:</span>
              <div className="flex flex-wrap gap-2">
                {S.schema_types_present.map((type: string) => (
                  <span key={type} className="px-2 py-0.5 rounded text-[10px] font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200">
                    {type}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              label="LCS™ Score"
              value={score}
              subtext={`Grade ${S.grade}`}
              icon={ShieldCheck}
              accent={score >= 80 ? 'emerald' : score >= 50 ? 'amber' : 'rose'}
              progress={score}
            />
            <StatCard
              label="Coverage"
              value={`${S.coverage_pct}%`}
              subtext="Schema completeness"
              icon={Layout}
              accent="blue"
              progress={S.coverage_pct}
            />
            <StatCard
              label="AI Readiness"
              value={S.model_scores?.gpt4?.score ?? '—'}
              subtext="GPT-4 Citation probability"
              icon={Zap}
              accent="cyan"
              progress={S.model_scores?.gpt4?.score}
            />
            <StatCard
              label="Active Gaps"
              value={gaps.length}
              subtext={`${recs.length} Priority fixes`}
              icon={AlertCircle}
              accent={gaps.length > 0 ? 'amber' : 'emerald'}
            />
            <StatCard
              label="AIVS™ pts"
              value={S.aivs_contribution ?? '0'}
              subtext="Total AIVS™ points"
              icon={Zap}
              accent="cyan"
            />
          </div>

          {/* Main Content Area */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Detailed Scores */}
            <div className="lg:col-span-1 space-y-6">
              <SectionCard title="Score Decomposition" description="Analysis across SOP-006 dimensions">
                <div className="space-y-5">
                  {Object.entries(dims).map(([key, val]: [string, any]) => (
                    <DimBar
                      key={key}
                      label={dimLabels[key] || key}
                      val={val}
                      max={dimMax[key] || 100}
                      onAskAI={() =>
                        openAskAiDialog(
                          `Explain the ${dimLabels[key] || key} matrix score (${Number(val).toFixed(1)}/${dimMax[key] || 100}) and what exact fixes I should do first.`,
                        )
                      }
                    />
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Model Scores" description="Performance against leading AI models">
                <div className="space-y-3">
                  {Object.entries(S.model_scores || {}).map(([model, data]: [string, any]) => (
                    <div key={model} className="flex items-center justify-between p-3 rounded-xl bg-(--nd-bg) border border-(--nd-border)">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-(--nd-text-primary) uppercase">{model}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-(--nd-text-muted)">{data.score.toFixed(2)}</span>
                        <GradeBadge grade={data.grade} />
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="AI Files Status" description="LLM crawl permissions and entity data">
                <div className="space-y-3">
                  {[
                    { key: 'llms_txt', name: 'llms.txt', lift: '+25%' },
                    { key: 'llms_full_txt', name: 'llms-full.txt', lift: '+20%' },
                    { key: 'facts_json', name: 'facts.json', lift: '+18%' },
                  ].map(({ key, name, lift }) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-(--nd-bg) border border-(--nd-border)">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-2 h-2 rounded-full',
                          ai[key] ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                        )} />
                        <span className="text-xs font-semibold text-(--nd-text-primary)">{name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openAskAiDialog(
                              `How can I improve ${name} readiness? Current status is ${ai[key] ? 'Detected' : 'Not Detected'}.`,
                            )
                          }
                          className="text-[9px] px-1.5 py-0.5 rounded border border-(--nd-border) text-(--nd-text-muted) hover:text-(--nd-text-primary) hover:border-(--nd-text-secondary) transition-colors"
                        >
                          Ask AI
                        </button>
                        <span className={cn(
                          'text-[10px] font-bold uppercase tracking-wider',
                          ai[key] ? 'text-emerald-400' : 'text-rose-400'
                        )}>
                          {ai[key] ? 'Detected' : 'Not Detected'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            {/* Right Column: Tabbed Interface */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-(--nd-border) rounded-2xl overflow-hidden flex flex-col h-full">
                {/* Tabs Header */}
                <div className="flex items-center gap-1 p-1 bg-(--nd-bg) border-b border-(--nd-border)">
                  {(['priority', 'gaps', 'patches', 'schema', 'aifiles'] as Tab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        'px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all',
                        tab === t 
                          ? 'bg-white text-(--nd-text-primary) shadow-sm' 
                          : 'text-(--nd-text-muted) hover:text-(--nd-text-secondary)'
                      )}
                    >
                      {t === 'priority' ? `Priority Queue (${recs.length})` : 
                       t === 'gaps' ? `All Gaps (${gaps.length})` : 
                       t === 'patches' ? `Fix Patches (${patches.length})` : 
                       t === 'schema' ? 'Schema Output' : 'AI Files'}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto max-h-150 custom-scrollbar">
                  {tab === 'priority' && (
                    <div className="divide-y divide-(--nd-border)">
                      {recs.map((rec: any, i: number) => (
                        <div key={i} className="p-4 hover:bg-(--nd-bg) transition-colors flex items-center gap-4">
                          <span className="text-xs font-mono text-(--nd-text-muted)">#{rec.priority}</span>
                          <SevTag s={rec.severity} />
                          <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-(--nd-text-primary) truncate">
                                {rec.schema_type}{rec.property ? ` / ${rec.property}` : ''}
                              </h4>
                              <p className="text-[11px] text-(--nd-text-muted) truncate mt-0.5">{rec.fix_instruction}</p>
                          </div>
                          <LiftTag lift={rec.estimated_lift} />
                        </div>
                      ))}
                      {recs.length === 0 && (
                        <div className="p-12 text-center">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mx-auto mb-3" />
                          <p className="text-sm text-(--nd-text-muted)">No priority fixes — excellent coverage</p>
                        </div>
                      )}
                    </div>
                  )}

                  {tab === 'gaps' && (
                    <div className="divide-y divide-(--nd-border)">
                      {gaps.map((gap: any, i: number) => (
                        <div key={i} className="group">
                          <button
                            onClick={() => setExpandedGap(expandedGap === i ? null : i)}
                            className="w-full p-4 flex items-center gap-4 hover:bg-(--nd-bg) transition-colors text-left"
                          >
                            <SevTag s={gap.severity} />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-(--nd-text-primary)">
                                {gap.schema_type} <span className="text-(--nd-text-muted) ml-1">/ {gap.property_name || 'Generic'}</span>
                              </h4>
                              <p className="text-[11px] text-(--nd-text-muted) mt-0.5">{gap.gap_type?.replace(/_/g, ' ')}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <LiftTag lift={`+${gap.citation_lift_est?.toFixed(0)}%`} />
                              {expandedGap === i ? <ChevronUp className="w-4 h-4 text-(--nd-text-muted)" /> : <ChevronDown className="w-4 h-4 text-(--nd-text-muted)" />}
                            </div>
                          </button>
                          {expandedGap === i && (
                            <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="p-3 rounded-xl bg-(--nd-bg) border border-(--nd-border) space-y-2">
                                <p className="text-[11px] text-(--nd-text-secondary)"><span className="text-(--nd-text-primary) font-bold uppercase text-[9px] mr-2">Issue:</span>{gap.message}</p>
                                <p className="text-[11px] text-emerald-600/80"><span className="text-emerald-600 font-bold uppercase text-[9px] mr-2">Fix:</span>{gap.fix_instruction}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {tab === 'patches' && (
                    <div className="divide-y divide-(--nd-border)">
                      {patches.map((patch: any, i: number) => {
                        const isFile = patch.patch_json?._file_type
                        const pKey = `patch-${i}`
                        const patchText = isFile
                          ? (patch.patch_json._content || JSON.stringify(patch.patch_json, null, 2))
                          : patch.patch_text || ''
                        
                        return (
                          <div key={i} className="group">
                            <button
                              onClick={() => setExpandedPatch(expandedPatch === i ? null : i)}
                              className="w-full p-4 flex items-center gap-4 hover:bg-(--nd-bg) transition-colors text-left"
                            >
                              <SevTag s={patch.severity} />
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-(--nd-text-primary)">
                                  {isFile ? patch.patch_json._file_type : patch.schema_type}
                                </h4>
                                <p className="text-[11px] text-(--nd-text-muted) mt-0.5">{patch.gap_type?.replace(/_/g, ' ')}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <LiftTag lift={patch.estimated_lift} />
                                {expandedPatch === i ? <ChevronUp className="w-4 h-4 text-(--nd-text-muted)" /> : <ChevronDown className="w-4 h-4 text-(--nd-text-muted)" />}
                              </div>
                            </button>
                            {expandedPatch === i && (
                              <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="rounded-xl bg-slate-50 border border-(--nd-border) overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-2 bg-(--nd-bg) border-b border-(--nd-border)">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-mono text-(--nd-text-muted) uppercase tracking-widest">{isFile ? patch.patch_json._deploy_path : 'JSON-LD Patch'}</span>
                                      {patch.validation_status && (
                                        <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-full', patch.validation_status === 'valid' ? 'bg-emerald-500/10' : 'bg-rose-500/10')}>
                                          <div className={cn('w-1.5 h-1.5 rounded-full', patch.validation_status === 'valid' ? 'bg-emerald-500' : 'bg-rose-500')} />
                                          <span className={cn('text-[9px] font-bold uppercase', patch.validation_status === 'valid' ? 'text-emerald-400' : 'text-rose-400')}>
                                            {patch.validation_status}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => { e.stopPropagation(); copyToClipboard(patchText, pKey); }}
                                      className="h-7 text-[10px] text-(--nd-text-muted) hover:text-(--nd-text-primary)"
                                    >
                                      {copiedKey === pKey ? <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" /> : <Copy className="w-3 h-3 mr-1" />}
                                      {copiedKey === pKey ? 'Copied' : 'Copy'}
                                    </Button>
                                  </div>
                                  <pre className="p-4 text-[10px] font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-75">
                                    {patchText}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {tab === 'schema' && (
                    <div className="p-4">
                      <div className="rounded-2xl bg-slate-50 border border-(--nd-border) overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-(--nd-bg) border-b border-(--nd-border)">
                          <h4 className="text-xs font-bold text-(--nd-text-primary)">Generated JSON-LD</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(schemaData?.schema_text || '', 'full-schema')}
                            className="h-8 text-[11px] text-(--nd-text-muted) hover:text-(--nd-text-primary)"
                          >
                            {copiedKey === 'full-schema' ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                            {copiedKey === 'full-schema' ? 'Copied!' : 'Copy Schema'}
                          </Button>
                        </div>
                        <pre className="p-6 text-xs font-mono text-slate-600 overflow-x-auto leading-relaxed max-h-125 custom-scrollbar">
                          {schemaData?.schema_text}
                        </pre>
                      </div>
                    </div>
                  )}

                  {tab === 'aifiles' && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                      { key: 'llms_txt', name: 'llms.txt', patch: llmsPatch, desc: 'Direct LLM crawl permission.', lift: '+25%' },
                      { key: 'llms_full_txt', name: 'llms-full.txt', patch: llmsFullPatch, desc: 'Full LLM context & documentation.', lift: '+20%' },
                      { key: 'facts_json', name: 'facts.json', patch: factsPatch, desc: 'Structured entity facts.', lift: '+18%' },
                    ].map(({ key, name, patch, desc, lift }) => {
                      const content = (key === 'llms_txt' || key === 'llms_full_txt')
                        ? patch?.patch_json?._content
                        : patch?.patch_json
                          ? JSON.stringify(patch.patch_json, null, 2)
                          : null
                      const pKey = `ai-file-${key}`
                      const liveUrl =
                        originFromUrl &&
                        (key === 'llms_txt'
                          ? `${originFromUrl}/llms.txt`
                          : key === 'llms_full_txt'
                            ? `${originFromUrl}/llms-full.txt`
                            : key === 'facts_json'
                              ? `${originFromUrl}/facts.json`
                              : '')
                        const hasTemplate = !!content
                        const hasLiveOnly = !content && ai[key] && !!liveUrl
                        
                        return (
                          <div key={key} className="rounded-2xl bg-white border border-(--nd-border) overflow-hidden flex flex-col">
                            <div className="p-4 border-b border-(--nd-border) flex items-center justify-between bg-(--nd-bg)">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-(--nd-text-muted)" />
                                <span className="text-xs font-bold text-(--nd-text-primary)">{name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div className={cn('w-1.5 h-1.5 rounded-full', ai[key] ? 'bg-emerald-500' : 'bg-rose-500')} />
                                <span className="text-[9px] font-bold text-(--nd-text-muted) uppercase">{ai[key] ? 'Live' : 'Not Detected'}</span>
                              </div>
                            </div>
                            <div className="p-4 flex-1">
                              <p className="text-[11px] text-(--nd-text-muted) mb-4">{desc}</p>
                              <div className="rounded-xl bg-slate-50 border border-(--nd-border) p-3 h-32 overflow-y-auto custom-scrollbar">
                                {hasTemplate ? (
                                  <pre className="text-[10px] font-mono text-slate-500 whitespace-pre-wrap">{content}</pre>
                                ) : hasLiveOnly ? (
                                  <div className="h-full flex flex-col items-start justify-center text-[10px] text-(--nd-text-muted) space-y-1">
                                    <span className="font-semibold text-(--nd-text-secondary)">File detected on your domain.</span>
                                    <span className="truncate">{liveUrl}</span>
                                  </div>
                                ) : (
                                  <div className="h-full flex items-center justify-center text-[10px] text-(--nd-text-muted) italic">
                                    No template available
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="px-4 py-3 bg-(--nd-bg) border-t border-(--nd-border) flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-700">{lift} Impact</span>
                              {hasTemplate && (
                                <div className="flex gap-2">
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-(--nd-text-muted) hover:text-(--nd-text-secondary)" onClick={() => copyToClipboard(content, pKey)}>
                                  <Copy className="w-3 h-3 mr-1" />
                                  {copiedKey === pKey ? 'Copied' : 'Copy'}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-(--nd-text-muted) hover:text-(--nd-text-secondary)" onClick={() => {
                                  const blob = new Blob([content], { type: 'text/plain' })
                                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
                                }}>
                                  <Download className="w-3 h-3 mr-1" />
                                  Download
                                </Button>
                              </div>
                              )}
                              {!hasTemplate && hasLiveOnly && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[10px] text-(--nd-text-muted) hover:text-(--nd-text-secondary)"
                                  onClick={() => {
                                    if (!liveUrl) return
                                    window.open(liveUrl, '_blank', 'noopener,noreferrer')
                                  }}
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  Open file
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!schemaData && !loading && !error && (
        <div className="py-24 flex flex-col items-center justify-center gap-4 text-center border-2 border-dashed border-(--nd-border) rounded-3xl">
          <div className="w-16 h-16 rounded-2xl bg-(--nd-bg) flex items-center justify-center">
            <Code2 className="w-8 h-8 text-(--nd-text-muted)" />
          </div>
          <div className="space-y-1">
            <h3 className="text-(--nd-text-primary) font-semibold">Intelligence Engine Ready</h3>
            <p className="text-sm text-(--nd-text-muted) max-w-sm mx-auto">
              Select a schema type and click generate to begin the AI-driven analysis of your page structure.
            </p>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      `}</style>
    </div>
  )
}
