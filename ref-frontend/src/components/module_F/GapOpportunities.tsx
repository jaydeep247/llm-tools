'use client'

import { useMemo, useState } from 'react'
import { 
  AlertCircle, 
  Target, 
  TrendingUp, 
  Radar, 
  Search, 
  Info,
  Activity,
  Zap,
  Swords,
  Trophy,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Lock,
  Star,
  Shield,
  Layout,
  FileText,
  BarChart3,
  MousePointer2,
  Lightbulb
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatCard } from '@/components/ui/StatCard'
import { 
  type ModuleFMetricRecommendation, 
  useGetModuleFResultQuery, 
  resolveFeatureFlags,
  normaliseMetricRec
} from '@/store/api/module_F/moduleFApi'
import type { ModuleFResult } from '@/store/api/module_F/moduleFApi'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface GapOpportunitiesProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
  jobId?: string | null
}

type CompetitorGapRow = {
  competitor: string
  gapScore: number
  missingPrompts: number
  potentialGainPercent: number
  potentialGainMentions?: number
  opportunities: Array<{
    prompt: string
    rank: number | null
    opportunityScore: number
  }>
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number) {
  return Math.round(value * 10) / 10
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

function computeOpportunityScore(rank: number | null | undefined) {
  if (!rank || !Number.isFinite(rank) || rank <= 0) return 100
  if (rank > 10) return 100
  return clampNumber(((rank - 1) / 9) * 100, 0, 100)
}

export default function GapOpportunities({ moduleFData, isLoading, jobId }: GapOpportunitiesProps) {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null)
  const [searchPrompt, setSearchPrompt] = useState('')

  const normalizeKey = (value: string) => {
    return value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '')
  }

  const { data: fetched, isLoading: isFetchingModuleF } = useGetModuleFResultQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const effectiveData: ModuleFResult | null | undefined = fetched?.data ?? moduleFData
  const flags = resolveFeatureFlags(effectiveData)

  const brandName = effectiveData?.compare_visibility_against_competitors?.brand?.name || 'Brand'
  const detailedResults = effectiveData?.competitor_wins?.detailed_results || []
  const competitors = effectiveData?.compare_visibility_against_competitors?.competitors || []
  const totalPrompts = effectiveData?.competitor_wins?.summary?.total_prompts ?? detailedResults.length ?? 0

  const rows = useMemo((): CompetitorGapRow[] => {
    // 1. Prefer backend pre-calculated gap analysis
    if (effectiveData?.gap_opportunities && effectiveData.gap_opportunities.length > 0) {
      return (effectiveData.gap_opportunities as CompetitorGapRow[]).map((g) => ({
        competitor: g.competitor,
        gapScore: g.gapScore,
        missingPrompts: g.missingPrompts,
        potentialGainPercent: g.potentialGainPercent,
        potentialGainMentions: g.potentialGainMentions,
        opportunities: g.opportunities,
      }))
    }

    // 2. Fallback: Compute client-side from detailed results
    const competitorNames = competitors.map((c) => c.name).filter(Boolean)
    if (!competitorNames.length) return []

    return competitorNames.map((name) => {
      const normalized = normalizeKey(name)
      const opportunities = detailedResults.map((r) => {
        const ranks = (r.ranks as Record<string, number | null | undefined> | undefined) ?? {}
        const rank =
          ranks[name] ??
          ranks[normalized] ??
          (Object.entries(ranks).find(([k]) => normalizeKey(k) === normalized)?.[1] ?? null)
        const opportunityScore = computeOpportunityScore(rank)
        return {
          prompt: r.prompt,
          rank: rank && Number.isFinite(rank) ? rank : null,
          opportunityScore,
        }
      })

      const missingPrompts = opportunities.filter((o) => o.rank === null || o.rank > 3).length
      const gapScore =
        opportunities.length > 0
          ? round1(opportunities.reduce((sum, o) => sum + o.opportunityScore, 0) / opportunities.length)
          : 0
      const potentialGainPercent = gapScore

      const sortedOpportunities = [...opportunities].sort((a, b) => b.opportunityScore - a.opportunityScore)

      return {
        competitor: name,
        gapScore,
        missingPrompts,
        potentialGainPercent,
        potentialGainMentions: undefined,
        opportunities: sortedOpportunities,
      }
    })
  }, [competitors, detailedResults, totalPrompts, effectiveData?.gap_opportunities])

  const overall = useMemo(() => {
    if (!rows.length) {
      return {
        overallGapScore: 0,
        totalMissingPrompts: 0,
        averagePotentialGainPercent: 0,
        topCompetitor: null as { competitor: string; gapScore: number } | null,
      }
    }

    const overallGapScore = round1(rows.reduce((sum, r) => sum + r.gapScore, 0) / rows.length)
    const totalMissingPrompts = rows.reduce((sum, r) => sum + r.missingPrompts, 0)
    const averagePotentialGainPercent = round1(rows.reduce((sum, r) => sum + r.potentialGainPercent, 0) / rows.length)
    const top = [...rows].sort((a, b) => b.gapScore - a.gapScore)[0]

    return {
      overallGapScore,
      totalMissingPrompts,
      averagePotentialGainPercent,
      topCompetitor: top ? { competitor: top.competitor, gapScore: top.gapScore } : null,
    }
  }, [rows])

  const activeCompetitor = selectedCompetitor || rows[0]?.competitor || null
  const activeRow = rows.find((r) => r.competitor === activeCompetitor) || null

  const filteredOpportunities = useMemo(() => {
    if (!activeRow) return []
    const needle = searchPrompt.trim().toLowerCase()
    const base = activeRow.opportunities
    if (!needle) return base.slice(0, 50)
    return base.filter((o) => o.prompt.toLowerCase().includes(needle)).slice(0, 50)
  }, [activeRow, searchPrompt])

  if (isLoading || isFetchingModuleF) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="h-32 bg-[#111113] rounded-3xl border border-zinc-800 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[#111113] rounded-2xl p-5 border border-zinc-800 animate-pulse h-32" />
          ))}
        </div>
        <div className="h-96 bg-[#111113] rounded-2xl border border-zinc-800 animate-pulse" />
      </div>
    )
  }

  const hasData = rows.length > 0 && totalPrompts > 0
  const gapRec = normaliseMetricRec(effectiveData?.metric_recommendations?.content_gap_score)
  const missingRec = normaliseMetricRec(effectiveData?.metric_recommendations?.missing_prompts)
  const gainRec = normaliseMetricRec(effectiveData?.metric_recommendations?.potential_gain)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Premium Header */}
      <div className="rounded-3xl border border-zinc-800 bg-[#111113] p-6 sm:p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[100px] -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 blur-[100px] -ml-32 -mb-32" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl group-hover:border-cyan-500/30 transition-colors">
              <Radar className="w-8 h-8 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">Gap Opportunities</h2>
                {flags.gap_opportunities === 'limited' && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Limited View</span>
                  </div>
                )}
              </div>
              <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                Identify prompts where competitors are missing coverage or underperforming, and estimate how much visibility you can capture for <span className="text-white font-bold">{brandName}</span>.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1 bg-zinc-900/50 px-4 py-2 rounded-2xl border border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Prompts</span>
            <span className="text-sm font-bold text-zinc-200">{totalPrompts}</span>
          </div>
        </div>
      </div>

      {!flags.gap_opportunities ? (
        <div className="bg-[#111113] rounded-3xl border border-zinc-800 p-20 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent" />
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mx-auto mb-6 shadow-2xl">
              <Lock className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Prompt-Level Gap Analysis</h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto leading-relaxed mb-8">
              Upgrade to Agency or Enterprise to unlock prompt-level coverage gap analysis and competitor opportunity scoring.
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
                <Star className="w-4 h-4 text-cyan-500" />
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Agency</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Enterprise</span>
              </div>
            </div>
          </div>
        </div>
      ) : !hasData ? (
        <AnalysisEmptyState
          icon={<Target className="w-8 h-8 text-zinc-400" />}
          title="No Gap Data"
          description="Run Module F from the Visibility Comparison tab to generate prompt rankings and competitor coverage gaps."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Gap Score"
              value={overall.overallGapScore}
              subtext="Overall opportunity size"
              icon={Target}
              accent="cyan"
              progress={overall.overallGapScore}
              description={gapRec?.why || "Aggregated opportunity size based on competitor weaknesses across all prompts."}
            />

            <StatCard
              label="Missing Prompts"
              value={overall.totalMissingPrompts}
              subtext="Gaps found"
              icon={Radar}
              accent="amber"
              description={missingRec?.why || "Prompts where your brand is currently outside the top 3 results."}
            />

            <StatCard
              label="Potential Gain"
              value={`${overall.averagePotentialGainPercent}%`}
              subtext="Average capture rate"
              icon={TrendingUp}
              accent="emerald"
              progress={overall.averagePotentialGainPercent}
              description={gainRec?.why || "Estimated visibility share you can capture by addressing these content gaps."}
            />

            <StatCard
              label="Top Opportunity"
              value={overall.topCompetitor?.competitor ?? '—'}
              subtext={`Score: ${overall.topCompetitor?.gapScore ?? 0}/100`}
              icon={Trophy}
              accent="violet"
              progress={overall.topCompetitor?.gapScore}
              description="Competitor with the largest share of voice that is currently uncontested or weak."
            />
          </div>

          <SectionCard 
            title="Competitor Coverage Gaps" 
            description="Deep dive into specific prompts where competitors are missing coverage or ranking poorly."
            className="bg-[#111113]"
          >
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Sidebar / Selector */}
              <div className="w-full lg:w-72 shrink-0 space-y-6">
                <div>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">Competitors</div>
                  <div className="flex flex-col gap-2">
                    {rows.map((row) => (
                      <button
                        key={row.competitor}
                        onClick={() => setSelectedCompetitor(row.competitor)}
                        className={cn(
                          "flex items-center justify-between px-4 py-3 rounded-2xl border transition-all duration-300 text-left group",
                          activeCompetitor === row.competitor 
                            ? "bg-cyan-500/10 border-cyan-500/30 text-white shadow-lg shadow-cyan-500/5" 
                            : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/60"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "w-2 h-2 rounded-full shrink-0 transition-all",
                            activeCompetitor === row.competitor ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" : "bg-zinc-700 group-hover:bg-zinc-500"
                          )} />
                          <span className="font-bold truncate text-sm">{row.competitor}</span>
                        </div>
                        <ChevronRight className={cn(
                          "w-4 h-4 shrink-0 transition-transform",
                          activeCompetitor === row.competitor ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                        )} />
                      </button>
                    ))}
                  </div>
                </div>

                {activeRow && (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-5">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-3">
                      <BarChart3 className="w-3.5 h-3.5 text-cyan-400" /> Performance
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Gap Score</span>
                        <span className="text-sm font-bold font-mono text-zinc-200">{activeRow.gapScore}/100</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Missing Prompts</span>
                        <span className="text-sm font-bold font-mono text-zinc-200">{activeRow.missingPrompts}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Potential Gain</span>
                        <span className="text-sm font-bold font-mono text-zinc-200">{activeRow.potentialGainPercent}%</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-zinc-800 space-y-3">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Opportunity Summary</div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Addressing these <span className="text-zinc-300 font-bold">{activeRow.missingPrompts}</span> gaps could improve <span className="text-zinc-300 font-bold">{brandName}'s</span> visibility by up to <span className="text-emerald-400 font-bold">{activeRow.potentialGainPercent}%</span> for this competitor's share.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Main Content Area */}
              <div className="flex-1 min-w-0 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                      <Target className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white leading-tight">{activeCompetitor} Coverage Gaps</h3>
                      <p className="text-xs text-zinc-500">Showing top {filteredOpportunities.length} opportunities</p>
                    </div>
                  </div>

                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-cyan-400 transition-colors" />
                    <input 
                      type="text" 
                      placeholder="Filter prompts..." 
                      className="bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 w-full md:w-64 transition-all"
                      value={searchPrompt}
                      onChange={(e) => setSearchPrompt(e.target.value)}
                    />
                  </div>
                </div>

                <ScrollArea className="h-[600px] pr-4 -mr-2">
                  <div className="space-y-3 pb-4">
                    {filteredOpportunities.map((o, idx) => {
                      const isMissing = o.rank === null || (o.rank ?? 0) > 3
                      return (
                        <div key={idx} className="group relative bg-zinc-900/20 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 hover:bg-zinc-900/40 transition-all duration-300">
                          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-3">
                                <Badge className={cn(
                                  "px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider",
                                  isMissing ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-zinc-800 text-zinc-400 border-zinc-700"
                                )}>
                                  {isMissing ? "High Priority Gap" : "Moderate Opportunity"}
                                </Badge>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-950/40 border border-zinc-800/50 text-[10px] font-bold text-zinc-500 uppercase">
                                  <MousePointer2 className="w-3 h-3 text-cyan-400" />
                                  Score: {round1(o.opportunityScore)}
                                </div>
                              </div>
                              
                              <h4 className="text-zinc-100 font-bold text-base mb-3 leading-snug group-hover:text-cyan-400 transition-colors">
                                {o.prompt}
                              </h4>

                              <div className="flex items-center gap-4">
                                <div className="flex-1 max-w-xs space-y-1.5">
                                  <div className="flex justify-between text-[10px] font-bold text-zinc-600 uppercase tracking-tighter">
                                    <span>Opportunity Strength</span>
                                    <span>{round1(o.opportunityScore)}%</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-zinc-800/50 rounded-full overflow-hidden border border-zinc-800/50">
                                    <div
                                      className={cn('h-full rounded-full transition-all duration-1000 ease-out',
                                        o.opportunityScore >= 80 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
                                        o.opportunityScore >= 50 ? 'bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.4)]' :
                                        'bg-zinc-600 shadow-[0_0_8px_rgba(113,113,122,0.4)]'
                                      )}
                                      style={{ width: `${Math.min(100, o.opportunityScore)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 shrink-0 bg-zinc-950/40 px-5 py-3 rounded-2xl border border-zinc-800/50 w-full md:w-auto">
                              <div className="flex flex-col items-center border-r border-zinc-800 pr-5">
                                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">Comp. Rank</span>
                                <span className={cn(
                                  "text-lg font-bold font-mono",
                                  isMissing ? "text-amber-400" : "text-zinc-400"
                                )}>
                                  {o.rank ? `#${o.rank}` : 'N/A'}
                                </span>
                              </div>
                              <div className="flex flex-col items-end flex-1 md:flex-none">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                                  <Lightbulb className="w-3 h-3" /> Action
                                </div>
                                <span className="text-xs text-zinc-400 text-right font-medium">Create Targeting Content</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {filteredOpportunities.length === 0 && (
                      <div className="text-center py-20 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-900/50 flex items-center justify-center mx-auto mb-4">
                          <Search className="w-8 h-8 text-zinc-700" />
                        </div>
                        <h3 className="text-white font-bold mb-1">No prompts found</h3>
                        <p className="text-zinc-500 text-sm">Try adjusting your search filter.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  )
}

