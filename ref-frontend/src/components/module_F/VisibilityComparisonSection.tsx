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
  Search, Activity, ExternalLink, AlertCircle, Check
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleFAskAiChatShell } from '@/components/module_F/ModuleFAskAiChatShell'
import { useSearchBrandMentionsMutation } from '@/store/api/brandMentionsApi'
import {
  useGetOnboardingDataQuery,
  type PromptResult,
  type AggregateStats,
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
    openai: { color: 'text-emerald-400', icon: Zap, bg: 'bg-emerald-500/10' },
    gemini: { color: 'text-blue-400', icon: Activity, bg: 'bg-blue-500/10' },
    claude: { color: 'text-amber-400', icon: Star, bg: 'bg-amber-500/10' },
  }

  if (!benchmarkData.length || !models.length) return null

  return (
    <SectionCard
      title="Model-by-Model Benchmark"
      description="Mention frequency per AI provider across all prompts. Leader cell highlighted."
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
              <th className="p-4 font-bold uppercase tracking-wider text-[10px] sticky left-0 bg-zinc-900/50 backdrop-blur-md z-10">Brand</th>
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
            {benchmarkData.map((entity) => (
              <tr key={entity.name} className="hover:bg-zinc-900/40 transition-colors group">
                <td className="p-4 sticky left-0 bg-[#111113] group-hover:bg-[#161618] transition-colors z-10 border-r border-zinc-800/50">
                  <div className="flex items-center gap-2">
                    <span className={cn('font-semibold truncate max-w-48', entity.is_our_brand ? 'text-blue-300' : 'text-zinc-100')}>
                      {entity.name}
                    </span>
                    {entity.is_our_brand && (
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] px-1 py-0 h-4">YOU</Badge>
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
                          isLeader
                            ? 'border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.1)] scale-[1.02]'
                            : 'border-zinc-800 bg-zinc-900/40',
                        )}>
                          <div className={cn('text-lg font-bold font-mono', isLeader ? 'text-emerald-400' : 'text-zinc-100')}>
                            ×{stats.mentions}
                          </div>
                          <div className="text-[10px] font-medium text-zinc-500 mt-1 uppercase tracking-tighter">
                            {stats.avg_rank != null ? `Avg #${stats.avg_rank}` : 'mentions'}
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

// ─────────────────────────────────────────────────────────────────────────────
// Brand Onboarding Visibility Panel
// Shows onboarding prompt-results data: KPI cards, topic list, prompt table
// ─────────────────────────────────────────────────────────────────────────────

type OBProviders = 'openai' | 'gemini' | 'claude'
const OB_PROVIDERS: OBProviders[] = ['openai', 'gemini', 'claude']
const OB_PROVIDER_CFG: Record<OBProviders, { label: string; color: string; bg: string; border: string }> = {
  openai: { label: 'GPT',    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  gemini: { label: 'Gemini', color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25'   },
  claude: { label: 'Claude', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25'  },
}

function OBPresenceBadge({ mentioned }: { mentioned: boolean }) {
  return mentioned ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
      Present
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-800/50 text-zinc-600 border border-zinc-700/30">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 inline-block" />
      Absent
    </span>
  )
}

function OBRankBadge({ rank, outOf }: { rank: number | null; outOf: number }) {
  if (rank == null) return <span className="text-[10px] text-zinc-700 font-mono">—</span>
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border',
      rank === 1
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
        : 'text-zinc-400 bg-zinc-800/40 border-zinc-700/30',
    )}>
      #{rank}{outOf ? `/${outOf}` : ''}
    </span>
  )
}

function OBSentimentBadge({ sentiment }: { sentiment: string }) {
  const cls: Record<string, string> = {
    positive: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    negative: 'text-red-400 bg-red-500/10 border-red-500/25',
    neutral:  'text-zinc-400 bg-zinc-800/40 border-zinc-700/30',
  }
  const sym: Record<string, string> = { positive: '↑', negative: '↓', neutral: '~' }
  return (
    <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border capitalize', cls[sentiment] ?? cls.neutral)}>
      {sym[sentiment] ?? '~'} {sentiment}
    </span>
  )
}

function OBProviderCell({
  provider,
  result,
}: {
  provider: OBProviders
  result: { response: string; analysis: PromptResult['results']['openai']['analysis']; error: string | null } | undefined
}) {
  const [showResp, setShowResp] = useState(false)
  const cfg = OB_PROVIDER_CFG[provider]
  const a = result?.analysis
  return (
    <div className={cn('rounded-lg border p-2.5 space-y-1.5', cfg.border, cfg.bg)}>
      <div className="flex items-center justify-between gap-1">
        <span className={cn('text-[9px] font-bold uppercase tracking-widest', cfg.color)}>{cfg.label}</span>
        {!a && (
          <span className="text-[9px] text-zinc-700">{result?.error ? 'Error' : '—'}</span>
        )}
      </div>
      {a && (
        <>
          <div className="flex flex-wrap gap-1">
            <OBPresenceBadge mentioned={a.brand_mentioned} />
            {a.brand_mentioned && <OBRankBadge rank={a.brand_rank} outOf={a.brand_rank_out_of} />}
            {a.brand_mentioned && <OBSentimentBadge sentiment={a.sentiment} />}
          </div>
          {a.brand_mentioned && a.all_mentioned_brands && a.all_mentioned_brands.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {a.all_mentioned_brands.slice(0, 5).map((b, i) => (
                <span key={i} className="px-1 py-0.5 text-[8px] rounded bg-zinc-800/60 border border-zinc-700/40 text-zinc-500">
                  {b.name}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {result?.response && (
        <>
          <button
            onClick={() => setShowResp(!showResp)}
            className="text-[8px] text-zinc-600 hover:text-zinc-400 underline"
          >
            {showResp ? 'hide response' : 'view response'}
          </button>
          {showResp && (
            <div className="mt-1 p-1.5 bg-zinc-950/60 rounded border border-zinc-800/60 max-h-28 overflow-y-auto">
              <p className="text-[8px] text-zinc-500 whitespace-pre-wrap leading-relaxed">{result.response}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function OBPromptRow({ result, index }: { result: PromptResult; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const [sourcesFetched, setSourcesFetched] = useState(false)
  const [searchBrandMentions, { data: searchData, isLoading: isSearching, error }] = useSearchBrandMentionsMutation()

  useEffect(() => {
    if (expanded && !sourcesFetched && !isSearching && !searchData) {
      setSourcesFetched(true)
      searchBrandMentions({ query: result.prompt, num: 10 })
    }
  }, [expanded, sourcesFetched, isSearching, searchData, searchBrandMentions, result.prompt])

  const mentionedCount = OB_PROVIDERS.filter((p) => result.results?.[p]?.analysis?.brand_mentioned).length
  const ranks = OB_PROVIDERS
    .map((p) => result.results?.[p]?.analysis?.brand_rank)
    .filter((r): r is number => r != null)
  const avgRank = ranks.length ? (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1) : null
  return (
    <div className="border border-zinc-800/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800/20 transition-colors"
      >
        <span className="text-[10px] font-mono text-zinc-700 pt-0.5 shrink-0 w-5">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-200 leading-snug">{result.prompt}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {OB_PROVIDERS.map((p) => {
              const a = result.results?.[p]?.analysis
              const cfg = OB_PROVIDER_CFG[p]
              return (
                <span key={p} className={cn('inline-flex items-center gap-0.5 text-[9px] font-bold', cfg.color)}>
                  {cfg.label}
                  <span className={a?.brand_mentioned ? 'text-emerald-500' : 'text-zinc-700'}>
                    {a ? (a.brand_mentioned ? ' ✓' : ' ✗') : ' –'}
                  </span>
                </span>
              )
            })}
            {mentionedCount > 0 && (
              <span className="text-[9px] text-zinc-600">
                {mentionedCount}/3 models{avgRank ? ` · avg #${avgRank}` : ''}
              </span>
            )}
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
          : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
        }
      </button>
      {expanded && (
        <div className="border-t border-zinc-800/40 px-4 pb-4 pt-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {OB_PROVIDERS.map((p) => (
              <OBProviderCell key={p} provider={p} result={result.results?.[p]} />
            ))}
          </div>

          {/* Sources Section */}
          <div className="border-t border-zinc-800/40 pt-3">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
              Source URLs
            </h4>
            {isSearching ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
              </div>
            ) : error ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-red-200">Failed to fetch sources</div>
              </div>
            ) : searchData?.results && searchData.results.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {searchData.results.map((r, i) => (
                  <a
                    key={`${r.url}-${i}`}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-800/60 border border-zinc-800 hover:border-zinc-700 transition-all group/link"
                  >
                    <div className="mt-0.5 shrink-0">
                      <Globe className="w-3.5 h-3.5 text-zinc-500 group-hover/link:text-blue-400 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-[11px] font-semibold text-zinc-200 group-hover/link:text-blue-300 transition-colors line-clamp-2">
                            {r.title}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate group-hover/link:text-zinc-400 transition-colors">
                            {r.url}
                          </p>
                        </div>
                        <ExternalLink className="w-3 h-3 text-zinc-600 group-hover/link:text-blue-400 shrink-0 mt-0.5 transition-colors" />
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[8px] font-bold uppercase tracking-tighter text-zinc-600 px-1.5 py-0.5 rounded bg-zinc-800/50">
                          Rank #{r.rank}
                        </span>
                        <span className="text-[8px] text-zinc-600 bg-zinc-800/40 px-1.5 py-0.5 rounded">
                          {r.source_domain}
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-[11px] text-zinc-600">No sources found for this query</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BrandOnboardingVisibilityPanel({ jobId }: { jobId?: string | null }) {
  const { data, isLoading } = useGetOnboardingDataQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)

  const results: PromptResult[] = data?.prompt_results ?? []
  const aggregate: AggregateStats | undefined = data?.aggregate

  // Group prompts by topic
  const topicMap = useMemo<Record<string, PromptResult[]>>(() => {
    const map: Record<string, PromptResult[]> = {}
    for (const r of results) {
      const key = r.topic || 'General'
      if (!map[key]) map[key] = []
      map[key].push(r)
    }
    return map
  }, [results])

  const topicList = useMemo(() => {
    return Object.entries(topicMap).map(([topic, prompts]) => {
      const totalResps = prompts.reduce(
        (acc, p) => acc + OB_PROVIDERS.filter((pr) => p.results?.[pr]?.analysis != null).length,
        0,
      )
      const mentionedResps = prompts.reduce(
        (acc, p) => acc + OB_PROVIDERS.filter((pr) => p.results?.[pr]?.analysis?.brand_mentioned).length,
        0,
      )
      const rate = totalResps ? Math.round((mentionedResps / totalResps) * 100) : 0
      return { topic, prompts, rate, promptCount: prompts.length }
    })
  }, [topicMap])

  const displayedPrompts = useMemo(
    () => (selectedTopic ? topicMap[selectedTopic] ?? [] : results),
    [selectedTopic, results, topicMap],
  )

  if (!jobId || isLoading || results.length === 0) return null

  const presenceRate = aggregate?.brand_presence_rate ?? 0
  const presenceCount = aggregate?.brand_presence_count ?? 0
  const totalResps = aggregate?.total_responses ?? 0
  const positivePct = presenceCount
    ? Math.round(((aggregate?.positive_mentions ?? 0) / presenceCount) * 100)
    : 0
  const negativePct = presenceCount
    ? Math.round(((aggregate?.negative_mentions ?? 0) / presenceCount) * 100)
    : 0

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          {
            label: 'Brand Presence',
            value: `${presenceRate}%`,
            sub: `${presenceCount} of ${totalResps} responses`,
            color: 'text-blue-400',
            bar: presenceRate,
            barColor: 'bg-blue-500',
          },
          {
            label: 'Average Rank',
            value: aggregate?.avg_rank != null ? `#${aggregate.avg_rank}` : '—',
            sub: 'across all models',
            color: 'text-violet-400',
            bar: null as number | null,
            barColor: '',
          },
          {
            label: 'Positive Mentions',
            value: `${positivePct}%`,
            sub: `${aggregate?.positive_mentions ?? 0} of ${presenceCount}`,
            color: 'text-emerald-400',
            bar: positivePct,
            barColor: 'bg-emerald-500',
          },
          {
            label: 'Negative Mentions',
            value: `${negativePct}%`,
            sub: `${aggregate?.negative_mentions ?? 0} of ${presenceCount}`,
            color: 'text-red-400',
            bar: negativePct,
            barColor: 'bg-red-500',
          },
        ] as const).map(({ label, value, sub, color, bar, barColor }) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">{label}</div>
            <div className={cn('text-2xl font-bold font-mono', color)}>{value}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>
            {bar !== null && (
              <div className="mt-3 h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div className={cn('h-full rounded-full', barColor)} style={{ width: `${bar}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Brand presence by topic */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-100">Brand Presence by Topic</span>
          <span className="text-[10px] text-zinc-600">
            {topicList.length} topics · {results.length} prompts
          </span>
        </div>
        <div className="divide-y divide-zinc-800/50 max-h-80 overflow-y-auto">
          {topicList.length === 0 ? (
            <p className="px-4 py-6 text-center text-[11px] text-zinc-600">No topic data</p>
          ) : (
            topicList.map(({ topic, rate, promptCount }) => (
              <button
                key={topic}
                onClick={() => setSelectedTopic(selectedTopic === topic ? null : topic)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  selectedTopic === topic ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/30',
                )}
              >
                <span className="flex-1 text-[11px] text-zinc-300 truncate">{topic}</span>
                <span className="text-[10px] text-zinc-600 shrink-0">{promptCount} prompts</span>
                <div className="w-20 shrink-0 flex items-center gap-1.5">
                  <div className="flex-1 h-1 rounded-full bg-zinc-800">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        rate >= 50 ? 'bg-emerald-500' : rate >= 25 ? 'bg-amber-500' : 'bg-zinc-600',
                      )}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <span className={cn(
                    'text-[9px] font-bold w-7 text-right',
                    rate >= 50 ? 'text-emerald-400' : rate >= 25 ? 'text-amber-400' : 'text-zinc-600',
                  )}>
                    {rate}%
                  </span>
                </div>
                {selectedTopic === topic
                  ? <ChevronUp className="w-3 h-3 text-zinc-500 shrink-0" />
                  : <ChevronDown className="w-3 h-3 text-zinc-600 shrink-0" />
                }
              </button>
            ))
          )}
        </div>
      </div>

      {/* Prompt results table */}
      <div className="rounded-xl border border-zinc-800 bg-[#111113] overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">
              {selectedTopic ? `Topic: ${selectedTopic}` : 'All Prompts'}
            </span>
            <span className="text-[10px] text-zinc-600">({displayedPrompts.length})</span>
          </div>
          {selectedTopic && (
            <button
              onClick={() => setSelectedTopic(null)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              Show all
            </button>
          )}
        </div>
        <div className="p-3 space-y-2">
          {displayedPrompts.map((r, i) => (
            <OBPromptRow key={`${r.prompt}-${i}`} result={r} index={i} />
          ))}
        </div>
      </div>
    </div>
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
                    'bg-linear-to-r from-purple-500 via-pink-500 to-amber-300',
                    'text-black hover:opacity-95 hover:shadow-xl',
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
        <div className="bg-[#111113] rounded-xl border border-zinc-800 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-zinc-800 rounded-lg">
                <Swords className="w-3.5 h-3.5 text-zinc-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-100">Competitor Leaderboard</div>
                <div className="text-[11px] text-zinc-600">
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
                <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400">
                  <th className="p-3 font-medium w-10 text-[10px] uppercase tracking-wider">#</th>
                  <th className="p-3 font-medium text-[10px] uppercase tracking-wider">Brand</th>
                  <th className="p-3 font-medium text-[10px] uppercase tracking-wider">Mentions</th>
                  <th className="p-3 font-medium text-[10px] uppercase tracking-wider">Avg Rank</th>
                  <th className="p-3 font-medium text-[10px] uppercase tracking-wider">Providers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
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
                      className={cn(
                        'hover:bg-zinc-900/50 transition-colors',
                        isOurBrand && 'bg-blue-950/20',
                      )}
                    >
                      <td className="p-3">
                        <span className="text-zinc-600 text-xs font-mono">
                          {entry.rank_position === 1
                            ? <Trophy className="w-4 h-4 text-amber-400 inline" />
                            : `#${entry.rank_position}`}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                            isOurBrand ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-400',
                          )}>
                            {isOurBrand ? <Target className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={cn(
                              'font-medium truncate max-w-55',
                              isOurBrand ? 'text-blue-300' : 'text-zinc-100',
                            )}>
                              {entry.name}
                            </span>
                            {isOurBrand && (
                              <span className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">Your Brand</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', isOurBrand ? 'bg-blue-500' : 'bg-zinc-500/60')}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-zinc-400">×{entry.mentions_total}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-xs font-mono text-zinc-400">
                          {entry.avg_rank != null ? `#${entry.avg_rank}` : '—'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {mentionedProviders.map((p) => (
                            <span
                              key={p}
                              className="text-[8px] font-mono bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded"
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

