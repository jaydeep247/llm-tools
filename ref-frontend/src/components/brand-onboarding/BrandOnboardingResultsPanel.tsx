'use client'

import { useState, useMemo } from 'react'
import {
  BarChart3,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Info,
  Search,
  ArrowLeftRight,
  ShoppingCart,
  Bot,
  Tag,
  MapPin,
  Users,
  Sparkles,
} from 'lucide-react'
import { useGetOnboardingDataQuery } from '@/store/api/brandOnboardingApi'
import type { PromptResult, BrandAnalysis } from '@/store/api/brandOnboardingApi'

// ── Provider metadata (dark-theme palette) ─────────────────────────────────

const PROVIDER_META = {
  openai: { label: 'GPT', color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
  gemini: { label: 'Gemini', color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10' },
  claude: { label: 'Claude', color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
} as const

type Provider = keyof typeof PROVIDER_META

// ── Prompt-type metadata ────────────────────────────────────────────────────

const PROMPT_TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  informational: { label: 'Informational', icon: <Info className="w-3 h-3" /> },
  commercial: { label: 'Commercial', icon: <Search className="w-3 h-3" /> },
  comparative: { label: 'Comparative', icon: <ArrowLeftRight className="w-3 h-3" /> },
  transactional: { label: 'Transactional', icon: <ShoppingCart className="w-3 h-3" /> },
  'agent-style': { label: 'Agent-style', icon: <Bot className="w-3 h-3" /> },
  custom: { label: 'Custom', icon: <Tag className="w-3 h-3" /> },
}

// ── Small score chip ────────────────────────────────────────────────────────

function ScoreChip({ score }: { score: number }) {
  const cls =
    score >= 70 ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' :
    score >= 40 ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' :
    score > 0   ? 'text-rose-400 bg-rose-500/15 border-rose-500/30' :
                  'text-zinc-500 bg-zinc-800/40 border-zinc-700/50'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded border ${cls}`}>
      {score}
    </span>
  )
}

// ── Mention badge ───────────────────────────────────────────────────────────

function MentionBadge({ mentioned }: { mentioned: boolean }) {
  return mentioned ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
      <Eye className="w-3 h-3" /> Mentioned
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-zinc-800/40 text-zinc-500 border border-zinc-700/50">
      <EyeOff className="w-3 h-3" /> Not mentioned
    </span>
  )
}

// ── Position badge ──────────────────────────────────────────────────────────

function PositionBadge({ position }: { position: string }) {
  const map: Record<string, string> = {
    early: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    middle: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    late: 'text-brand-orange bg-brand-orange/10 border-brand-orange/30',
    not_mentioned: 'text-zinc-500 bg-zinc-800/40 border-zinc-700/50',
  }
  const cls = map[position?.toLowerCase()] ?? map['not_mentioned']
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${cls}`}>
      <MapPin className="w-3 h-3" /> {position || 'not mentioned'}
    </span>
  )
}

// ── Per-provider card inside expanded prompt ─────────────────────────────────

function ProviderCard({
  provider,
  analysis,
  response,
  error,
}: {
  provider: Provider
  analysis: BrandAnalysis | null
  response: string
  error: string | null
}) {
  const [showResponse, setShowResponse] = useState(false)
  const meta = PROVIDER_META[provider]

  return (
    <div className={`rounded-lg border ${meta.border} ${meta.bg} p-3`}>
      {/* Provider header */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-bold ${meta.color} uppercase tracking-widest`}>{meta.label}</span>
        {analysis && <ScoreChip score={analysis.brand_visibility_score ?? 0} />}
      </div>

      {error && !response ? (
        <p className="text-[11px] text-rose-400">Error: {error}</p>
      ) : analysis ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <MentionBadge mentioned={!!analysis.brand_mentioned} />
            <PositionBadge position={analysis.mention_position} />
          </div>
          {analysis.competitors_mentioned && analysis.competitors_mentioned.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {analysis.competitors_mentioned.slice(0, 4).map((c, i) => (
                <span key={i} className="px-1.5 py-0.5 text-[10px] text-zinc-400 bg-zinc-800/50 border border-zinc-700/50 rounded">
                  {c.name}
                </span>
              ))}
              {analysis.competitors_mentioned.length > 4 && (
                <span className="text-[10px] text-zinc-600">+{analysis.competitors_mentioned.length - 4}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-600">No analysis</p>
      )}

      {response && (
        <div className="mt-2 pt-2 border-t border-zinc-700/40">
          <button
            onClick={() => setShowResponse(!showResponse)}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
          >
            {showResponse ? 'Hide response' : 'View LLM response'}
          </button>
          {showResponse && (
            <div className="mt-1.5 p-2 bg-zinc-900/80 rounded-lg border border-zinc-800 max-h-36 overflow-y-auto">
              <p className="text-[10px] text-zinc-400 leading-relaxed whitespace-pre-wrap">{response}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Single prompt row ────────────────────────────────────────────────────────

function PromptRow({ result, index }: { result: PromptResult; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const typeMeta = PROMPT_TYPE_META[result.type] ?? PROMPT_TYPE_META.informational

  const allCompetitors = useMemo(() => {
    const set = new Set<string>()
    for (const provider of Object.keys(PROVIDER_META) as Provider[]) {
      const analysis = result.results?.[provider]?.analysis
      analysis?.competitors_mentioned?.forEach((c) => set.add(c.name))
    }
    return Array.from(set)
  }, [result])

  return (
    <div className="border border-zinc-800/60 rounded-xl bg-zinc-900/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-zinc-800/20 transition-colors"
      >
        <span className="text-[10px] font-mono text-zinc-600 mt-0.5 shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-zinc-200 leading-relaxed line-clamp-2">{result.prompt}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-zinc-400 bg-zinc-800/40 border border-zinc-700/40 rounded-full">
              {typeMeta.icon} {typeMeta.label}
            </span>
            {/* Provider score chips */}
            {(Object.keys(PROVIDER_META) as Provider[]).map((p) => {
              const score = result.results?.[p]?.analysis?.brand_visibility_score
              if (score == null) return null
              const meta = PROVIDER_META[p]
              const scoreColor =
                score >= 70 ? 'text-emerald-400' :
                score >= 40 ? 'text-amber-400' :
                score > 0   ? 'text-rose-400' :
                              'text-zinc-600'
              return (
                <span key={p} className="inline-flex items-center gap-1 text-[10px] font-semibold">
                  <span className={meta.color}>{meta.label}</span>
                  <span className={scoreColor}>{score}</span>
                </span>
              )
            })}
            {allCompetitors.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-zinc-600">
                <Users className="w-3 h-3" /> {allCompetitors.length}
              </span>
            )}
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
          : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
        }
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/40 px-3.5 pb-3.5">
          <div className="space-y-2 mt-3">
            {(Object.keys(PROVIDER_META) as Provider[]).map((p) => (
              <ProviderCard
                key={p}
                provider={p}
                analysis={result.results?.[p]?.analysis ?? null}
                response={result.results?.[p]?.response ?? ''}
                error={result.results?.[p]?.error ?? null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Provider KPI summary card ────────────────────────────────────────────────

function ProviderSummaryCard({
  provider,
  results,
}: {
  provider: Provider
  results: PromptResult[]
}) {
  const meta = PROVIDER_META[provider]

  const { avgScore, mentionRate, competitorCount } = useMemo(() => {
    const scores: number[] = []
    let mentioned = 0
    const competitors = new Set<string>()
    for (const r of results) {
      const analysis = r.results?.[provider]?.analysis
      if (!analysis) continue
      scores.push(analysis.brand_visibility_score ?? 0)
      if (analysis.brand_mentioned) mentioned++
      analysis.competitors_mentioned?.forEach((c) => competitors.add(c))
    }
    const avg = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0
    const rate = results.length > 0
      ? Math.round((mentioned / results.length) * 100)
      : 0
    return { avgScore: avg, mentionRate: rate, competitorCount: competitors.size }
  }, [provider, results])

  const scoreColor =
    avgScore >= 70 ? 'text-emerald-400' :
    avgScore >= 40 ? 'text-amber-400' :
    avgScore > 0   ? 'text-rose-400' :
                     'text-zinc-600'

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} p-4`}>
      <div className={`text-[10px] font-bold ${meta.color} uppercase tracking-widest mb-3`}>{meta.label}</div>
      <div className={`text-2xl font-bold ${scoreColor}`}>{avgScore}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">avg visibility score</div>
      <div className="mt-3 space-y-1.5 text-[11px] text-zinc-400">
        <div className="flex items-center justify-between">
          <span>Mention rate</span>
          <span className="text-zinc-200 font-medium">{mentionRate}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Competitors seen</span>
          <span className="text-zinc-200 font-medium">{competitorCount}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

interface BrandOnboardingResultsPanelProps {
  jobId?: string | null
}

export function BrandOnboardingResultsPanel({ jobId }: BrandOnboardingResultsPanelProps) {
  const { data, isLoading } = useGetOnboardingDataQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  if (!jobId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
          <BarChart3 className="h-5 w-5 text-zinc-500" />
        </div>
        <p className="text-sm text-zinc-500">No session job found.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
          <span className="text-sm text-zinc-500">Loading brand survey…</span>
        </div>
      </div>
    )
  }

  const results: PromptResult[] = data?.prompt_results ?? []
  const topics: string[] = data?.topics_selected ?? []

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
          <Sparkles className="h-5 w-5 text-zinc-500" />
        </div>
        <p className="text-base font-semibold text-zinc-300 mb-1">No Brand Survey Results Yet</p>
        <p className="text-sm text-zinc-500 max-w-xs">
          Complete the brand-onboarding flow to generate AI brand visibility results for this session.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-2">
      {/* Header */}
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-white">AI Brand Survey</h2>
        <p className="text-xs sm:text-sm text-zinc-500 mt-1">
          How your brand appears across GPT, Gemini, and Claude for your onboarding prompts.
        </p>
      </div>

      {/* Selected topics */}
      {topics.length > 0 && (
        <div>
          <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Topics Tracked</p>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t, i) => (
              <span key={i} className="px-2.5 py-0.5 text-[11px] text-zinc-300 bg-zinc-800/50 border border-zinc-700/50 rounded-full">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Provider KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(PROVIDER_META) as Provider[]).map((p) => (
          <ProviderSummaryCard key={p} provider={p} results={results} />
        ))}
      </div>

      {/* Prompt results list */}
      <div>
        <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-3">
          Prompt Results ({results.length})
        </p>
        <div className="space-y-2">
          {results.map((result, i) => (
            <PromptRow key={i} result={result} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
