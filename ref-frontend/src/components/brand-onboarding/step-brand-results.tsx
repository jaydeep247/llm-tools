'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Info,
  Search,
  ShoppingCart,
  ArrowLeftRight,
  Bot,
  MapPin,
  Users,
  Tag,
} from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PromptResult, BrandAnalysis } from '@/store/api/brandOnboardingApi'

const PROMPT_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  informational: { label: 'Informational', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: <Info className="w-3 h-3" /> },
  commercial: { label: 'Commercial', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Search className="w-3 h-3" /> },
  comparative: { label: 'Comparative', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: <ArrowLeftRight className="w-3 h-3" /> },
  transactional: { label: 'Transactional', color: 'bg-teal-50 text-teal-700 border-teal-200', icon: <ShoppingCart className="w-3 h-3" /> },
  'agent-style': { label: 'Agent-style', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: <Bot className="w-3 h-3" /> },
  custom: { label: 'Custom', color: 'bg-brand-surface text-brand-charcoal border-brand-warm', icon: <Tag className="w-3 h-3" /> },
}

const PROVIDER_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  openai: { label: 'GPT', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  gemini: { label: 'Gemini', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  claude: { label: 'Claude', color: 'text-orange-700', bg: 'bg-brand-orange-subtle', border: 'border-orange-200' },
}

interface StepBrandResultsProps {
  results: PromptResult[]
  isLoading: boolean
  brandName: string
  onDashboard: () => void
  onRetry?: () => void
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
    score >= 40 ? 'text-amber-700 bg-amber-50 border-amber-200' :
    score > 0 ? 'text-red-700 bg-red-50 border-red-200' :
    'text-brand-muted bg-brand-surface border-brand-warm'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-full border ${color}`}>
      {score}
    </span>
  )
}

function MentionBadge({ mentioned }: { mentioned: boolean }) {
  return mentioned ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
      <Eye className="w-3 h-3" /> Mentioned
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded bg-brand-surface text-brand-muted border border-brand-warm">
      <EyeOff className="w-3 h-3" /> Not mentioned
    </span>
  )
}

function PositionBadge({ position }: { position: string }) {
  const colorMap: Record<string, string> = {
    first: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    middle: 'text-amber-700 bg-amber-50 border-amber-200',
    last: 'text-orange-700 bg-brand-orange-subtle border-orange-200',
    'not mentioned': 'text-brand-muted bg-brand-surface border-brand-warm',
  }
  const color = colorMap[position?.toLowerCase()] || colorMap['not mentioned']
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded border ${color}`}>
      <MapPin className="w-3 h-3" /> {position || 'not mentioned'}
    </span>
  )
}

function CompetitorTags({ competitors }: { competitors: string[] }) {
  if (!competitors || competitors.length === 0) {
    return <span className="text-[11px] text-brand-muted italic">None detected</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {competitors.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-brand-surface text-brand-muted border border-brand-warm"
        >
          {c}
        </span>
      ))}
    </div>
  )
}

function ProviderAnalysisCard({
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
    <div className={`rounded-lg border ${meta.border} ${meta.bg} p-3`}>
      {/* Provider header row */}
      <div className="flex items-center justify-between mb-2.5">
        <span className={`text-xs font-bold ${meta.color} uppercase tracking-wide`}>{meta.label}</span>
        {analysis && <ScoreBadge score={analysis.brand_visibility_score ?? 0} />}
      </div>

      {error && !response ? (
        <p className="text-[11px] text-red-500">Error: {error}</p>
      ) : analysis ? (
        <div className="space-y-2">
          {/* Row 1: Mentioned + Position */}
          <div className="flex items-center gap-2 flex-wrap">
            <MentionBadge mentioned={!!analysis.brand_mentioned} />
            <PositionBadge position={analysis.mention_position} />
          </div>

          {/* Row 2: Competitors */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Users className="w-3 h-3 text-brand-muted" />
              <span className="text-[11px] font-medium text-brand-muted">Competitors:</span>
            </div>
            <CompetitorTags competitors={analysis.competitors_mentioned ?? []} />
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-brand-muted">No analysis available</p>
      )}

      {/* Toggle raw LLM response */}
      {response && (
        <div className="mt-2.5 pt-2 border-t border-brand-warm/60">
          <button
            onClick={() => setShowResponse(!showResponse)}
            className="text-[11px] text-brand-muted hover:text-brand-charcoal underline underline-offset-2"
          >
            {showResponse ? 'Hide response' : 'View full response'}
          </button>
          {showResponse && (
            <div className="mt-2 p-2.5 bg-white rounded-lg border border-brand-warm max-h-40 overflow-y-auto scrollbar-hide">
              <p className="text-[11px] text-brand-muted leading-relaxed whitespace-pre-wrap">
                {response}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PromptResultCard({ result, index }: { result: PromptResult; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const typeMeta = PROMPT_TYPE_META[result.type] || PROMPT_TYPE_META.informational

  // Collect all unique competitors across all providers for this prompt
  const allCompetitors = useMemo(() => {
    const set = new Set<string>()
    for (const provider of Object.keys(PROVIDER_META)) {
      const analysis = result.results?.[provider as keyof typeof result.results]?.analysis
      if (analysis?.competitors_mentioned) {
        analysis.competitors_mentioned.forEach((c: string) => set.add(c))
      }
    }
    return Array.from(set)
  }, [result])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="border border-brand-warm rounded-xl bg-white overflow-hidden"
    >
      {/* Prompt header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-brand-surface/50 transition-colors"
      >
        <span className="text-xs font-medium text-brand-muted mt-0.5 shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-brand-charcoal leading-relaxed line-clamp-2">{result.prompt}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border ${typeMeta.color}`}>
              {typeMeta.icon} {typeMeta.label}
            </span>
            {/* Inline score chips per provider */}
            {Object.entries(PROVIDER_META).map(([provider, meta]) => {
              const analysis = result.results?.[provider as keyof typeof result.results]?.analysis
              const score = analysis?.brand_visibility_score ?? null
              if (score === null) return null
              const scoreColor =
                score >= 70 ? 'text-emerald-600' :
                score >= 40 ? 'text-amber-600' :
                score > 0 ? 'text-red-500' :
                'text-brand-muted'
              return (
                <span key={provider} className="inline-flex items-center gap-1 text-[10px] font-semibold">
                  <span className={meta.color}>{meta.label}</span>
                  <span className={scoreColor}>{score}</span>
                </span>
              )
            })}
            {/* Show competitor count if any */}
            {allCompetitors.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-brand-muted">
                <Users className="w-3 h-3" /> {allCompetitors.length} competitor{allCompetitors.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-brand-muted shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-brand-muted shrink-0 mt-0.5" />}
      </button>

      {/* Expanded provider analysis cards — stacked vertically */}
      {expanded && (
        <div className="border-t border-brand-surface px-3.5 pb-3.5">
          <div className="space-y-2.5 mt-3">
            {Object.entries(PROVIDER_META).map(([provider]) => {
              const providerResult = result.results?.[provider as keyof typeof result.results]
              return (
                <ProviderAnalysisCard
                  key={provider}
                  provider={provider}
                  analysis={providerResult?.analysis ?? null}
                  response={providerResult?.response ?? ''}
                  error={providerResult?.error ?? null}
                />
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}

export function StepBrandResults({ results, isLoading, brandName, onDashboard, onRetry }: StepBrandResultsProps) {
  // Compute summary stats per provider
  const summaryByProvider = useMemo(() => {
    return Object.keys(PROVIDER_META).reduce((acc, provider) => {
      const scores: number[] = []
      let mentioned = 0
      let total = 0
      const allCompetitors = new Set<string>()

      for (const r of results) {
        const analysis = r.results?.[provider as keyof typeof r.results]?.analysis
        if (analysis) {
          scores.push(analysis.brand_visibility_score ?? 0)
          if (analysis.brand_mentioned) mentioned++
          total++
          if (analysis.competitors_mentioned) {
            analysis.competitors_mentioned.forEach((c: string) => allCompetitors.add(c))
          }
        }
      }

      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
      acc[provider] = { avgScore, mentioned, total, competitorCount: allCompetitors.size }
      return acc
    }, {} as Record<string, { avgScore: number; mentioned: number; total: number; competitorCount: number }>)
  }, [results])

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
            Sending your prompts to GPT, Gemini, and Claude and analyzing each response for brand mentions.
            This may take a minute...
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
      <div className="mb-4">
        <h2 className="text-xl font-bold text-brand-charcoal mb-1 tracking-tight">
          Brand Visibility Results
        </h2>
        <p className="text-brand-muted text-sm leading-relaxed">
          How <span className="font-medium text-brand-charcoal">{brandName}</span> appears across AI platforms. Tap any prompt to see analysis.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {Object.entries(PROVIDER_META).map(([provider, meta]) => {
          const stats = summaryByProvider[provider]
          const scoreColor =
            (stats?.avgScore ?? 0) >= 70 ? 'text-emerald-600' :
            (stats?.avgScore ?? 0) >= 40 ? 'text-amber-600' :
            (stats?.avgScore ?? 0) > 0 ? 'text-red-500' :
            'text-brand-muted'
          return (
            <div key={provider} className={`rounded-xl border ${meta.border} ${meta.bg} p-3`}>
              <div className={`text-[11px] font-bold ${meta.color} uppercase tracking-wide mb-1.5`}>{meta.label}</div>
              <div className={`text-2xl font-bold ${scoreColor}`}>{stats?.avgScore ?? 0}</div>
              <div className="text-[10px] text-brand-muted mt-1 space-y-0.5">
                <div>avg visibility score</div>
                <div>{stats?.mentioned ?? 0}/{stats?.total ?? 0} prompts mentioned</div>
                <div>{stats?.competitorCount ?? 0} unique competitors</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Prompt results list */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-2 pb-2">
        {results.map((result, index) => (
          <PromptResultCard key={index} result={result} index={index} />
        ))}
      </div>

      {/* Go to Dashboard button */}
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
