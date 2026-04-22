'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatCard } from '@/components/ui/StatCard'
import {
  useGetModuleFResultQuery,
  useRunModuleFAnalysisMutation,
  resolveD7Output,
  useAskModuleFAIMutation,
  type ModuleFResult,
  type ModuleFCompareVisibilityEntityRow,
} from '@/store/api/module_F/moduleFApi'
import {
  Loader2, Percent, Swords,
  ChevronDown, ChevronUp, Gauge,
  Star, MessageSquare, Zap, Trophy, Target, Globe,
  Search, Activity, ExternalLink, AlertCircle, Check,
  ChevronRight, ArrowLeft
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ModuleFAskAiChatShell } from '@/components/module_F/ModuleFAskAiChatShell'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSearchBrandMentionsMutation } from '@/store/api/brandMentionsApi'
import {
  useGetOnboardingDataQuery,
  type PromptResult,
  type AggregateStats,
  type ProviderResult,
} from '@/store/api/brandOnboardingApi'

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
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ borderColor: 'var(--nd-purple)', background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' }}
    >
      <MessageSquare className="size-3 shrink-0" aria-hidden />
      Ask AI
    </button>
  )
}



// ─────────────────────────────────────────────────────────────────────────────
// Onboarding-based Model-by-Model Benchmark
// Uses prompt_results per-provider data as single source of truth
// ─────────────────────────────────────────────────────────────────────────────

type OBBenchmarkRow = {
  name: string
  is_our_brand: boolean
  per_model: Record<string, { mentions: number; avg_rank: number | null }>
}

function OBModelBenchmarkMatrix({
  benchmarkData,
  jobId,
  isAskingAI,
  runMetricAskAi,
}: {
  benchmarkData: OBBenchmarkRow[]
  jobId?: string | null
  isAskingAI: boolean
  runMetricAskAi: (target: VisibilityAskTarget, displayLabel: string) => void
}) {
  const models = useMemo(() => {
    const m = new Set<string>()
    benchmarkData.forEach((e) => Object.keys(e.per_model).forEach((k) => m.add(k)))
    return Array.from(m).sort((a, b) => a.localeCompare(b))
  }, [benchmarkData])

  const MODEL_CONFIG: Record<string, { color: string; icon: any; bg: string }> = {
    openai: { color: 'text-emerald-700', icon: Zap, bg: 'bg-emerald-50' },
    gemini: { color: 'text-blue-700', icon: Activity, bg: 'bg-blue-50' },
    claude: { color: 'text-amber-700', icon: Star, bg: 'bg-amber-50' },
  }

  if (!benchmarkData.length || !models.length) return null

  return (
    <SectionCard
      title="Model-by-Model Benchmark"
      description="Mention frequency per AI provider across all prompts. Leader cell highlighted."
      className="overflow-hidden"
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
            <tr style={{ borderBottom: '1px solid var(--nd-border)', background: 'var(--nd-bg)', color: 'var(--nd-text-muted)' }}>
              <th className="p-4 font-bold uppercase tracking-wider text-xs sticky left-0 z-10" style={{ background: 'var(--nd-bg)' }}>Brand</th>
              {models.map((model) => {
                const mKey = model.toLowerCase()
                const cfg = MODEL_CONFIG[mKey] ?? { color: 'text-gray-600', icon: MessageSquare, bg: 'bg-gray-100' }
                const Icon = cfg.icon
                return (
                  <th key={model} className="p-4 font-bold uppercase tracking-wider text-xs">
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
          <tbody>
            {benchmarkData.map((entity) => (
              <tr key={entity.name} className="transition-colors group" style={{ borderBottom: '1px solid var(--nd-border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--nd-bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <td className="p-4 sticky left-0 z-10 transition-colors" style={{ background: 'var(--nd-card-bg)', borderRight: '1px solid var(--nd-border)' }}>
                  <div className="flex items-center gap-2">
                    <span className={cn('font-semibold truncate max-w-48')} style={{ color: entity.is_our_brand ? 'var(--nd-blue)' : 'var(--nd-text-primary)' }}>
                      {entity.name}
                    </span>
                    {entity.is_our_brand && (
                      <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[9px] px-1 py-0 h-4">YOU</Badge>
                    )}
                  </div>
                </td>
                {models.map((model) => {
                  const stats = entity.per_model?.[model]
                  const bestMentions = benchmarkData.reduce<number>(
                    (best, e) => Math.max(best, e.per_model?.[model]?.mentions ?? 0),
                    0,
                  )
                  const isLeader = stats != null && stats.mentions > 0 && stats.mentions === bestMentions

                  return (
                    <td key={`${entity.name}-${model}`} className="p-3">
                      {stats ? (
                        <div className={cn(
                          'rounded-xl border p-3 text-center transition-all duration-300',
                          isLeader ? 'border-emerald-200 bg-emerald-50 scale-[1.02]' : '',
                        )} style={!isLeader ? { borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' } : {}}>
                          <div className="text-lg font-bold font-mono" style={{ color: isLeader ? '#059669' : 'var(--nd-text-primary)' }}>
                            ×{stats.mentions}
                          </div>
                          <div className="text-[10px] font-medium mt-1 uppercase tracking-tighter" style={{ color: 'var(--nd-text-muted)' }}>
                            {stats.avg_rank != null ? `Avg #${stats.avg_rank}` : 'mentions'}
                          </div>
                          {isLeader && (
                            <div className="mt-1.5 flex justify-center">
                              <Trophy className="w-3 h-3 text-emerald-500" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <span className="text-xs font-mono" style={{ color: 'var(--nd-text-muted)' }}>—</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// Brand Onboarding Visibility Panel
// Shows onboarding prompt-results data: KPI cards, topic list, prompt table
// ─────────────────────────────────────────────────────────────────────────────

type OBProviders = 'openai' | 'gemini' | 'claude'
const OB_PROVIDERS: OBProviders[] = ['openai', 'gemini', 'claude']
const OB_PROVIDER_CFG: Record<OBProviders, { label: string; dotColor: string; bg: string; border: string; textColor: string }> = {
  openai: { label: 'ChatGPT', dotColor: '#10b981', bg: '#f0fdf4', border: '#bbf7d0', textColor: '#065f46' },
  gemini: { label: 'Gemini',  dotColor: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', textColor: '#1d4ed8' },
  claude: { label: 'Claude',  dotColor: '#f59e0b', bg: '#fffbeb', border: '#fde68a', textColor: '#92400e' },
}

function OBPresenceBadge({ mentioned }: { mentioned: boolean }) {
  return mentioned ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
      Present
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-500">
      <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
      Not Present
    </span>
  )
}

function OBSentimentBadge({ sentiment }: { sentiment: string }) {
  if (!sentiment || sentiment === 'not_mentioned') return null
  const cfg: Record<string, string> = {
    positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    negative: 'bg-red-50 text-red-700 border-red-200',
    neutral:  'bg-gray-50 text-gray-600 border-gray-200',
  }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border capitalize', cfg[sentiment] ?? cfg.neutral)}>
      {sentiment}
    </span>
  )
}

// Compact provider cell for the prompt results table
function OBTableProviderCell({
  providerResult,
  onOpen,
}: {
  providerResult: ProviderResult | undefined
  onOpen: () => void
}) {
  const a = providerResult?.analysis

  let dotColor = '#d1d5db'
  let statusText = '—'
  let statusColorClass = 'text-gray-400'
  let rankText: string | null = null
  let sentimentText: string | null = null
  let sentimentColorClass = ''

  if (!providerResult) {
    statusText = '—'
  } else if (providerResult.error || !a) {
    dotColor = '#9ca3af'
    statusText = 'No response'
    statusColorClass = 'text-gray-400'
  } else if (!a.brand_mentioned && (!a.all_mentioned_brands || a.all_mentioned_brands.length === 0)) {
    dotColor = '#ef4444'
    statusText = 'Absent'
    statusColorClass = 'text-gray-700'
    if (a.brand_rank != null) rankText = `Rank: ${a.brand_rank}/${a.brand_rank_out_of}`
    else rankText = `Rank: —/${a.brand_rank_out_of || ''}`
  } else if (!a.brand_mentioned) {
    dotColor = '#9ca3af'
    statusText = 'No brands'
    statusColorClass = 'text-gray-500'
  } else {
    dotColor = '#10b981'
    statusText = 'Present'
    statusColorClass = 'text-gray-800 font-semibold'
    rankText = `Rank: ${a.brand_rank != null ? `${a.brand_rank}/${a.brand_rank_out_of}` : `—/${a.brand_rank_out_of || ''}`}`
    if (a.sentiment && a.sentiment !== 'not_mentioned') {
      sentimentText = a.sentiment.charAt(0).toUpperCase() + a.sentiment.slice(1)
      sentimentColorClass = a.sentiment === 'positive' ? 'text-emerald-600' : a.sentiment === 'negative' ? 'text-red-500' : 'text-gray-400'
    }
  }

  const hasResponse = !!providerResult?.response

  return (
    <div className="relative group rounded-lg border px-3 py-2.5 text-center" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', width: '140px', minWidth: '140px', minHeight: '80px' }}>
      {/* Link icon top-right */}
      {hasResponse && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpen() }}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          title="View response"
        >
          <ExternalLink className="w-3 h-3" style={{ color: 'var(--nd-purple)' }} />
        </button>
      )}
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full shrink-0 inline-block" style={{ background: dotColor }} />
        <span className={cn('text-xs', statusColorClass)}>{statusText}</span>
      </div>
      {rankText && (
        <div className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>{rankText}</div>
      )}
      {sentimentText && (
        <div className={cn('text-xs font-medium mt-0.5', sentimentColorClass)}>{sentimentText}</div>
      )}
    </div>
  )
}

// Light-mode markdown renderer for the response popup
function LightMarkdown({ content }: { content: string }) {
  return (
    <div className={cn(
      'text-sm text-gray-800 leading-relaxed',
      '[&_p]:mb-3 [&_p:last-child]:mb-0',
      '[&_strong]:font-semibold [&_strong]:text-gray-900',
      '[&_em]:text-gray-600',
      '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1',
      '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1',
      '[&_li]:text-gray-700',
      '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mt-4 [&_h1]:mb-2',
      '[&_h2]:text-base [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-4 [&_h2]:mb-2',
      '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-800 [&_h3]:mt-3 [&_h3]:mb-1',
      '[&_hr]:my-4 [&_hr]:border-gray-200',
      '[&_a]:text-blue-600 [&_a]:underline hover:[&_a]:text-blue-800',
      '[&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:text-gray-500 [&_blockquote]:my-3',
    )}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

// Prompt detail modal
function OBPromptDetailModal({
  result,
  provider,
  open,
  onClose,
}: {
  result: PromptResult | null
  provider: OBProviders
  open: boolean
  onClose: () => void
}) {
  const [searchBrandMentions, { data: searchData, isLoading: isSearching }] = useSearchBrandMentionsMutation()
  const prevKeyRef = useRef<string | null>(null)

  const modalKey = result ? `${result.prompt}-${provider}` : null

  useEffect(() => {
    if (!open || !result || !modalKey) return
    if (modalKey !== prevKeyRef.current) {
      prevKeyRef.current = modalKey
      searchBrandMentions({ query: result.prompt, num: 10 })
    }
  }, [open, result, modalKey, searchBrandMentions])

  if (!result) return null

  const cfg = OB_PROVIDER_CFG[provider]
  const pr = result.results[provider]
  const a = pr?.analysis

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-4xl max-h-[85vh] overflow-hidden flex flex-col bg-white p-0 gap-0"
        style={{ border: '1px solid #e5e7eb' }}
      >
        <DialogTitle className="sr-only">Response from {cfg.label}</DialogTitle>
        {/* Modal header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 shrink-0">
          <div className="pr-6">
            <h2 className="text-base font-bold text-gray-900">Response from {cfg.label}</h2>
            <p className="text-sm text-gray-500 mt-1 leading-snug">
              Prompt: {result.prompt}
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Response body */}
          {pr?.response ? (
            <LightMarkdown content={pr.response} />
          ) : (
            <div className="py-8 text-center text-sm text-gray-400 rounded-lg border border-gray-200 bg-gray-50">
              No response from {cfg.label}
            </div>
          )}

          {/* Sources and Citations */}
          <div className="pt-2 border-t border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 mb-3">
              Sources and Citations{searchData?.results?.length ? ` (${searchData.results.length})` : ''}
            </h3>
            {isSearching ? (
              <div className="flex items-center gap-2 py-1">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-400">Loading sources…</span>
              </div>
            ) : searchData?.results?.length ? (
              <div className="space-y-1.5">
                {searchData.results.map((r, i) => (
                  <a
                    key={`${r.url}-${i}`}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{r.url}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No sources found for this prompt.</p>
            )}
          </div>

          {/* Analysis Results */}
          {a && (
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Analysis Results</h3>
              <div className="flex flex-wrap gap-6">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-1">Brand Presence</div>
                    <OBPresenceBadge mentioned={a.brand_mentioned} />
                  </div>
                  {a.sentiment && a.sentiment !== 'not_mentioned' && (
                    <div>
                      <div className="text-xs font-medium text-gray-400 mb-1">Sentiment</div>
                      <OBSentimentBadge sentiment={a.sentiment} />
                    </div>
                  )}
                  {a.brand_rank != null && (
                    <div>
                      <div className="text-xs font-medium text-gray-400 mb-1">Rank</div>
                      <span className="text-sm font-bold font-mono text-gray-900">
                        {a.brand_rank} / {a.brand_rank_out_of}
                      </span>
                    </div>
                  )}
                </div>
                {a.all_mentioned_brands?.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 mb-1">Mentioned Brands</div>
                    <p className="text-sm text-gray-600">
                      {a.all_mentioned_brands.slice(0, 8).map((b) => b.name).join(', ')}
                      {a.all_mentioned_brands.length > 8 ? ` +${a.all_mentioned_brands.length - 8}` : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BrandOnboardingVisibilityPanel({ jobId }: { jobId?: string | null }) {
  const { data, isLoading } = useGetOnboardingDataQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const [viewMode, setViewMode] = useState<'topics' | 'prompts'>('topics')
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [modalResult, setModalResult] = useState<PromptResult | null>(null)
  const [modalProvider, setModalProvider] = useState<OBProviders>('openai')
  const [modalOpen, setModalOpen] = useState(false)
  const [showMoreBrands, setShowMoreBrands] = useState(false)

  const results: PromptResult[] = data?.prompt_results ?? []
  const aggregate: AggregateStats | undefined = data?.aggregate

  // Group prompts by topic
  const topicMap = useMemo<Record<string, PromptResult[]>>(() => {
    const map: Record<string, PromptResult[]> = {}
    for (const r of results) {
      const key = r.topic ?? 'General'
      if (!map[key]) map[key] = []
      map[key].push(r)
    }
    return map
  }, [results])

  const topicList = useMemo(() => {
    return Object.entries(topicMap).map(([topic, prompts]) => {
      const totalResps = prompts.reduce(
        (acc, p) => acc + OB_PROVIDERS.filter((pr) => p.results[pr]?.analysis != null).length,
        0,
      )
      const mentionedResps = prompts.reduce(
        (acc, p) => acc + OB_PROVIDERS.filter((pr) => p.results[pr]?.analysis?.brand_mentioned).length,
        0,
      )
      const rate = totalResps ? Math.round((mentionedResps / totalResps) * 100) : 0
      return { topic, prompts, rate, promptCount: prompts.length }
    })
  }, [topicMap])

  const allMentionedBrands = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of results) {
      for (const p of OB_PROVIDERS) {
        for (const b of r.results[p]?.analysis?.all_mentioned_brands ?? []) {
          counts[b.name] = (counts[b.name] ?? 0) + 1
        }
      }
    }
    const total = results.length * OB_PROVIDERS.length || 1
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
  }, [results])

  const displayedPrompts = useMemo(
    () => (selectedTopic ? topicMap[selectedTopic] ?? [] : results),
    [selectedTopic, results, topicMap],
  )

  const visibleBrands = showMoreBrands ? allMentionedBrands : allMentionedBrands.slice(0, 8)
  const maxBrandCount = allMentionedBrands[0]?.count ?? 1

  if (!jobId || isLoading || results.length === 0) return null

  const presenceRate = aggregate?.brand_presence_rate ?? 0
  const presenceCount = aggregate?.brand_presence_count ?? 0
  const totalRespsCount = aggregate?.total_responses ?? 0
  const positivePct = presenceCount
    ? Math.round(((aggregate?.positive_mentions ?? 0) / presenceCount) * 100)
    : 0
  const negativePct = presenceCount
    ? Math.round(((aggregate?.negative_mentions ?? 0) / presenceCount) * 100)
    : 0

  const openModal = (r: PromptResult, p?: OBProviders) => {
    const resolved = p ?? OB_PROVIDERS.find((pr) => r.results[pr]?.response) ?? 'openai'
    setModalResult(r)
    setModalProvider(resolved)
    setModalOpen(true)
  }

  return (
    <>
      <OBPromptDetailModal
        result={modalResult}
        provider={modalProvider}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setModalResult(null) }}
      />

      <div className="space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            {
              label: 'Brand Presence',
              value: `${presenceRate}%`,
              sub: `${presenceCount} of ${totalRespsCount} responses`,
              color: 'text-blue-700',
              bar: presenceRate,
              barColor: 'bg-blue-600',
            },
            {
              label: 'Average Rank',
              value: aggregate?.avg_rank != null ? `#${aggregate.avg_rank}` : '—',
              sub: 'across all models',
              color: 'text-violet-700',
              bar: null as number | null,
              barColor: '',
            },
            {
              label: 'Positive Mentions',
              value: `${positivePct}%`,
              sub: `${aggregate?.positive_mentions ?? 0} of ${presenceCount}`,
              color: 'text-emerald-700',
              bar: positivePct,
              barColor: 'bg-emerald-600',
            },
            {
              label: 'Negative Mentions',
              value: `${negativePct}%`,
              sub: `${aggregate?.negative_mentions ?? 0} of ${presenceCount}`,
              color: 'text-red-700',
              bar: negativePct,
              barColor: 'bg-red-600',
            },
          ] as const).map(({ label, value, sub, color, bar, barColor }) => (
            <div key={label} className="rounded-xl p-4" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
              <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--nd-text-muted)' }}>{label}</div>
              <div className={cn('text-2xl font-bold font-mono', color)}>{value}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--nd-text-secondary)' }}>{sub}</div>
              {bar !== null && (
                <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                  <div className={cn('h-full rounded-full', barColor)} style={{ width: `${bar}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Topic List View */}
        {viewMode === 'topics' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Brand Presence by Topic */}
            <div className="lg:col-span-2 rounded-xl overflow-hidden" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--nd-border)' }}>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>Brand Presence by Topic</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--nd-text-muted)' }}>
                    {results.length} prompts • {topicList.length} topics
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedTopic(null); setViewMode('prompts') }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border"
                  style={{ color: 'var(--nd-purple)', borderColor: 'var(--nd-purple)', background: 'var(--nd-purple-subtle)' }}
                >
                  All Prompts
                </button>
              </div>
              <div>
                {topicList.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--nd-text-muted)' }}>No topic data</p>
                ) : (
                  topicList.map(({ topic, rate, promptCount }, idx) => {
                    const badgeBg = rate >= 50 ? '#f0fdf4' : rate >= 25 ? '#fffbeb' : '#fef2f2'
                    const badgeBorder = rate >= 50 ? '#bbf7d0' : rate >= 25 ? '#fde68a' : '#fecaca'
                    const badgeColor = rate >= 50 ? '#065f46' : rate >= 25 ? '#92400e' : '#991b1b'
                    return (
                      <button
                        key={topic}
                        onClick={() => { setSelectedTopic(topic); setViewMode('prompts') }}
                        className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors"
                        style={{ borderBottom: idx < topicList.length - 1 ? '1px solid var(--nd-border)' : undefined }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--nd-bg)')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '')}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium" style={{ color: 'var(--nd-text-primary)' }}>{topic}</span>
                        </div>
                        <span className="text-xs shrink-0 px-2 py-0.5 rounded-full border font-medium" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}>
                          {promptCount} prompts
                        </span>
                        <span className="text-xs font-bold shrink-0 px-2.5 py-0.5 rounded-full border" style={{ background: badgeBg, borderColor: badgeBorder, color: badgeColor }}>
                          {rate}%
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--nd-text-muted)' }} />
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* Right: Most Mentioned Brands */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--nd-border)' }}>
                <h3 className="text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>Most Mentioned Brands</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--nd-text-muted)' }}>Across all AI responses</p>
              </div>
              <div className="p-4 space-y-3">
                {visibleBrands.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--nd-text-muted)' }}>No brand data yet</p>
                ) : (
                  visibleBrands.map(({ name, count, pct }) => (
                    <div key={name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--nd-text-primary)' }}>{name}</span>
                        <span className="text-xs font-semibold shrink-0 ml-2" style={{ color: 'var(--nd-text-secondary)' }}>{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.round((count / maxBrandCount) * 100)}%`, background: 'var(--nd-purple)' }}
                        />
                      </div>
                    </div>
                  ))
                )}
                {allMentionedBrands.length > 8 && (
                  <button
                    onClick={() => setShowMoreBrands(!showMoreBrands)}
                    className="w-full text-sm font-semibold py-2.5 rounded-lg transition-colors border mt-1"
                    style={{ color: 'var(--nd-text-secondary)', borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--nd-bg)')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--nd-bg)')}
                  >
                    {showMoreBrands ? 'Show less' : `Show ${allMentionedBrands.length - 8} more brands`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Prompt Table View */}
        {viewMode === 'prompts' && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
            {/* Breadcrumb header */}
            <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: '1px solid var(--nd-border)' }}>
              <button
                onClick={() => setViewMode('topics')}
                className="flex items-center gap-1.5 text-sm font-medium transition-colors"
                style={{ color: 'var(--nd-text-secondary)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--nd-purple)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--nd-text-secondary)')}
              >
                <ArrowLeft className="w-4 h-4" />
                Topics
              </button>
              <span style={{ color: 'var(--nd-border)' }}>›</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>
                {selectedTopic ?? 'All Prompts'}
              </span>
              <span className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>
                ({displayedPrompts.length})
              </span>
            </div>

            {/* Prompt results table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr style={{ background: 'var(--nd-bg)', borderBottom: '1px solid var(--nd-border)' }}>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider w-10" style={{ color: 'var(--nd-text-muted)' }}>#</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Prompt</th>
                    {OB_PROVIDERS.map((p) => (
                      <th key={p} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-center" style={{ color: 'var(--nd-text-muted)', width: '160px', minWidth: '160px' }}>
                        {OB_PROVIDER_CFG[p].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedPrompts.map((r, i) => (
                    <tr
                      key={`${r.prompt}-${i}`}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--nd-border)' }}
                      onClick={() => openModal(r)}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'var(--nd-bg)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = '')}
                    >
                      <td className="px-4 py-4 align-middle">
                        <span className="text-sm font-mono" style={{ color: 'var(--nd-text-muted)' }}>{i + 1}</span>
                      </td>
                      <td className="px-4 py-4 align-middle" style={{ maxWidth: '320px' }}>
                        <p className="text-sm font-medium leading-snug line-clamp-2" style={{ color: 'var(--nd-text-primary)' }}>{r.prompt}</p>
                        {r.topic && (
                          <span className="mt-1 inline-block text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--nd-bg)', color: 'var(--nd-text-muted)', border: '1px solid var(--nd-border)' }}>
                            {r.topic}
                          </span>
                        )}
                      </td>
                      {OB_PROVIDERS.map((p) => (
                        <td key={p} className="px-3 py-4 align-middle" style={{ width: '160px' }}>
                          <OBTableProviderCell
                            providerResult={r.results[p]}
                            onOpen={() => openModal(r, p)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}



export default function VisibilityComparisonSection({ jobId }: VisibilityComparisonSectionProps) {
  const [isPolling, setIsPolling] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [justCompleted, setJustCompleted] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | undefined>(undefined)

  const { toast } = useToast()

  const [runModuleFAnalysis, { isLoading: isTriggering }] = useRunModuleFAnalysisMutation()

  const { data: polledData } = useGetModuleFResultQuery(jobId ?? '', {
    skip: !jobId,
    pollingInterval: isPolling ? 5000 : 0,
    refetchOnMountOrArgChange: true,
  })

  const result = polledData?.data ?? null

  const brandName = result?.compare_visibility_against_competitors?.brand?.name ?? 'Brand'

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
  const d7 = resolveD7Output(result)

  // Single source of truth — all competitor data comes from compare_visibility_against_competitors
  const competitors = comparison?.competitors ?? []
  const comparisonBrand = comparison?.brand ?? null
  const leaderboardCompetitors = useMemo<ModuleFCompareVisibilityEntityRow[]>(() => {
    if (!comparison?.competitors?.length) return []
    return [...comparison.competitors].sort((a, b) => a.rank_position - b.rank_position)
  }, [comparison])

  const leaderboardEntries = useMemo<ModuleFCompareVisibilityEntityRow[]>(() => {
    if (!comparison) return []
    const all = [
      ...(comparison.brand ? [comparison.brand] : []),
      ...leaderboardCompetitors,
    ]
    return all.sort((a, b) => a.rank_position - b.rank_position)
  }, [comparison, leaderboardCompetitors])

  const topCompetitor = useMemo(() => {
    return leaderboardCompetitors[0] ?? null
  }, [leaderboardCompetitors])

  const topCompetitorProgress = useMemo(() => {
    if (!topCompetitor) return 0
    if (typeof topCompetitor.market_share_percent === 'number' && topCompetitor.market_share_percent > 0) {
      return topCompetitor.market_share_percent
    }
    if (typeof topCompetitor.share_of_voice === 'number' && topCompetitor.share_of_voice > 0) {
      return topCompetitor.share_of_voice
    }
    if (typeof topCompetitor.mentions_total === 'number') {
      const maxMentions = leaderboardEntries[0]?.mentions_total ?? topCompetitor.mentions_total
      return maxMentions ? Math.min(100, Math.round((topCompetitor.mentions_total / maxMentions) * 100)) : 0
    }
    return 0
  }, [topCompetitor, leaderboardEntries])

  const benchmarkData = useMemo<OBBenchmarkRow[]>(() => {
    if (!comparison) return []
    const entities: ModuleFCompareVisibilityEntityRow[] = [
      ...(comparison.brand ? [comparison.brand] : []),
      ...(comparison.competitors ?? []),
    ]
    return entities.slice(0, 8).map((e) => ({
      name: e.name,
      is_our_brand: e.entity_type === 'client',
      per_model: Object.fromEntries(
        Object.entries(e.per_model ?? {}).map(([k, v]) => [
          k,
          { mentions: v.mentions, avg_rank: v.rank ?? null },
        ]),
      ),
    }))
  }, [comparison])

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

      <div className="rounded-3xl p-6 sm:p-8 relative overflow-hidden" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="p-4 rounded-2xl shadow-sm" style={{ background: 'var(--nd-purple-subtle)', border: '1px solid var(--nd-border)' }}>
              <Swords className="w-8 h-8" style={{ color: 'var(--nd-purple)' }} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--nd-text-primary)' }}>Visibility Comparison</h2>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Live AI Insights</span>
                </div>
              </div>
              <p className="text-sm max-w-xl" style={{ color: 'var(--nd-text-secondary)' }}>
                Real-time competitive analysis across OpenAI, Gemini &amp; Claude. Compare your brand's presence, sentiment, and citation share.
              </p>
              {comparison?.topic && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-xl text-xs" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)', color: 'var(--nd-text-secondary)' }}>
                    <Search className="w-3 h-3" style={{ color: 'var(--nd-text-muted)' }} />
                    <span className="uppercase font-bold tracking-tighter" style={{ color: 'var(--nd-text-muted)' }}>Topic:</span>
                    <span className="font-semibold">{comparison.topic}</span>
                  </div>
                  {result?.plan && (
                    <div className="px-3 py-1 rounded-xl text-xs font-bold uppercase bg-blue-50 border border-blue-200 text-blue-700">
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
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full" style={{ color: 'var(--nd-text-muted)', background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                  <Activity className="w-3 h-3" style={{ color: 'var(--nd-teal)' }} />
                  Last Analysis: {new Date(updatedAt).toLocaleTimeString()}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={openAskAiDialog}
                  disabled={isAskingAI || !comparison}
                  className={cn(
                    'rounded-full border-0 shadow-md',
                    'text-xs font-extrabold uppercase tracking-wider',
                    'bg-linear-to-r from-purple-500 via-pink-500 to-amber-300',
                    'text-black hover:opacity-95 hover:shadow-lg',
                    'h-auto min-h-11 px-5 py-2.5',
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
                    'flex items-center gap-2 px-6 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95',
                    isRunning
                      ? 'cursor-not-allowed opacity-60'
                      : 'shadow-sm hover:shadow-md'
                  )}
                  style={isRunning
                    ? { background: 'var(--nd-bg)', color: 'var(--nd-text-muted)', border: '1px solid var(--nd-border)' }
                    : { background: 'var(--nd-purple)', color: '#ffffff', border: '1px solid var(--nd-purple)' }}
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
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Querying OpenAI, Gemini &amp; Claude — results will appear automatically…</span>
        </div>
      )}

      {comparison?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {comparison.error}
        </div>
      )}

      {!comparison && !isRunning && (
        <AnalysisEmptyState
          icon={<Swords className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />}
          title="No Visibility Data Yet"
          description="Complete the brand onboarding to discover your competitive landscape, then run the analysis for your AIVS™ D7 score."
          onRunAnalysis={handleRun}
          isAnalyzing={isRunning}
          disabled={!jobId}
          buttonLabel="Run Analysis"
        />
      )}

      {(comparison || d7) && (
        <div className={cn('grid gap-4', d7 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2')}>
          <StatCard
            label="Top Competitor"
            value={topCompetitor?.name ?? '—'}
            subtext={topCompetitor ? `×${topCompetitor.mentions_total} mentions` : 'No competitor data yet'}
            icon={Trophy}
            accent="violet"
            progress={topCompetitorProgress}
            description="Leading brand by AI mention frequency"
            labelAction={
              <MetricAskButton
                disabled={!jobId || isAskingAI}
                onClick={() => runMetricAskAi('top_competitor', 'Top Competitor')}
              />
            }
          />

          <StatCard
            label="Market Share"
            value={comparisonBrand?.market_share_percent != null ? `${comparisonBrand.market_share_percent.toFixed(1)}%` : '—'}
            subtext={`${competitors.length} brands tracked`}
            icon={Percent}
            accent="emerald"
            progress={comparisonBrand?.market_share_percent ?? 0}
            description="Your share of AI recommendations"
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

      <BrandOnboardingVisibilityPanel jobId={jobId} />



      {leaderboardEntries.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--nd-card-bg)', border: '1px solid var(--nd-border)' }}>
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--nd-border)' }}>
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg" style={{ background: 'var(--nd-bg)' }}>
                <Swords className="w-3.5 h-3.5" style={{ color: 'var(--nd-text-muted)' }} />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--nd-text-primary)' }}>Competitor Leaderboard</div>
                <div className="text-[11px]" style={{ color: 'var(--nd-text-muted)' }}>
                  {leaderboardEntries.length} brands · organic AI discovery
                </div>
              </div>
            </div>
            <MetricAskButton
              disabled={!jobId || isAskingAI}
              onClick={() => runMetricAskAi('competitor_leaderboard', 'Competitor Leaderboard')}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--nd-border)', background: 'var(--nd-bg)', color: 'var(--nd-text-muted)' }}>
                  <th className="p-3 font-medium w-10 text-xs uppercase tracking-wider">#</th>
                  <th className="p-3 font-medium text-xs uppercase tracking-wider">Brand</th>
                  <th className="p-3 font-medium text-xs uppercase tracking-wider">Mentions</th>
                  <th className="p-3 font-medium text-xs uppercase tracking-wider">Avg Rank</th>
                  <th className="p-3 font-medium text-xs uppercase tracking-wider">Providers</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardEntries.map((entry) => {
                  const isOurBrand = entry.entity_type === 'client'
                  const maxMentions = leaderboardEntries[0]?.mentions_total ?? 1
                  const barPct = Math.round((entry.mentions_total / maxMentions) * 100)
                  const providerLabels: Record<string, string> = { openai: 'GPT', gemini: 'GEM', claude: 'CLU' }
                  const mentionedProviders = Object.entries(entry.per_model ?? {})
                    .filter(([, v]) => v.mentions > 0)
                    .map(([k]) => k)
                  return (
                    <tr
                      key={entry.name}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--nd-border)', background: isOurBrand ? 'rgba(72,150,254,0.04)' : undefined }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--nd-bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = isOurBrand ? 'rgba(72,150,254,0.04)' : '')}
                    >
                      <td className="p-3">
                        <span className="text-xs font-mono" style={{ color: 'var(--nd-text-muted)' }}>
                          {entry.rank_position === 1
                            ? <Trophy className="w-4 h-4 text-amber-500 inline" />
                            : `#${entry.rank_position}`}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                            isOurBrand ? 'bg-blue-50 text-blue-700' : 'text-gray-500',
                          )} style={!isOurBrand ? { background: 'var(--nd-bg)' } : {}}>
                            {isOurBrand ? <Target className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={cn('font-medium truncate max-w-55')} style={{ color: isOurBrand ? 'var(--nd-blue)' : 'var(--nd-text-primary)' }}>
                              {entry.name}
                            </span>
                            {isOurBrand && (
                              <span className="text-[11px] font-bold uppercase tracking-tighter" style={{ color: 'var(--nd-blue)' }}>Your Brand</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                            <div
                              className={cn('h-full rounded-full', isOurBrand ? 'bg-blue-600' : 'bg-gray-400')}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono" style={{ color: 'var(--nd-text-secondary)' }}>×{entry.mentions_total}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-xs font-mono" style={{ color: 'var(--nd-text-secondary)' }}>
                          {entry.avg_rank != null ? `#${entry.avg_rank}` : '—'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {mentionedProviders.map((p) => (
                            <span
                              key={p}
                              className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--nd-bg)', color: 'var(--nd-text-muted)', border: '1px solid var(--nd-border)' }}
                            >
                              {providerLabels[p] ?? p.slice(0, 3).toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {benchmarkData.length > 0 && (
        <OBModelBenchmarkMatrix
          benchmarkData={benchmarkData}
          jobId={jobId}
          isAskingAI={isAskingAI}
          runMetricAskAi={runMetricAskAi}
        />
      )}
    </div>
  )
}

