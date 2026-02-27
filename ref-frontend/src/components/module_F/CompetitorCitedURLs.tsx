'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, Globe, Link2, ShieldCheck, TrendingUp, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ModuleFResult } from '@/store/api/module_F/moduleFApi'

interface CompetitorCitedURLsProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

export default function CompetitorCitedURLs({ moduleFData, isLoading }: CompetitorCitedURLsProps) {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null)
  const [searchDomain, setSearchDomain] = useState('')

  const sourceData = moduleFData?.source_analysis?.competitor_source_analysis || []
  
  const overall = useMemo(() => {
    if (!sourceData.length) {
      return {
        avgInfluenceScore: 0,
        avgDomainAuthority: 0,
        totalCitations: 0,
        topCompetitor: null as { competitor: string; score: number } | null,
      }
    }

    const avgInfluenceScore = round1(sourceData.reduce((sum, r) => sum + r.source_domain_influence_score, 0) / sourceData.length)
    const avgDomainAuthority = round1(sourceData.reduce((sum, r) => sum + r.average_domain_authority, 0) / sourceData.length)
    const totalCitations = sourceData.reduce((sum, r) => sum + r.citation_count, 0)
    const top = [...sourceData].sort((a, b) => b.source_domain_influence_score - a.source_domain_influence_score)[0]

    return {
      avgInfluenceScore,
      avgDomainAuthority,
      totalCitations,
      topCompetitor: top ? { competitor: top.competitor, score: top.source_domain_influence_score } : null,
    }
  }, [sourceData])

  const activeCompetitor = selectedCompetitor || sourceData[0]?.competitor || null
  const activeRow = sourceData.find((r) => r.competitor === activeCompetitor) || null

  const filteredCitations = useMemo(() => {
    if (!activeRow) return []
    const needle = searchDomain.trim().toLowerCase()
    const base = activeRow.top_citations
    if (!needle) return base
    return base.filter((c) => c.domain.toLowerCase().includes(needle))
  }, [activeRow, searchDomain])

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

  const hasData = sourceData.length > 0

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-3">
          <Globe className="w-6 h-6 text-purple-400" />
          Competitor Cited URLs
        </h2>
        <p className="text-white/60 text-base max-w-3xl">
          Evaluate the authority and influence of domains cited by or associated with competitors in AI responses.
        </p>
      </div>

      {!hasData ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-white/60 mt-0.5" />
            <div>
              <div className="text-white font-medium">No source analysis data yet</div>
              <div className="text-white/50 text-sm mt-1">
                Run Module F to analyze competitor sources and citations.
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
                  <div className="p-2.5 rounded-xl shrink-0 bg-purple-500/20 text-purple-400">
                    <ShieldCheck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white/80 block">Avg Influence Score</span>
                    <span className="text-xs text-white/50 block mt-0.5 leading-relaxed">Overall source quality</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white tracking-tight">{overall.avgInfluenceScore}</span>
                  <span className="text-sm text-white/40 font-medium mb-1">/100</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 h-full flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-blue-500/20 text-blue-400">
                    <Globe className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white/80 block">Avg Domain Authority</span>
                    <span className="text-xs text-white/50 block mt-0.5 leading-relaxed">Authority of cited sources</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white tracking-tight">{overall.avgDomainAuthority}</span>
                  <span className="text-sm text-white/40 font-medium mb-1">DA</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 h-full flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-emerald-500/20 text-emerald-400">
                    <Link2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white/80 block">Total Citations</span>
                    <span className="text-xs text-white/50 block mt-0.5 leading-relaxed">Sources identified</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white tracking-tight">{overall.totalCitations}</span>
                  <span className="text-sm text-white/40 font-medium mb-1">urls</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 h-full flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-amber-500/20 text-amber-400">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white/80 block">Top Performer</span>
                    <span className="text-xs text-white/50 block mt-0.5 leading-relaxed">Highest source quality</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                {overall.topCompetitor ? (
                  <div className="space-y-1">
                    <div className="text-lg font-semibold text-white">{overall.topCompetitor.competitor}</div>
                    <div className="text-sm text-white/50">Score: {overall.topCompetitor.score}/100</div>
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
                  <CardTitle className="text-lg font-medium text-white">Source Domain Analysis</CardTitle>
                  <CardDescription className="text-white/40">
                    Select a competitor to view their top cited sources and domain authority.
                  </CardDescription>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                  <div className="flex flex-wrap gap-2">
                    {sourceData.map((r) => {
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
                          <span className="ml-2 text-white/40">{r.source_domain_influence_score}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="relative w-full lg:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      placeholder="Search domains..."
                      className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 w-full"
                      value={searchDomain}
                      onChange={(e) => setSearchDomain(e.target.value)}
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
                          {activeRow.citation_count} cited sources found
                        </div>
                      </div>
                      <Badge className="bg-white/10 text-white border-white/10">
                        Score {activeRow.source_domain_influence_score}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] text-white/50">Avg DA</div>
                        <div className="text-lg font-semibold text-white mt-1">{activeRow.average_domain_authority}</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] text-white/50">Citations</div>
                        <div className="text-lg font-semibold text-white mt-1">{activeRow.citation_count}</div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <ScrollArea className="h-[420px] pr-4">
                      <div className="space-y-3">
                        {filteredCitations.map((c, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="min-w-0 flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-white/5 border border-white/10 shrink-0">
                                    <Globe className="w-4 h-4 text-white/60" />
                                </div>
                                <div>
                                    <div className="text-white font-medium text-sm break-words">{c.domain}</div>
                                    {c.citation_type && (
                                        <div className="text-white/50 text-xs mt-1 capitalize">
                                            {c.citation_type.replace(/_/g, ' ')}
                                        </div>
                                    )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/30">
                                  DA {c.authority_score}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                        {filteredCitations.length === 0 && (
                            <div className="text-white/50 text-sm text-center py-8">
                                No matching sources found.
                            </div>
                        )}
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
