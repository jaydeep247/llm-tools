'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Trophy,
} from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PromptResult, BrandAnalysis, AggregateStats } from '@/store/api/brandOnboardingApi'

const PROVIDER_META: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  openai:  { label: 'GPT',    color: 'text-green-700',  bg: 'bg-green-50',              border: 'border-green-200',  dot: 'bg-green-500'  },
  gemini:  { label: 'Gemini', color: 'text-blue-700',   bg: 'bg-blue-50',               border: 'border-blue-200',   dot: 'bg-blue-500'   },
  claude:  { label: 'Claude', color: 'text-orange-700', bg: 'bg-orange-50',             border: 'border-orange-200', dot: 'bg-orange-500' },
}

// ─── tiny helpers ────────────────────────────────────────────────────────────

function PresencePill({ mentioned }: { mentioned: boolean }) {
  return mentioned ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
      <Eye className="w-2.5 h-2.5" /> Present
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
      <EyeOff className="w-2.5 h-2.5" /> Absent
    </span>
  )
}

function RankPill({ rank, outOf }: { rank: number | null; outOf: number }) {
  if (rank === null || outOf === 0) {
    return <span className="text-[10px] text-zinc-400">—</span>
  }
  const isFirst = rank === 1
  const color = isFirst ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-zinc-600 bg-zinc-50 border-zinc-200'
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded border ${color}`}>
      {isFirst && <Trophy className="w-2.5 h-2.5" />}
      {rank}/{outOf}
    </span>
  )
}

function SentimentIcon({ sentiment }: { sentiment: string }) {
  if (sentiment === 'positive') return <TrendingUp className="w-3 h-3 text-emerald-600" />
  if (sentiment === 'negative') return <TrendingDown className="w-3 h-3 text-red-500" />
  return <Minus className="w-3 h-3 text-zinc-400" />
}

// ─── Per-provider row inside a prompt card ───────────────────────────────────

function ProviderRow({
  provider,
  analysis,
  response,
  error,
}: {
  provider: string
  analysis: BrandAnalysis | null
  response: string
  error: string | null
}) {
  const [showResponse, setShowResponse] = useState(false)
  const meta = PROVIDER_META[provider] || PROVIDER_META.openai

  return (
    <div className={`rounded-lg border ${meta.border} ${meta.bg} px-3 py-2.5 space-y-2`}>
      {/* Top row: label • presence • rank */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[11px] font-bold uppercase tracking-wide ${meta.color} min-w-11`}>
          {meta.label}
        </span>
        {error && !analysis ? (
          <span className="text-[10px] text-red-400 italic">unavailable</span>
        ) : analysis ? (
          <>
            <PresencePill mentioned={analysis.brand_mentioned} />
            {analysis.brand_mentioned && (
              <RankPill rank={analysis.brand_rank} outOf={analysis.brand_rank_out_of} />
            )}
            {analysis.brand_mentioned && (
              <span className="inline-flex items-center gap-0.5 ml-auto">
                <SentimentIcon sentiment={analysis.sentiment} />
                <span className="text-[10px] text-zinc-500 capitalize">{analysis.sentiment}</span>
              </span>
            )}
          </>
        ) : (
          <span className="text-[10px] text-zinc-400 italic">no data</span>
        )}
      </div>

      {/* Mentioned brands row */}
      {analysis?.all_mentioned_brands && analysis.all_mentioned_brands.length > 0 && (
        <div className="flex items-start gap-1.5 flex-wrap">
          <span className="text-[10px] text-zinc-400 shrink-0 mt-0.5">Brands:</span>
          {analysis.all_mentioned_brands.map((b, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] bg-white border border-zinc-200 text-zinc-600"
            >
              {b.name}
              {b.count > 1 && <span className="text-zinc-400">×{b.count}</span>}
            </span>
          ))}
        </div>
      )}

      {/* Response toggle */}
      {response && (
        <div className="pt-1 border-t border-white/60">
          <button
            onClick={() => setShowResponse(v => !v)}
            className="text-[10px] text-zinc-400 hover:text-zinc-600 underline underline-offset-2"
          >
            {showResponse ? 'Hide response' : 'View full response'}
          </button>
          <AnimatePresence>
            {showResponse && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-1.5 p-2 bg-white rounded border border-zinc-200 max-h-40 overflow-y-auto scrollbar-hide">
                  <p className="text-[11px] text-zinc-500 leading-relaxed whitespace-pre-wrap">
                    {response}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ─── Prompt card ─────────────────────────────────────────────────────────────

function PromptResultCard({ result, index }: { result: PromptResult; index: number }) {
  const [expanded, setExpanded] = useState(false)

  // Build compact inline summary: per-provider presence + rank
  const providerSummary = Object.entries(PROVIDER_META).map(([provider, meta]) => {
    const a = result.results?.[provider as keyof typeof result.results]?.analysis
    return { provider, meta, mentioned: a?.brand_mentioned ?? false, rank: a?.brand_rank ?? null, outOf: a?.brand_rank_out_of ?? 0 }
  })

  const anyMentioned = providerSummary.some(p => p.mentioned)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="border border-zinc-200 rounded-xl bg-white overflow-hidden"
    >
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
      >
        <span className="text-[11px] font-medium text-zinc-400 mt-0.5 shrink-0 w-5 text-right">
          {index + 1}
        </span>

        <div className="flex-1 min-w-0">
          {/* Prompt text */}
          <p className="text-[13px] text-zinc-800 leading-snug line-clamp-2 mb-2">{result.prompt}</p>

          {/* Per-LLM inline summary chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {providerSummary.map(({ provider, meta, mentioned, rank, outOf }) => (
              <span key={provider} className="inline-flex items-center gap-1.5">
                {/* colored dot + label */}
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                <span className={`text-[10px] font-bold ${meta.color}`}>{meta.label}</span>
                {/* presence */}
                {mentioned ? (
                  <>
                    <span className="text-[10px] text-emerald-600 font-medium">✓</span>
                    {rank !== null && (
                      <span className="text-[10px] text-zinc-500">
                        #{rank}/{outOf}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-zinc-400">—</span>
                )}
              </span>
            ))}

            {/* Overall presence indicator */}
            {!anyMentioned && (
              <span className="text-[10px] text-zinc-400 italic ml-1">Not mentioned by any model</span>
            )}
          </div>
        </div>

        {expanded
          ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0 mt-1" />
          : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0 mt-1" />
        }
      </button>

      {/* Expanded — detailed per-LLM rows */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-zinc-100"
          >
            <div className="px-4 py-3 space-y-2">
              {Object.entries(PROVIDER_META).map(([provider]) => {
                const pr = result.results?.[provider as keyof typeof result.results]
                return (
                  <ProviderRow
                    key={provider}
                    provider={provider}
                    analysis={pr?.analysis ?? null}
                    response={pr?.response ?? ''}
                    error={pr?.error ?? null}
                  />
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Aggregate summary strip ──────────────────────────────────────────────────

function AggregateSummary({ agg, brandName }: { agg: AggregateStats; brandName: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {/* Brand presence */}
      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">Brand Presence</div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-zinc-800">{agg.brand_presence_count}</span>
          <span className="text-[11px] text-zinc-400">/ {agg.brand_presence_total} responses</span>
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">{agg.brand_presence_rate}% presence rate</div>
      </div>

      {/* Average rank */}
      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">Avg Rank (when present)</div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-zinc-800">
            {agg.avg_rank !== null ? `#${agg.avg_rank}` : '—'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
            <TrendingUp className="w-2.5 h-2.5" /> {agg.positive_mentions} positive
          </span>
          <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500">
            <TrendingDown className="w-2.5 h-2.5" /> {agg.negative_mentions} negative
          </span>
        </div>
      </div>

      {/* Competitors presence */}
      <div className="col-span-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
          <Users className="w-3 h-3" /> Brands mentioned across all responses
        </div>
        {agg.all_brand_mentions.length === 0 ? (
          <span className="text-[11px] text-zinc-400 italic">No brands detected</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {agg.all_brand_mentions.map((b, i) => {
              const isBrand = b.name.toLowerCase().includes(brandName.toLowerCase())
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${
                    isBrand
                      ? 'bg-brand-orange-subtle text-brand-orange border-orange-200 font-semibold'
                      : 'bg-zinc-50 text-zinc-600 border-zinc-200'
                  }`}
                >
                  {b.name}
                  <span className={`text-[10px] ${isBrand ? 'text-orange-400' : 'text-zinc-400'}`}>×{b.count}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Provider summary cards (top strip) ──────────────────────────────────────

function ProviderSummaryCards({ results }: { results: PromptResult[] }) {
  const stats = Object.keys(PROVIDER_META).reduce((acc, provider) => {
    let mentioned = 0, total = 0
    const ranks: number[] = []
    for (const r of results) {
      const a = r.results?.[provider as keyof typeof r.results]?.analysis
      if (a) {
        total++
        if (a.brand_mentioned) {
          mentioned++
          if (a.brand_rank !== null) ranks.push(a.brand_rank)
        }
      }
    }
    const avgRank = ranks.length > 0 ? (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1) : null
    acc[provider] = { mentioned, total, avgRank }
    return acc
  }, {} as Record<string, { mentioned: number; total: number; avgRank: string | null }>)

  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      {Object.entries(PROVIDER_META).map(([provider, meta]) => {
        const s = stats[provider]
        const rate = s.total > 0 ? Math.round((s.mentioned / s.total) * 100) : 0
        return (
          <div key={provider} className={`rounded-xl border ${meta.border} ${meta.bg} px-3 py-2.5`}>
            <div className={`text-[10px] font-bold uppercase tracking-wide ${meta.color} mb-1.5`}>{meta.label}</div>
            <div className="text-lg font-bold text-zinc-800">{s.mentioned}<span className="text-[11px] font-normal text-zinc-400">/{s.total}</span></div>
            <div className="text-[10px] text-zinc-500 space-y-0.5">
              <div>prompts present ({rate}%)</div>
              <div>avg rank: {s.avgRank !== null ? `#${s.avgRank}` : '—'}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface StepBrandResultsProps {
  results: PromptResult[]
  aggregate?: AggregateStats
  isLoading: boolean
  brandName: string
  onDashboard: () => void
  onRetry?: () => void
}

export function StepBrandResults({ results, aggregate, isLoading, brandName, onDashboard, onRetry }: StepBrandResultsProps) {
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="flex flex-col items-center justify-center h-full gap-4"
      >
        <div className="w-12 h-12 bg-brand-orange-subtle rounded-2xl flex items-center justify-center border border-brand-orange-light">
          <Loader2 className="w-6 h-6 text-brand-orange animate-spin" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-brand-charcoal mb-2">Analyzing brand visibility</h2>
          <p className="text-sm text-brand-muted max-w-sm">
            Sending your prompts to GPT, Gemini, and Claude and checking each response for brand mentions.
            This may take a minute…
          </p>
        </div>
      </motion.div>
    )
  }

  if (results.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="flex flex-col items-center justify-center h-full gap-5"
      >
        <div className="w-12 h-12 bg-brand-surface rounded-2xl flex items-center justify-center border border-brand-warm">
          <BarChart3 className="w-6 h-6 text-brand-muted" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-brand-charcoal mb-2">Analysis could not be completed</h2>
          <p className="text-sm text-brand-muted max-w-sm">
            The brand visibility analysis did not return results. This can happen due to slow AI responses.
            Please retry or continue to your dashboard.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {onRetry && (
            <Button
              onClick={onRetry}
              className="w-full bg-brand-orange hover:bg-brand-orange-hover text-white h-11 text-sm font-medium rounded-xl"
            >
              Retry Analysis
            </Button>
          )}
          <Button
            onClick={onDashboard}
            variant="outline"
            className="w-full h-11 text-sm font-medium rounded-xl"
          >
            Skip & Go to Dashboard
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-xl font-bold text-brand-charcoal mb-0.5 tracking-tight">Brand Visibility Results</h2>
        <p className="text-sm text-brand-muted">
          How <span className="font-medium text-brand-charcoal">{brandName}</span> appears across AI platforms.
          Tap any prompt to see per-model details.
        </p>
      </div>

      {/* Aggregate stats — shown when available */}
      {aggregate ? (
        <AggregateSummary agg={aggregate} brandName={brandName} />
      ) : (
        <ProviderSummaryCards results={results} />
      )}

      {/* Prompt list */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-2 pb-2">
        {results.map((result, index) => (
          <PromptResultCard key={index} result={result} index={index} />
        ))}
      </div>

      {/* CTA */}
      <div className="pt-3 border-t border-brand-surface mt-auto shrink-0">
        <Button
          onClick={onDashboard}
          className="w-full bg-brand-orange hover:bg-brand-orange-hover text-white h-11 text-sm font-medium rounded-xl"
        >
          Go to Full Dashboard
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  )
}
