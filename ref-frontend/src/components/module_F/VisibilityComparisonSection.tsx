'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatCard } from '@/components/ui/StatCard'
import {
  type ModuleFMetricRecommendation,
  type ModuleFPerModelStats,
  type ModuleFCompareVisibilityEntityRow,
  useGetModuleFResultQuery,
  useRunModuleFAnalysisMutation,
  resolveD7Output,
  resolveFeatureFlags,
  useAskModuleFAIMutation,
  ModuleFResult,
} from '@/store/api/module_F/moduleFApi'
import {
  ArrowDown, ArrowUp, CheckCircle2, Eye, Loader2, Percent, Swords,
  Info, Shield, ChevronDown, ChevronUp, Gauge, TrendingUp, TrendingDown,
  Star, Globe, MessageSquare, Link2, Zap, Trophy, Target, BarChart3,
  Search, ExternalLink, Activity
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleFAskAiChatShell } from '@/components/module_F/ModuleFAskAiChatShell'

interface VisibilityComparisonSectionProps {
  jobId?: string | null
}

type ChatTurn = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

function chatMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Scoped Ask AI targets for Visibility Comparison */
type VisibilityAskTarget =
  | 'visibility_score'
  | 'top_competitor'
  | 'market_share'
  | 'd7_score'
  | 'competitor_leaderboard'
  | 'model_benchmark'

function buildVisibilityAskPrompt(
  target: VisibilityAskTarget,
  data: ModuleFResult | null | undefined,
  brandName: string,
): string {
  const comparison = data?.compare_visibility_against_competitors
  const brand = comparison?.brand
  const competitors = (comparison?.competitors ?? []).slice(0, 10)
  const d7 = resolveD7Output(data)
  const recommendations = data?.recommendations ?? data?.metric_recommendations ?? null

  const base = `You are answering from the user's latest Module F "Visibility Comparison" run for brand "${brandName}".
Answer immediately — do not ask the user for clarification. Focus ONLY on the metric/section named in the title below.
Use the glossary in PROJECT DATA. Use markdown with short headings and bullets where helpful.`

  switch (target) {
    case 'visibility_score':
      return `${base}

**Title: Your Visibility Score**

Explain what this visibility score means and interpret the brand's performance (JSON). Note if the score is healthy and one way to improve.
${JSON.stringify({
        brand_name: brand?.name ?? brandName,
        visibility_score: brand?.visibility_score,
        benchmark_score: brand?.benchmark_score,
        recommendation: recommendations?.visibility_score,
      })}`
    case 'top_competitor':
      return `${base}

**Title: Top Competitor Analysis**

Analyze the top competitor's performance compared to the brand (JSON). Why are they leading and what's the gap?
${JSON.stringify({
        brand_name: brand?.name ?? brandName,
        brand_score: brand?.visibility_score,
        top_competitor: competitors[0] ? {
          name: competitors[0].name,
          visibility_score: competitors[0].visibility_score,
          market_share: competitors[0].market_share_percent,
        } : null,
      })}`
    case 'market_share':
      return `${base}

**Title: Market Share (SOV)**

Explain the brand's market share / share of voice in this analysis (JSON). How does it compare to the overall competitive landscape?
${JSON.stringify({
        brand_share: brand?.market_share_percent,
        total_competitors: competitors.length,
        top_3_competitors: competitors.slice(0, 3).map(c => ({ name: c.name, share: c.market_share_percent })),
        recommendation: recommendations?.market_share,
      })}`
    case 'd7_score':
      return `${base}

**Title: AIVS™ D7 Score**

Explain the AIVS™ D7 (Competitive Citation Gap) score and grade (JSON). What does this delta mean for the brand's visibility?
${JSON.stringify({
        d7_score: d7?.d7_score,
        d7_grade: d7?.d7_grade,
        d7_delta: d7?.d7_delta,
        contribution: d7?.aivs_d7_contribution,
      })}`
    case 'competitor_leaderboard':
      return `${base}

**Title: Competitor Leaderboard**

Summarize the competitive landscape from this leaderboard (JSON). Who are the rising threats and where does the brand stand in the rankings?
${JSON.stringify({
        brand_rank: brand?.rank_position,
        total_entities: competitors.length + (brand ? 1 : 0),
        leaderboard_sample: competitors.slice(0, 5).map(c => ({
          name: c.name,
          score: c.visibility_score,
          share: c.market_share_percent,
          rank_delta: c.rank_difference_vs_brand,
        })),
      })}`
    case 'model_benchmark':
      return `${base}

**Title: Model-by-Model Benchmark**

Compare how the brand performs across different AI models (OpenAI, Gemini, Claude) versus competitors (JSON). Are there specific models where the brand is stronger or weaker?
${JSON.stringify({
        brand_per_model: brand?.per_model,
        top_competitor_per_model: competitors[0]?.per_model,
      })}`
  }
}

function MetricAskButton({
  disabled,
  onClick,
}: {
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onClick()
      }}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-violet-500/35 bg-violet-500/10',
        'px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300',
        'hover:bg-violet-500/18 transition-colors cursor-pointer shrink-0',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      <MessageSquare className="size-3 shrink-0" aria-hidden />
      Ask AI
    </button>
  )
}

function getVisibilityColor(score: number) {
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-blue-400'
  if (score >= 25) return 'text-amber-400'
  return 'text-red-400'
}

function getGradeColor(grade: string) {
  if (grade === 'A+' || grade === 'A') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
  if (grade === 'B') return 'text-blue-400 bg-blue-500/10 border-blue-500/25'
  if (grade === 'C') return 'text-amber-400 bg-amber-500/10 border-amber-500/25'
  return 'text-red-400 bg-red-500/10 border-red-500/25'
}

function formatDelta(delta?: number | null) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return '—'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(2)}`
}

function normalizeMetricRecommendation(value: unknown): ModuleFMetricRecommendation | null {
  if (!value) return null
  if (typeof value === 'string') return { why: '', fix: value }
  if (typeof value === 'object') {
    const rec = value as Partial<ModuleFMetricRecommendation>
    const why = typeof rec.why === 'string' ? rec.why : ''
    const fix = typeof rec.fix === 'string' ? rec.fix : ''
    if (!why && !fix) return null
    return { why, fix }
  }
  return null
}

function MetricTooltip({ rec }: { rec: ModuleFMetricRecommendation }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 transition-colors" />
        </TooltipTrigger>
        <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-w-xs text-xs p-3">
          {rec.why && (
            <>
              <div className="font-medium text-zinc-100 mb-1">Why this score</div>
              <div className="text-zinc-300">{rec.why}</div>
            </>
          )}
          <div className={cn('font-medium text-zinc-100', rec.why ? 'mt-3 mb-1' : 'mb-1')}>
            How to improve
          </div>
          <div className="text-zinc-300">{rec.fix}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function PerModelBreakdown({ perModel, entityName }: { perModel: Record<string, ModuleFPerModelStats>; entityName: string }) {
  const models = Object.entries(perModel)
  if (!models.length) return null

  const MODEL_CONFIG: Record<string, { color: string; icon: any; bg: string }> = {
    openai: { color: 'text-emerald-400', icon: Zap, bg: 'bg-emerald-500/10' },
    gemini: { color: 'text-blue-400', icon: Activity, bg: 'bg-blue-500/10' },
    claude: { color: 'text-amber-400', icon: Star, bg: 'bg-amber-500/10' },
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-zinc-800" />
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Model Insights — {entityName}</span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-zinc-800" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {models.map(([model, stats]) => {
          const mKey = model.toLowerCase()
          const cfg = MODEL_CONFIG[mKey] ?? { color: 'text-zinc-400', icon: MessageSquare, bg: 'bg-zinc-800/50' }
          const Icon = cfg.icon

          return (
            <div key={model} className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900/60 overflow-hidden">
              <div className={cn('absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 opacity-[0.03] transition-opacity group-hover:opacity-[0.07]', cfg.color)}>
                <Icon className="w-full h-full" />
              </div>
              
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className={cn('p-2 rounded-xl shrink-0', cfg.bg)}>
                    <Icon className={cn('w-4 h-4', cfg.color)} />
                  </div>
                  <span className="text-sm font-bold text-zinc-100 capitalize">{model}</span>
                </div>
                {stats.rank != null && (
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">Rank</span>
                    <span className={cn('text-lg font-bold font-mono leading-none', cfg.color)}>#{stats.rank}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-zinc-950/40 rounded-xl p-2.5 border border-zinc-800/50">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Mentions</div>
                  <div className="text-sm font-mono text-zinc-200">{stats.mentions}</div>
                </div>
                {stats.sentiment != null && (
                  <div className="bg-zinc-950/40 rounded-xl p-2.5 border border-zinc-800/50">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Sentiment</div>
                    <div className={cn('text-sm font-mono', stats.sentiment > 0 ? 'text-emerald-400' : stats.sentiment < 0 ? 'text-rose-400' : 'text-zinc-400')}>
                      {stats.sentiment > 0 ? '+' : ''}{stats.sentiment.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500">In Title</span>
                  <span className={cn('font-bold', stats.in_title ? 'text-emerald-400' : 'text-zinc-600')}>
                    {stats.in_title ? 'YES' : 'NO'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500">Cited</span>
                  <span className={cn('font-bold', stats.citation_present ? 'text-emerald-400' : 'text-zinc-600')}>
                    {stats.citation_present ? 'YES' : 'NO'}
                  </span>
                </div>
              </div>

              {stats.cited_urls && stats.cited_urls.length > 0 && (
                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase mb-2 flex items-center gap-1.5">
                    <Link2 className="w-3 h-3" /> Sources
                  </div>
                  <div className="space-y-1.5">
                    {stats.cited_urls.slice(0, 2).map((url, i) => (
                      <div key={i} className="group/url flex items-center gap-2 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer">
                        <div className="w-1 h-1 rounded-full bg-zinc-700 group-hover/url:bg-blue-400" />
                        <span className="truncate font-mono">{url}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover/url:opacity-100 transition-opacity" />
                      </div>
                    ))}
                    {stats.cited_urls.length > 2 && (
                      <div className="text-[9px] text-zinc-600 font-bold ml-3">
                        +{stats.cited_urls.length - 2} ADDITIONAL SOURCES
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ModelBenchmarkMatrix({
  brand,
  competitors,
  jobId,
  isAskingAI,
  runMetricAskAi,
}: {
  brand: ModuleFCompareVisibilityEntityRow | null
  competitors: ModuleFCompareVisibilityEntityRow[]
  jobId?: string | null
  isAskingAI: boolean
  runMetricAskAi: (target: VisibilityAskTarget, displayLabel: string) => void
}) {
  const entities = useMemo(() => (brand ? [brand, ...competitors] : competitors), [brand, competitors])

  const models = useMemo(() => {
    const m = new Set<string>()
    entities.forEach((e) => Object.keys(e.per_model ?? {}).forEach((k) => m.add(k)))
    return Array.from(m).sort((a, b) => a.localeCompare(b))
  }, [entities])

  const MODEL_CONFIG: Record<string, { color: string; icon: any; bg: string }> = {
    openai: { color: 'text-emerald-400', icon: Zap, bg: 'bg-emerald-500/10' },
    gemini: { color: 'text-blue-400', icon: Activity, bg: 'bg-blue-500/10' },
    claude: { color: 'text-amber-400', icon: Star, bg: 'bg-amber-500/10' },
  }

  if (!entities.length || !models.length) return null

  return (
    <SectionCard 
      title="Model-by-Model Benchmark" 
      description="Leader cell per model is highlighted. Each cell shows rank and mentions."
      className="bg-[#111113] overflow-hidden"
      actionSlot={
        <MetricAskButton
          disabled={!jobId || isAskingAI}
          onClick={() => runMetricAskAi('model_benchmark', 'Model-by-Model Benchmark')}
        />
      }
    >
      <div className="overflow-x-auto -mx-5 -mb-5">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400">
              <th className="p-4 font-bold uppercase tracking-wider text-[10px] sticky left-0 bg-zinc-900/50 backdrop-blur-md z-10">Entity</th>
              {models.map((model) => {
                const mKey = model.toLowerCase()
                const cfg = MODEL_CONFIG[mKey] ?? { color: 'text-zinc-400', icon: MessageSquare, bg: 'bg-zinc-800/50' }
                const Icon = cfg.icon
                return (
                  <th key={model} className="p-4 font-bold uppercase tracking-wider text-[10px]">
                    <div className="flex flex-col items-center gap-2">
                      <div className={cn('p-1.5 rounded-lg', cfg.bg)}>
                        <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
                      </div>
                      <span>{model}</span>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {entities.map((entity) => (
              <tr key={entity.name} className="hover:bg-zinc-900/40 transition-colors group">
                <td className="p-4 sticky left-0 bg-[#111113] group-hover:bg-[#161618] transition-colors z-10 border-r border-zinc-800/50">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-100 font-semibold truncate max-w-48">{entity.name}</span>
                    {entity.entity_type === 'client' && (
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] px-1 py-0 h-4">YOU</Badge>
                    )}
                  </div>
                </td>
                {models.map((model) => {
                  const stats = entity.per_model?.[model]
                  const rank = stats?.rank ?? null
                  const mentions = stats?.mentions ?? 0
                  const bestRank = entities.reduce<number | null>((best, e) => {
                    const r = e.per_model?.[model]?.rank
                    if (r == null) return best
                    if (best == null || r < best) return r
                    return best
                  }, null)
                  const isLeader = rank != null && bestRank != null && rank === bestRank

                  return (
                    <td key={`${entity.name}-${model}`} className="p-3">
                      {stats ? (
                        <div className={cn(
                          'rounded-xl border p-3 text-center transition-all duration-300',
                          isLeader 
                            ? 'border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.1)] scale-[1.02]' 
                            : 'border-zinc-800 bg-zinc-900/40'
                        )}>
                          <div className={cn('text-lg font-bold font-mono', isLeader ? 'text-emerald-400' : 'text-zinc-100')}>
                            {rank != null ? `#${rank}` : '—'}
                          </div>
                          <div className="text-[10px] font-medium text-zinc-500 mt-1 uppercase tracking-tighter">
                            {mentions} Mentions
                          </div>
                          {isLeader && (
                            <div className="mt-1.5 flex justify-center">
                              <Trophy className="w-3 h-3 text-emerald-500/50" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <span className="text-zinc-800 text-xs font-mono">—</span>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

export default function VisibilityComparisonSection({ jobId }: VisibilityComparisonSectionProps) {
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [justCompleted, setJustCompleted] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | undefined>(undefined)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const { toast } = useToast()

  const [runModuleFAnalysis, { isLoading: isTriggering }] = useRunModuleFAnalysisMutation()

  const { data: polledData } = useGetModuleFResultQuery(jobId ?? '', {
    skip: !jobId,
    pollingInterval: isPolling ? 5000 : 0,
    refetchOnMountOrArgChange: true,
  })

  const result = polledData?.data ?? null
  const brandName = result?.compare_visibility_against_competitors?.brand?.name || 'Brand'
  
  const [askModuleFAI, { isLoading: isAskingAI, error: askAIError, reset: resetAskAI }] =
    useAskModuleFAIMutation()

  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatTurn[]>([])
  const [chatFocusBadge, setChatFocusBadge] = useState<string | undefined>(undefined)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!askDialogOpen || !chatScrollRef.current) return
    const el = chatScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [askDialogOpen, chatMessages, isAskingAI])

  const openAskAiDialog = () => {
    if (!jobId) {
      toast({
        title: 'Job not ready yet',
        description: 'Run Module F first so Ask AI can use your stored analysis.',
        variant: 'destructive',
      })
      return
    }
    resetAskAI()
    setChatFocusBadge(undefined)
    setChatMessages([])
    setChatInput('')
    setAskDialogOpen(true)
  }

  const runMetricAskAi = async (target: VisibilityAskTarget, displayLabel: string) => {
    if (!jobId) {
      toast({
        title: 'Job not ready yet',
        description: 'Run Module F first so Ask AI can use your stored analysis.',
        variant: 'destructive',
      })
      return
    }
    resetAskAI()
    setChatFocusBadge(displayLabel)
    setChatInput('')
    const userDisplay = `Explain: ${displayLabel}`
    const userTurn: ChatTurn = { id: chatMessageId(), role: 'user', content: userDisplay }
    setChatMessages([userTurn])
    setAskDialogOpen(true)

    const fullPrompt = buildVisibilityAskPrompt(target, result, brandName)

    try {
      const res = await askModuleFAI({
        jobId,
        body: { question: fullPrompt },
      }).unwrap()
      const text = res?.data?.answer?.trim() ?? ''
      const sources = res?.data?.sources
      if (!text) {
        toast({
          title: 'Empty response',
          description: 'The model returned no text. Try again.',
          variant: 'destructive',
        })
        setChatMessages([])
        setAskDialogOpen(false)
        return
      }
      setChatMessages((prev) => [
        ...prev,
        { id: chatMessageId(), role: 'assistant', content: text, sources },
      ])
    } catch (err: unknown) {
      const msg =
        (err as { data?: { message?: string; error?: string } })?.data?.message ||
        (err as { data?: { error?: string } })?.data?.error ||
        (err as Error)?.message ||
        'Please try again.'
      toast({
        title: 'Ask AI failed',
        description: msg,
        variant: 'destructive',
      })
      setChatMessages([])
      setAskDialogOpen(false)
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

    const userTurn: ChatTurn = { id: chatMessageId(), role: 'user', content: question }
    setChatMessages((prev) => [...prev, userTurn])

    try {
      const res = await askModuleFAI({
        jobId,
        body: { question, conversationHistory: priorHistory.length ? priorHistory : undefined },
      }).unwrap()
      const text = res?.data?.answer?.trim() ?? ''
      const sources = res?.data?.sources
      if (!text) {
        toast({
          title: 'Empty response',
          description: 'The model returned no text. Try again or shorten your question.',
          variant: 'destructive',
        })
        return
      }
      setChatMessages((prev) => [
        ...prev,
        { id: chatMessageId(), role: 'assistant', content: text, sources },
      ])
    } catch (err: unknown) {
      const msg =
        (err as { data?: { message?: string; error?: string } })?.data?.message ||
        (err as { data?: { error?: string } })?.data?.error ||
        (err as Error)?.message ||
        'Please try again.'
      toast({
        title: 'Ask AI failed',
        description: msg,
        variant: 'destructive',
      })
      setChatMessages((prev) => prev.filter((m) => m.id !== userTurn.id))
      setChatInput(question)
    }
  }
  const updatedAt = result?.updatedAt
  const comparison = result?.compare_visibility_against_competitors
  const recommendations = result?.recommendations ?? result?.metric_recommendations ?? null
  const d7 = resolveD7Output(result)
  const flags = resolveFeatureFlags(result)

  useEffect(() => {
    if (!isPolling) return
    if (updatedAt && updatedAt !== lastUpdatedAt && comparison) {
      setIsPolling(false)
      setPollCount(0)
      setLastUpdatedAt(updatedAt)
      setJustCompleted(true)
      setTimeout(() => setJustCompleted(false), 4000)
    }
  }, [comparison, isPolling, lastUpdatedAt, updatedAt])

  useEffect(() => {
    if (isPolling && pollCount > 36) {
      setIsPolling(false)
      setPollCount(0)
    }
  }, [isPolling, pollCount])

  useEffect(() => {
    if (!isPolling) return
    const id = setInterval(() => setPollCount((c) => c + 1), 5000)
    return () => clearInterval(id)
  }, [isPolling])

  const handleRun = useCallback(async () => {
    if (!jobId) return
    try {
      setLastUpdatedAt(updatedAt)
      await runModuleFAnalysis(jobId).unwrap()
      setIsPolling(true)
      setPollCount(0)
    } catch {}
  }, [jobId, runModuleFAnalysis, updatedAt])

  const isRunning = isTriggering || isPolling

  const competitors = useMemo(() => {
    const rows = comparison?.competitors ?? []
    return [...rows].sort((a, b) => {
      if (a.display_order != null && b.display_order != null) {
        return a.display_order - b.display_order
      }
      return (b.visibility_score ?? 0) - (a.visibility_score ?? 0)
    })
  }, [comparison?.competitors])

  const brand = comparison?.brand ?? null

  const topCompetitor = useMemo(() => {
    const sorted = [...(comparison?.competitors ?? [])].sort((a, b) => (b.visibility_score ?? 0) - (a.visibility_score ?? 0))
    return sorted[0] ?? null
  }, [comparison?.competitors])

  const visibilityRec = normalizeMetricRecommendation(recommendations?.visibility_score)
  const shareRec = normalizeMetricRecommendation(recommendations?.market_share)
  const rankDeltaRec = normalizeMetricRecommendation(recommendations?.rank_delta)

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
            setChatFocusBadge(undefined)
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
          <ModuleFAskAiChatShell
            brandName={brandName}
            focusBadge={chatFocusBadge}
            chatScrollRef={chatScrollRef}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            isAskingAI={isAskingAI}
            askAIError={askAIError}
            onSubmit={submitAskAi}
            onSuggestionClick={(text) => setChatInput(text)}
          />
        </DialogContent>
      </Dialog>

      <div className="rounded-3xl border border-zinc-800 bg-[#111113] p-6 sm:p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 blur-[100px] -ml-32 -mb-32" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl group-hover:border-blue-500/30 transition-colors">
              <Swords className="w-8 h-8 text-blue-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">Visibility Comparison</h2>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Live AI Insights</span>
                </div>
              </div>
              <p className="text-sm text-zinc-400 max-w-xl">
                Real-time competitive analysis across OpenAI, Gemini & Claude. Compare your brand's presence, sentiment, and citation share.
              </p>
              {comparison?.topic && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
                    <Search className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-500 uppercase font-bold tracking-tighter">Topic:</span>
                    <span className="font-semibold">{comparison.topic}</span>
                  </div>
                  {result?.plan && (
                    <div className="px-3 py-1 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] font-bold text-blue-400 uppercase">
                      {result.plan} Plan
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-3 md:self-start">
            <div className="flex flex-col items-end gap-3">
              {updatedAt && (
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900/50 px-3 py-1.5 rounded-full border border-zinc-800">
                  <Activity className="w-3 h-3 text-emerald-500" />
                  Last Analysis: {new Date(updatedAt).toLocaleTimeString()}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={openAskAiDialog}
                  disabled={isAskingAI || !comparison}
                  className={cn(
                    'rounded-full border-0 shadow-lg shadow-fuchsia-950/30',
                    'text-xs font-extrabold uppercase tracking-wider',
                    'bg-gradient-to-r from-purple-500 via-pink-500 to-amber-300',
                    'text-black hover:opacity-95 hover:shadow-xl',
                    'h-auto min-h-[44px] px-5 py-2.5',
                    'gap-2',
                  )}
                >
                  <MessageSquare className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
                  ASK AI
                </Button>

                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className={cn(
                    'flex items-center gap-2 px-6 py-2.5 rounded-2xl font-bold text-sm transition-all',
                    isRunning 
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                      : 'bg-white text-black hover:bg-zinc-200 active:scale-95 shadow-lg shadow-white/5'
                  )}
                >
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {isRunning ? 'Analyzing Models...' : (comparison ? 'Re-Run Analysis' : 'Run Analysis')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 text-xs text-blue-200 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Querying OpenAI, Gemini & Claude — results will appear automatically…</span>
        </div>
      )}

      {comparison?.error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-lg px-4 py-3 text-sm">
          {comparison.error}
        </div>
      )}

      {!comparison && !isRunning && (
        <AnalysisEmptyState
          icon={<Swords className="w-8 h-8 text-zinc-400" />}
          title="No Visibility Comparison Data"
          description="Run the analysis to compare your brand's AI visibility score against competitors across OpenAI, Gemini & Claude."
          onRunAnalysis={handleRun}
          isAnalyzing={isRunning}
          disabled={!jobId}
          buttonLabel="Run Analysis"
        />
      )}

      {comparison && (
        <div className={cn('grid gap-4', d7 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3')}>
          <StatCard
            label="Your Visibility"
            value={(brand?.visibility_score ?? 0).toFixed(1)}
            subtext={brand?.name ?? 'Brand'}
            icon={Eye}
            accent={(brand?.visibility_score ?? 0) >= 75 ? 'emerald' : (brand?.visibility_score ?? 0) >= 50 ? 'blue' : (brand?.visibility_score ?? 0) >= 25 ? 'amber' : 'rose'}
            progress={brand?.visibility_score ?? 0}
            description={visibilityRec?.why || 'Overall AI search visibility score'}
            labelAction={
              <MetricAskButton
                disabled={!jobId || isAskingAI}
                onClick={() => runMetricAskAi('visibility_score', 'Your Visibility')}
              />
            }
          />

          <StatCard
            label="Top Competitor"
            value={topCompetitor?.name ?? '—'}
            subtext={`Score: ${(topCompetitor?.visibility_score ?? 0).toFixed(1)}`}
            icon={Trophy}
            accent="violet"
            progress={topCompetitor?.visibility_score ?? 0}
            description="Leading brand in this analysis"
            labelAction={
              <MetricAskButton
                disabled={!jobId || isAskingAI}
                onClick={() => runMetricAskAi('top_competitor', 'Top Competitor')}
              />
            }
          />

          <StatCard
            label="Market Share"
            value={`${(brand?.market_share_percent ?? 0).toFixed(1)}%`}
            subtext={`${competitors.length} competitors tracked`}
            icon={Percent}
            accent="emerald"
            progress={brand?.market_share_percent ?? 0}
            description={shareRec?.why || 'Share of voice in AI results'}
            labelAction={
              <MetricAskButton
                disabled={!jobId || isAskingAI}
                onClick={() => runMetricAskAi('market_share', 'Market Share')}
              />
            }
          />

          {d7 && (
            <StatCard
              label="AIVS™ D7 Score"
              value={d7.d7_score?.toFixed(1) || '0.0'}
              subtext={`Grade ${d7.d7_grade}`}
              icon={Gauge}
              accent="amber"
              progress={d7.d7_score}
              trend={d7.d7_delta && d7.d7_delta > 0 ? 'up' : d7.d7_delta && d7.d7_delta < 0 ? 'down' : 'neutral'}
              description="AIVS™ Competitive Citation Gap Score (15% contribution)"
              labelAction={
                <MetricAskButton
                  disabled={!jobId || isAskingAI}
                  onClick={() => runMetricAskAi('d7_score', 'AIVS™ D7 Score')}
                />
              }
            />
          )}
        </div>
      )}

      {comparison && competitors.length > 0 && (
        <div className="bg-[#111113] rounded-xl border border-zinc-800 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-zinc-800 rounded-lg">
                <Swords className="w-3.5 h-3.5 text-zinc-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-100">Competitor Leaderboard</div>
                <div className="text-[11px] text-zinc-600">{competitors.length} entities tracked</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MetricAskButton
                disabled={!jobId || isAskingAI}
                onClick={() => runMetricAskAi('competitor_leaderboard', 'Competitor Leaderboard')}
              />
              <div className="flex items-center gap-2">
                {!flags.leaderboard && (
                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/25 text-[10px]">
                    Upgrade to unlock
                  </Badge>
                )}
                <Badge className="bg-zinc-900 text-zinc-400 border-zinc-800 text-xs">
                  {competitors[0]?.display_order != null ? 'Custom order' : 'Sorted by visibility'}
                </Badge>
              </div>
            </div>
          </div>

          {flags.leaderboard ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400">
                    <th className="p-3 font-medium w-8">#</th>
                    <th className="p-3 font-medium">Entity</th>
                    <th className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Visibility
                        {visibilityRec && <MetricTooltip rec={visibilityRec} />}
                      </span>
                    </th>
                    <th className="p-3 font-medium">Benchmark</th>
                    <th className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Rank Δ vs Brand
                        {rankDeltaRec && <MetricTooltip rec={rankDeltaRec} />}
                      </span>
                    </th>
                    <th className="p-3 font-medium">Rank Move</th>
                    <th className="p-3 font-medium">Share of Voice %</th>
                    <th className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        Market Share
                        {shareRec && <MetricTooltip rec={shareRec} />}
                      </span>
                    </th>
                    <th className="p-3 font-medium">7D Score Δ</th>
                    {flags.model_breakdown_view && <th className="p-3 font-medium w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {competitors.map((row, i) => {
                    const delta = row.rank_difference_vs_brand
                    const isBetter = delta !== null && delta !== undefined ? delta < 0 : false
                    const isExpanded = expandedRow === row.name

                    return (
                      <React.Fragment key={`${row.name}-${i}`}>
                        <tr className="hover:bg-zinc-900/50 transition-colors">
                          <td className="p-3 text-zinc-600 text-xs font-mono">{row.rank_position ?? i + 1}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                row.entity_type === 'client' ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-400'
                              )}>
                                {row.entity_type === 'client' ? <Target className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium text-zinc-100 truncate max-w-55">{row.name}</span>
                                {row.entity_type === 'client' && (
                                  <span className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">Your Brand</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className={cn('font-bold font-mono text-sm', getVisibilityColor(row.visibility_score ?? 0))}>
                                  {(row.visibility_score ?? 0).toFixed(1)}
                                </span>
                                <span className="text-[10px] text-zinc-600 font-medium">/ 100</span>
                              </div>
                              <div className="h-1.5 w-24 bg-zinc-800/50 rounded-full overflow-hidden border border-zinc-800/50">
                                <div
                                  className={cn('h-full rounded-full transition-all duration-1000 ease-out',
                                    (row.visibility_score ?? 0) >= 75 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
                                    (row.visibility_score ?? 0) >= 50 ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]' :
                                    (row.visibility_score ?? 0) >= 25 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                                  )}
                                  style={{ width: `${Math.min(100, row.visibility_score ?? 0)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-xs text-zinc-400">
                              {(row.benchmark_score ?? 0).toFixed(1)}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              {delta === null || delta === undefined ? (
                                <span className="text-zinc-500">—</span>
                              ) : isBetter ? (
                                <ArrowUp className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <ArrowDown className="w-4 h-4 text-amber-400" />
                              )}
                              <span className={cn('font-mono text-xs', delta === null || delta === undefined ? 'text-zinc-500' : isBetter ? 'text-emerald-400' : 'text-amber-400')}>
                                {formatDelta(delta)}
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            {row.rank_move != null && row.rank_move !== 0 ? (
                              <div className={cn('flex items-center gap-1 text-xs font-mono',
                                row.rank_move > 0 ? 'text-emerald-400' : 'text-rose-400'
                              )}>
                                {row.rank_move > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                                <span>{Math.abs(row.rank_move)}</span>
                              </div>
                            ) : (
                              <span className="text-zinc-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-xs text-zinc-400">
                              {(row.share_of_voice ?? 0).toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-xs text-zinc-400">
                              {(row.market_share_percent ?? 0).toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3">
                            {row.score_delta != null && row.score_delta !== 0 ? (
                              <div className="flex items-center gap-1">
                                {row.score_delta > 0 ? (
                                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <TrendingDown className="w-3 h-3 text-rose-400" />
                                )}
                                <span className={cn('font-mono text-xs', row.score_delta > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                  {row.score_delta > 0 ? '+' : ''}{row.score_delta.toFixed(1)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-zinc-600 text-xs">—</span>
                            )}
                          </td>
                          {flags.model_breakdown_view && (
                            <td className="p-3">
                              {row.per_model && Object.keys(row.per_model).length > 0 && (
                                <button
                                  onClick={() => setExpandedRow(isExpanded ? null : row.name)}
                                  className="p-1 text-zinc-700 hover:text-zinc-300 transition-colors"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                        {flags.model_breakdown_view && isExpanded && row.per_model && (
                          <tr>
                            <td colSpan={flags.model_breakdown_view ? 10 : 9} className="px-4 pb-4 bg-zinc-900/20">
                              <PerModelBreakdown perModel={row.per_model} entityName={row.name} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-zinc-600" />
              </div>
              <h3 className="text-sm font-medium text-zinc-400 mb-1">Leaderboard Locked</h3>
              <p className="text-xs text-zinc-600 max-w-sm mx-auto leading-relaxed">
                Available on Pro plans and above. Upgrade to see full competitor rankings, score deltas, and per-model breakdowns.
              </p>
            </div>
          )}
        </div>
      )}

      {comparison && competitors.length > 0 && flags.model_breakdown_view && (
        <ModelBenchmarkMatrix 
          brand={brand} 
          competitors={competitors} 
          jobId={jobId}
          isAskingAI={isAskingAI}
          runMetricAskAi={runMetricAskAi}
        />
      )}
    </div>
  )
}

