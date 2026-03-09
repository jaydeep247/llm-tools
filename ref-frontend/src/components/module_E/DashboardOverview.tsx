'use client'

import { type ReactNode } from 'react'
import { useGetModuleEResultQuery } from '@/store/api/module_E/moduleEApi'
import { StatCard, StatCardGrid } from '@/components/ui/StatCard'
import { SectionCard } from '@/components/ui/SectionCard'
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Users,
  BarChart3,
  LineChart,
  Award,
  Eye,
  MessageSquare,
  Target,
} from 'lucide-react'

interface DashboardOverviewProps {
  jobId?: string | null
  url?: string
  onNavigate?: (tab: string) => void
  /** Optional slot rendered directly after the Brand Analysis card */
  crawlStatusSlot?: ReactNode
}

/* ------------------------------------------------------------------ */
/*  Sentiment mini-badge                                              */
/* ------------------------------------------------------------------ */
function SentimentBadge({ label }: { label?: string }) {
  if (!label) return null
  const map: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    positive: { bg: 'bg-emerald-500/10 border border-emerald-500/20', text: 'text-emerald-400', icon: TrendingUp },
    negative: { bg: 'bg-rose-500/10 border border-rose-500/20', text: 'text-rose-400', icon: TrendingDown },
    neutral: { bg: 'bg-zinc-500/10 border border-zinc-500/20', text: 'text-zinc-400', icon: Minus },
  }
  const s = map[label.toLowerCase()] ?? map.neutral
  const SIcon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      <SIcon className="h-3 w-3" />
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export default function DashboardOverview({ jobId, url, onNavigate, crawlStatusSlot }: DashboardOverviewProps) {
  const { data: moduleEResponse, isLoading } = useGetModuleEResultQuery(jobId ?? '', {
    skip: !jobId,
    pollingInterval: 5000,
    refetchOnMountOrArgChange: true,
  })

  const d = moduleEResponse?.data

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
          <span className="text-sm text-zinc-500">Loading dashboard…</span>
        </div>
      </div>
    )
  }

  if (!d) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
          <Brain className="h-8 w-8 text-zinc-400" />
        </div>
        <p className="text-sm text-zinc-400 font-medium">No analysis data available yet</p>
        <p className="text-xs mt-1.5 text-zinc-600">Run a Quick Start analysis to populate the dashboard.</p>
      </div>
    )
  }

  /* ---- extract quick-start fields ---- */
  const brand = d.brand_analysis
  const competitors = d.competitor_mentions
  const sov = d.ai_share_of_voice
  const ranking = d.ranking_analysis

  const brandName = brand?.brand_name ?? '—'
  const totalMentions = brand?.total_mentions ?? 0
  const sentimentLabel = brand?.sentiment?.label
  const overallSov = sov?.overall_sov ?? 0
  const visibilityTier = sov?.visibility_tier ?? '—'
  const competitorCount = competitors?.data?.length ?? 0
  const avgRanking =
    ranking?.ranking_position_per_prompt && ranking.ranking_position_per_prompt.length > 0
      ? (
        ranking.ranking_position_per_prompt.reduce((sum, r) => sum + (r.position ?? 0), 0) /
        ranking.ranking_position_per_prompt.filter((r) => r.position != null).length
      ).toFixed(1)
      : '—'
  const citedCount =
    ranking?.ranking_position_per_prompt?.filter((r) => r.mention_status === 'Cited').length ?? 0
  const totalPrompts = ranking?.generated_prompts?.length ?? ranking?.ranking_position_per_prompt?.length ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-white">Dashboard</h2>
        <p className="text-xs sm:text-sm text-zinc-500 mt-1">
          Quick overview of AI visibility for{' '}
          <span className="text-zinc-300 font-medium">{brandName}</span>
          {url && (
            <>
              {' · '}
              <span className="text-zinc-400">{url}</span>
            </>
          )}
        </p>
      </div>

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Brand Mentions"
          value={totalMentions}
          subtext={sentimentLabel ? `Sentiment: ${sentimentLabel}` : undefined}
          icon={MessageSquare}
          accent="blue"
          onClick={() => onNavigate?.('prompt-difficulty')}
        />
        <StatCard
          label="AI Share of Voice"
          value={`${overallSov}%`}
          subtext={visibilityTier}
          icon={Eye}
          accent="cyan"
          onClick={() => onNavigate?.('share-of-voice')}
        />
        <StatCard
          label="Competitors Tracked"
          value={competitorCount}
          subtext={competitors?.overall_sov != null ? `Market SOV: ${competitors.overall_sov}%` : undefined}
          icon={Users}
          accent="amber"
          onClick={() => onNavigate?.('visibility-comparision')}
        />
        <StatCard
          label="Avg. Ranking"
          value={avgRanking}
          subtext={totalPrompts > 0 ? `${citedCount}/${totalPrompts} cited` : undefined}
          icon={Award}
          accent="emerald"
          onClick={() => onNavigate?.('trends-by-model')}
        />
      </div>

      {/* Detail sections — compact previews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Brand Analysis + AI Share of Voice (left column) */}
        <div className="flex flex-col gap-4">
          <SectionCard title="Brand Analysis" onClick={() => onNavigate?.('prompt-difficulty')} >
          {brand ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">Overall Sentiment</span>
                <SentimentBadge label={sentimentLabel} />
              </div>
              {brand.sentiment?.counts && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(['positive', 'negative', 'neutral'] as const).map((key) => (
                    <div key={key} className="rounded-xl bg-zinc-800/30 border border-zinc-800/60 py-2.5">
                      <p className="text-base font-semibold text-white">
                        {brand.sentiment?.counts?.[key] ?? 0}
                      </p>
                      <p className="text-[10px] text-zinc-500 capitalize">{key}</p>
                    </div>
                  ))}
                </div>
              )}
              {brand.top_sources && brand.top_sources.length > 0 && (
                <div>
                  <p className="text-[11px] text-zinc-500 mb-1.5">Top Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {brand.top_sources.slice(0, 5).map((src, i) => (
                      <span key={i} className="rounded-lg bg-zinc-800/40 border border-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-400">
                        {src.domain}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">Not yet available</p>
          )}
        </SectionCard>
          {/* AI Share of Voice preview — moved here from right column */}
          <SectionCard title="AI Share of Voice" onClick={() => onNavigate?.('share-of-voice')} >
            {sov ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-zinc-800/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                        style={{ width: `${Math.min(overallSov, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-white min-w-12 text-right">
                    {overallSov}%
                  </span>
                </div>
                {sov.brand_known_by_models && sov.brand_known_by_models.length > 0 && (
                  <div>
                    <p className="text-[11px] text-zinc-500 mb-1.5">Known by Models</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sov.brand_known_by_models.map((model, i) => (
                        <span key={i} className="rounded-lg bg-zinc-800 border border-zinc-700/50 px-2.5 py-0.5 text-[11px] text-zinc-300">
                          {model}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {sov.by_model && Object.keys(sov.by_model).length > 0 && (
                  <div className="space-y-1.5">
                    {Object.entries(sov.by_model).slice(0, 4).map(([model, data]) => (
                      <div key={model} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500 truncate mr-2">{model}</span>
                        <span className="text-zinc-300 font-medium">{data.sov}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Not yet available</p>
            )}
          </SectionCard>
        </div>

        {/* Background Crawl Banner (right column) — stretched to fill card height */}
        <div className="flex flex-col *:flex-1">
          {crawlStatusSlot}
        </div>

        {/* Competitor Mentions preview */}
        <SectionCard title="Competitor Landscape" onClick={() => onNavigate?.('prompt-difficulty')} >
          {competitors?.data && competitors.data.length > 0 ? (
            <div className="space-y-2">
              {competitors.data.slice(0, 5).map((comp, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-zinc-900/20 border border-zinc-800/60 px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[10px] font-mono font-medium text-zinc-600 w-4">{i + 1}</span>
                    <span className="text-sm text-zinc-300 truncate">{comp.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-zinc-500">{comp.mentions} mentions</span>
                    <SentimentBadge label={comp.sentiment} />
                  </div>
                </div>
              ))}
              {competitors.data.length > 5 && (
                <p className="text-[11px] text-zinc-600 text-center pt-1">
                  +{competitors.data.length - 5} more competitors
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">No competitor data yet</p>
          )}
        </SectionCard>

        {/* Ranking Analysis preview */}
        <SectionCard title="Trends by Model" onClick={() => onNavigate?.('trends-by-model')} >
          {ranking?.ranking_position_per_prompt && ranking.ranking_position_per_prompt.length > 0 ? (
            <div className="space-y-2">
              {ranking.ranking_position_per_prompt.slice(0, 4).map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-zinc-900/20 border border-zinc-800/60 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-xs text-zinc-300 truncate">{r.prompt}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">{r.model}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.mention_status === 'Cited'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : r.mention_status === 'Mentioned (No Link)'
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-zinc-500/10 text-zinc-400'
                        }`}
                    >
                      {r.mention_status ?? (r.position != null ? `#${r.position}` : '—')}
                    </span>
                  </div>
                </div>
              ))}
              {ranking.ranking_position_per_prompt.length > 4 && (
                <p className="text-[11px] text-zinc-600 text-center pt-1">
                  +{ranking.ranking_position_per_prompt.length - 4} more prompts
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-600">No ranking data yet</p>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
