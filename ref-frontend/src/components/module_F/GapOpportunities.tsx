'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, Target, TrendingUp, Radar, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ModuleFResult } from '@/store/api/module_F/moduleFApi'

interface GapOpportunitiesProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
}

type CompetitorGapRow = {
  competitor: string
  gapScore: number
  missingPrompts: number
  potentialGainPercent: number
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

function computeOpportunityScore(rank: number | null | undefined) {
  if (!rank || !Number.isFinite(rank) || rank <= 0) return 100
  if (rank > 10) return 100
  return clampNumber(((rank - 1) / 9) * 100, 0, 100)
}

export default function GapOpportunities({ moduleFData, isLoading }: GapOpportunitiesProps) {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null)
  const [searchPrompt, setSearchPrompt] = useState('')

  const brandName = moduleFData?.compare_visibility_against_competitors?.brand?.name || 'Brand'
  const detailedResults = moduleFData?.competitor_wins?.detailed_results || []
  const competitors = moduleFData?.compare_visibility_against_competitors?.competitors || []
  const totalPrompts = moduleFData?.competitor_wins?.summary?.total_prompts ?? detailedResults.length ?? 0

  const rows = useMemo((): CompetitorGapRow[] => {
    // 1. Prefer backend pre-calculated gap analysis
    if (moduleFData?.gap_opportunities && moduleFData.gap_opportunities.length > 0) {
      return moduleFData.gap_opportunities.map((g) => ({
        competitor: g.competitor,
        gapScore: g.gapScore,
        missingPrompts: g.missingPrompts,
        potentialGainPercent: g.potentialGainPercent,
        opportunities: g.opportunities,
      }))
    }

    // 2. Fallback: Compute client-side from detailed results
    const competitorNames = competitors.map((c) => c.name).filter(Boolean)
    if (!competitorNames.length) return []

    return competitorNames.map((name) => {
      const opportunities = detailedResults.map((r) => {
        const rank = (r.ranks as Record<string, number | null | undefined> | undefined)?.[name] ?? null
        const opportunityScore = computeOpportunityScore(rank)
        return {
          prompt: r.prompt,
          rank: rank && Number.isFinite(rank) ? rank : null,
          opportunityScore,
        }
      })

      const missingPrompts = opportunities.filter((o) => o.rank === null || o.rank > 10).length
      const gapScore =
        opportunities.length > 0
          ? round1(opportunities.reduce((sum, o) => sum + o.opportunityScore, 0) / opportunities.length)
          : 0
      const potentialGainPercent = totalPrompts > 0 ? round1((missingPrompts / totalPrompts) * 100) : 0

      const sortedOpportunities = [...opportunities].sort((a, b) => b.opportunityScore - a.opportunityScore)

      return {
        competitor: name,
        gapScore,
        missingPrompts,
        potentialGainPercent,
        opportunities: sortedOpportunities,
      }
    })
  }, [competitors, detailedResults, totalPrompts, moduleFData?.gap_opportunities])

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

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-2">
          <div className="h-8 w-56 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-96 bg-white/5 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 animate-pulse h-32" />
          ))}
        </div>
        <div className="h-80 bg-white/5 rounded-2xl border border-white/10 animate-pulse" />
      </div>
    )
  }

  const hasData = rows.length > 0 && totalPrompts > 0

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-3">
          <Radar className="w-6 h-6 text-cyan-400" />
          Gap Opportunities
        </h2>
        <p className="text-white/60 text-base max-w-3xl">
          Identify prompts where competitors are missing coverage or underperforming, and estimate how much visibility you can capture for {brandName}.
        </p>
      </div>

      {!hasData ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-white/60 mt-0.5" />
            <div>
              <div className="text-white font-medium">No gap data yet</div>
              <div className="text-white/50 text-sm mt-1">
                Run Module F so prompt rankings and competitor coverage can be analyzed.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 h-full flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-cyan-500/20 text-cyan-400">
                    <Target className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white/80 block">Gap Score</span>
                    <span className="text-xs text-white/50 block mt-0.5 leading-relaxed">Opportunity size across competitors</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white tracking-tight">{overall.overallGapScore}</span>
                  <span className="text-sm text-white/40 font-medium mb-1">/100</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 h-full flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-amber-500/20 text-amber-400">
                    <Radar className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white/80 block">Missing Prompts</span>
                    <span className="text-xs text-white/50 block mt-0.5 leading-relaxed">Competitor coverage gaps found</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white tracking-tight">{overall.totalMissingPrompts}</span>
                  <span className="text-sm text-white/40 font-medium mb-1">gaps</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 h-full flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-emerald-500/20 text-emerald-400">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white/80 block">Potential Gain</span>
                    <span className="text-xs text-white/50 block mt-0.5 leading-relaxed">Average coverage you can capture</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white tracking-tight">{overall.averagePotentialGainPercent}</span>
                  <span className="text-sm text-white/40 font-medium mb-1">%</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 h-full flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-purple-500/20 text-purple-400">
                    <Target className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white/80 block">Top Opportunity</span>
                    <span className="text-xs text-white/50 block mt-0.5 leading-relaxed">Largest competitor gap</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                {overall.topCompetitor ? (
                  <div className="space-y-1">
                    <div className="text-lg font-semibold text-white">{overall.topCompetitor.competitor}</div>
                    <div className="text-sm text-white/50">{overall.topCompetitor.gapScore}/100</div>
                  </div>
                ) : (
                  <div className="text-white/50 text-sm">—</div>
                )}
              </div>
            </div>
          </div>

          <Card className="bg-black/20 border-white/10 backdrop-blur-xl">
            <CardHeader>
              <div className="flex flex-col gap-4">
                <div>
                  <CardTitle className="text-lg font-medium text-white">Competitor Coverage Gaps</CardTitle>
                  <CardDescription className="text-white/40">
                    Select a competitor to see their biggest prompt-level gaps (rank missing or beyond top 10).
                  </CardDescription>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                  <div className="flex flex-wrap gap-2">
                    {rows.map((r) => {
                      const active = r.competitor === activeCompetitor
                      return (
                        <button
                          key={r.competitor}
                          onClick={() => setSelectedCompetitor(r.competitor)}
                          className={cn(
                            'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                            active ? 'bg-white/15 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
                          )}
                        >
                          <span>{r.competitor}</span>
                          <span className="ml-2 text-white/40">{r.gapScore}/100</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="relative w-full lg:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      placeholder="Search prompts..."
                      className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 w-full"
                      value={searchPrompt}
                      onChange={(e) => setSearchPrompt(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {!activeRow ? (
                <div className="text-white/50 text-sm">No competitor data available.</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-white font-medium">{activeRow.competitor}</div>
                        <div className="text-white/50 text-xs mt-1">
                          Missing in {activeRow.missingPrompts} / {totalPrompts} prompts
                        </div>
                      </div>
                      <Badge className="bg-white/10 text-white border-white/10">
                        Gap {activeRow.gapScore}/100
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] text-white/50">Missing Prompts</div>
                        <div className="text-lg font-semibold text-white mt-1">{activeRow.missingPrompts}</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] text-white/50">Potential Gain</div>
                        <div className="text-lg font-semibold text-white mt-1">{activeRow.potentialGainPercent}%</div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <ScrollArea className="h-[420px] pr-4">
                      <div className="space-y-3">
                        {filteredOpportunities.map((o) => {
                          const isMissing = o.rank === null || (o.rank ?? 0) > 10
                          return (
                            <div
                              key={o.prompt}
                              className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-white font-medium text-sm break-words">{o.prompt}</div>
                                  <div className="text-white/50 text-xs mt-1">
                                    {isMissing ? (
                                      <span>Competitor missing coverage</span>
                                    ) : (
                                      <span>Competitor rank: {o.rank}</span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge
                                    className={cn(
                                      'border',
                                      isMissing ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-white/10 text-white border-white/10'
                                    )}
                                  >
                                    Opportunity {round1(o.opportunityScore)}/100
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

