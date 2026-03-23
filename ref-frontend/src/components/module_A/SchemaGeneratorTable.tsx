'use client'

import { useEffect, useState } from 'react'
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
  Info
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

interface SchemaGeneratorTableProps {
  sessionId: string
  jobId: string | null
  sessionStatus?: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
}

type Tab = 'priority' | 'gaps' | 'patches' | 'schema' | 'aifiles'

/* ------------------------------------------------------------------ */
/*  Mini components for decomposition and tags                        */
/* ------------------------------------------------------------------ */

function DimBar({ label, val, max, accent = 'blue' }: { label: string; val: number; max: number; accent?: string }) {
  const pct = Math.round((val / max) * 100)
  const colorClass = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
  
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        <span>{label}</span>
        <span className="text-zinc-300">{val.toFixed(1)}<span className="text-zinc-600">/{max}</span></span>
      </div>
      <div className="h-1.5 w-full bg-zinc-800/50 rounded-full overflow-hidden border border-zinc-800/50">
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
    Critical: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    High: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Low: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight border', cfg[s] || cfg.Medium)}>
      {s}
    </span>
  )
}

function LiftTag({ lift }: { lift: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 uppercase tracking-tight">
      {lift}
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

  const { data: sessionData } = useGetSessionQuery(sessionId)
  const session = sessionData?.session
  const [generateJobSchema] = useGenerateJobSchemaMutation()
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
  const factsPatch = patches.find((p: any) => p.patch_json?._file_type === 'facts.json')

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Schema Intelligence</h2>
          <p className="text-sm text-zinc-500 mt-1">Generate and analyze AI-optimized Schema.org markup</p>
        </div>
        <div className="flex items-center gap-3">
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
              <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200 rounded-xl h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
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
                  <SelectItem key={v} value={v} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
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
              className="bg-zinc-900 border-zinc-800 text-zinc-200 rounded-xl h-11"
            />
            <Button
              variant="outline"
              onClick={() => setCustomUrl(session?.startUrl || '')}
              disabled={loading || !session?.startUrl}
              className="bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl h-11 whitespace-nowrap"
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
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center relative">
            <Cpu className="w-8 h-8 text-emerald-400 animate-pulse" />
            <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-2xl animate-ping" />
          </div>
          <div className="space-y-1">
            <h3 className="text-white font-semibold">Analyzing Intelligence</h3>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">
              Running LCS™ scoring, 4-model analysis, and generating AI-optimized patches...
            </p>
          </div>
        </div>
      )}

      {/* Dashboard Results */}
      {S && !loading && (
        <div className="space-y-6">
          {/* Critical Alert */}
          {S.priority_alert && (
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
              <div className="flex-1">
                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mr-2">Critical Alert</span>
                <p className="text-sm text-rose-200/90">{S.priority_alert_message}</p>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                    />
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="AI Files Status" description="LLM crawl permissions and entity data">
                <div className="space-y-3">
                  {[
                    { key: 'llms_txt', name: 'llms.txt', lift: '+25%' },
                    { key: 'facts_json', name: 'facts.json', lift: '+18%' },
                  ].map(({ key, name, lift }) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-2 h-2 rounded-full',
                          ai[key] ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                        )} />
                        <span className="text-xs font-semibold text-zinc-200">{name}</span>
                      </div>
                      <span className={cn(
                        'text-[10px] font-bold uppercase tracking-wider',
                        ai[key] ? 'text-emerald-400' : 'text-rose-400'
                      )}>
                        {ai[key] ? 'Detected' : `${lift} Missed`}
                      </span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            {/* Right Column: Tabbed Interface */}
            <div className="lg:col-span-2">
              <div className="bg-[#111113] border border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-full">
                {/* Tabs Header */}
                <div className="flex items-center gap-1 p-1 bg-zinc-900/50 border-b border-zinc-800">
                  {(['priority', 'gaps', 'patches', 'schema', 'aifiles'] as Tab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        'px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all',
                        tab === t 
                          ? 'bg-zinc-800 text-white shadow-sm' 
                          : 'text-zinc-500 hover:text-zinc-300'
                      )}
                    >
                      {t === 'priority' ? `Fixes (${recs.length})` : 
                       t === 'gaps' ? `Gaps (${gaps.length})` : 
                       t === 'patches' ? `Patches (${patches.length})` : 
                       t === 'schema' ? 'Schema' : 'AI Files'}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto max-h-[600px] custom-scrollbar">
                  {tab === 'priority' && (
                    <div className="divide-y divide-zinc-800/50">
                      {recs.map((rec: any, i: number) => (
                        <div key={i} className="p-4 hover:bg-zinc-800/20 transition-colors flex items-center gap-4">
                          <span className="text-xs font-mono text-zinc-600">#{rec.priority}</span>
                          <SevTag s={rec.severity} />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-zinc-200 truncate">
                              {rec.schema_type}{rec.property ? ` / ${rec.property}` : ''}
                            </h4>
                            <p className="text-[11px] text-zinc-500 truncate mt-0.5">{rec.fix_instruction}</p>
                          </div>
                          <LiftTag lift={rec.estimated_lift} />
                        </div>
                      ))}
                      {recs.length === 0 && (
                        <div className="p-12 text-center">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mx-auto mb-3" />
                          <p className="text-sm text-zinc-500">No priority fixes — excellent coverage</p>
                        </div>
                      )}
                    </div>
                  )}

                  {tab === 'gaps' && (
                    <div className="divide-y divide-zinc-800/50">
                      {gaps.map((gap: any, i: number) => (
                        <div key={i} className="group">
                          <button
                            onClick={() => setExpandedGap(expandedGap === i ? null : i)}
                            className="w-full p-4 flex items-center gap-4 hover:bg-zinc-800/20 transition-colors text-left"
                          >
                            <SevTag s={gap.severity} />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-zinc-200">
                                {gap.schema_type} <span className="text-zinc-500 ml-1">/ {gap.property_name || 'Generic'}</span>
                              </h4>
                              <p className="text-[11px] text-zinc-500 mt-0.5">{gap.gap_type?.replace(/_/g, ' ')}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <LiftTag lift={`+${gap.citation_lift_est?.toFixed(0)}%`} />
                              {expandedGap === i ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
                            </div>
                          </button>
                          {expandedGap === i && (
                            <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                                <p className="text-[11px] text-zinc-400"><span className="text-zinc-200 font-bold uppercase text-[9px] mr-2">Issue:</span>{gap.message}</p>
                                <p className="text-[11px] text-emerald-400/80"><span className="text-emerald-400 font-bold uppercase text-[9px] mr-2">Fix:</span>{gap.fix_instruction}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {tab === 'patches' && (
                    <div className="divide-y divide-zinc-800/50">
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
                              className="w-full p-4 flex items-center gap-4 hover:bg-zinc-800/20 transition-colors text-left"
                            >
                              <SevTag s={patch.severity} />
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-zinc-200">
                                  {isFile ? patch.patch_json._file_type : patch.schema_type}
                                </h4>
                                <p className="text-[11px] text-zinc-500 mt-0.5">{patch.gap_type?.replace(/_/g, ' ')}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <LiftTag lift={patch.estimated_lift} />
                                {expandedPatch === i ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
                              </div>
                            </button>
                            {expandedPatch === i && (
                              <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/50 border-b border-zinc-800">
                                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">{isFile ? patch.patch_json._deploy_path : 'JSON-LD Patch'}</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => { e.stopPropagation(); copyToClipboard(patchText, pKey); }}
                                      className="h-7 text-[10px] text-zinc-400 hover:text-white"
                                    >
                                      {copiedKey === pKey ? <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" /> : <Copy className="w-3 h-3 mr-1" />}
                                      {copiedKey === pKey ? 'Copied' : 'Copy'}
                                    </Button>
                                  </div>
                                  <pre className="p-4 text-[10px] font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[300px]">
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
                      <div className="rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/50 border-b border-zinc-800">
                          <h4 className="text-xs font-bold text-zinc-200">Generated JSON-LD</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(schemaData?.schema_text || '', 'full-schema')}
                            className="h-8 text-[11px] text-zinc-400 hover:text-white"
                          >
                            {copiedKey === 'full-schema' ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                            {copiedKey === 'full-schema' ? 'Copied!' : 'Copy Schema'}
                          </Button>
                        </div>
                        <pre className="p-6 text-xs font-mono text-zinc-400 overflow-x-auto leading-relaxed max-h-[500px] custom-scrollbar">
                          {schemaData?.schema_text}
                        </pre>
                      </div>
                    </div>
                  )}

                  {tab === 'aifiles' && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { key: 'llms_txt', name: 'llms.txt', patch: llmsPatch, desc: 'Direct LLM crawl permission.', lift: '+25%' },
                        { key: 'facts_json', name: 'facts.json', patch: factsPatch, desc: 'Structured entity facts.', lift: '+18%' },
                      ].map(({ key, name, patch, desc, lift }) => {
                        const content = key === 'llms_txt' ? patch?.patch_json?._content : patch?.patch_json ? JSON.stringify(patch.patch_json, null, 2) : null
                        const pKey = `ai-file-${key}`
                        
                        return (
                          <div key={key} className="rounded-2xl bg-zinc-900/50 border border-zinc-800 overflow-hidden flex flex-col">
                            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-zinc-500" />
                                <span className="text-xs font-bold text-zinc-200">{name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div className={cn('w-1.5 h-1.5 rounded-full', ai[key] ? 'bg-emerald-500' : 'bg-rose-500')} />
                                <span className="text-[9px] font-bold text-zinc-500 uppercase">{ai[key] ? 'Live' : 'Missing'}</span>
                              </div>
                            </div>
                            <div className="p-4 flex-1">
                              <p className="text-[11px] text-zinc-500 mb-4">{desc}</p>
                              <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 h-32 overflow-y-auto custom-scrollbar">
                                {content ? (
                                  <pre className="text-[10px] font-mono text-zinc-500 whitespace-pre-wrap">{content}</pre>
                                ) : (
                                  <div className="h-full flex items-center justify-center text-[10px] text-zinc-700 italic">
                                    No template available
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="px-4 py-3 bg-zinc-900/30 border-t border-zinc-800 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-400">{lift} Impact</span>
                              {content && (
                                <div className="flex gap-2">
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-zinc-500" onClick={() => copyToClipboard(content, pKey)}>
                                    {copiedKey === pKey ? 'Copied' : 'Copy'}
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-zinc-500" onClick={() => {
                                    const blob = new Blob([content], { type: 'text/plain' })
                                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
                                  }}>
                                    <Download className="w-3 h-3" />
                                  </Button>
                                </div>
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
        <div className="py-24 flex flex-col items-center justify-center gap-4 text-center border-2 border-dashed border-zinc-800/50 rounded-3xl">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center">
            <Code2 className="w-8 h-8 text-zinc-700" />
          </div>
          <div className="space-y-1">
            <h3 className="text-white font-semibold">Intelligence Engine Ready</h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto">
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
