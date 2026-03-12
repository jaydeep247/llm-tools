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
          <div className="h-8 w-56 bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-96 bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[#111113] rounded-xl p-5 border border-zinc-800 animate-pulse h-32" />
          ))}
        </div>
        <div className="h-80 bg-[#111113] rounded-xl border border-zinc-800 animate-pulse" />
      </div>
    )
  }

  const hasData = sourceData.length > 0

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Globe className="w-6 h-6 text-purple-400" />
          </div>
          Competitor Cited URLs
        </h2>
        <p className="text-zinc-400 text-base max-w-3xl">
          Evaluate the authority and influence of domains cited by or associated with competitors in AI responses.
        </p>
      </div>

      <Card className="bg-[#111113] border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-zinc-100">Recommendations</CardTitle>
          <CardDescription className="text-zinc-400">
            Actions to improve your source authority and reduce competitor influence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="text-sm font-medium text-zinc-100 mb-2">Increase Authority</div>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-400">
                <li>Publish original data, benchmarks, or reports that others can cite.</li>
                <li>Get referenced by high-authority industry publications and directories.</li>
                <li>Use consistent brand naming (brand + domain) across pages and PR mentions.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="text-sm font-medium text-zinc-100 mb-2">Improve Diversity</div>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-400">
                <li>Target multiple source types: reports, reviews, communities, and documentation.</li>
                <li>Avoid relying on only 1–2 domains; spread citations across categories.</li>
                <li>Create linkable assets: templates, calculators, checklists, and tool pages.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="text-sm font-medium text-zinc-100 mb-2">Beat Competitors</div>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-400">
                <li>Open top competitor domains and replicate the content formats they get cited for.</li>
                <li>Cover comparison intent: alternatives pages, pricing explainers, and “best tools” lists.</li>
                <li>Update pages frequently so models and sources see fresh, accurate information.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {!hasData ? (
        <div className="bg-[#111113] rounded-xl p-6 border border-zinc-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-zinc-400 mt-0.5" />
            <div>
              <div className="text-zinc-100 font-medium">No source analysis data yet</div>
              <div className="text-zinc-500 text-sm mt-1">
                Run Module F to analyze competitor sources and citations.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#111113] rounded-xl p-5 border border-zinc-800 h-full flex flex-col hover:bg-[#0D0D10] transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-purple-500/20 text-purple-400">
                    <ShieldCheck className="w-5 h-5 text-zinc-100" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-zinc-100 block">Avg Influence Score</span>
                    <span className="text-xs text-zinc-400 block mt-0.5 leading-relaxed">Overall source quality</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-zinc-100 tracking-tight">{overall.avgInfluenceScore}</span>
                  <span className="text-sm text-zinc-500 font-medium mb-1">/100</span>
                </div>
              </div>
            </div>

            <div className="bg-[#111113] rounded-xl p-5 border border-zinc-800 h-full flex flex-col hover:bg-[#0D0D10] transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-blue-500/20 text-blue-400">
                    <Globe className="w-5 h-5 text-zinc-100" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-zinc-100 block">Avg Domain Authority</span>
                    <span className="text-xs text-zinc-400 block mt-0.5 leading-relaxed">Authority of cited sources</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-zinc-100 tracking-tight">{overall.avgDomainAuthority}</span>
                  <span className="text-sm text-zinc-500 font-medium mb-1">DA</span>
                </div>
              </div>
            </div>

            <div className="bg-[#111113] rounded-xl p-5 border border-zinc-800 h-full flex flex-col hover:bg-[#0D0D10] transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-emerald-500/20 text-emerald-400">
                    <Link2 className="w-5 h-5 text-zinc-100" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-zinc-100 block">Total Citations</span>
                    <span className="text-xs text-zinc-400 block mt-0.5 leading-relaxed">Sources identified</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-zinc-100 tracking-tight">{overall.totalCitations}</span>
                  <span className="text-sm text-zinc-500 font-medium mb-1">urls</span>
                </div>
              </div>
            </div>

            <div className="bg-[#111113] rounded-xl p-5 border border-zinc-800 h-full flex flex-col hover:bg-[#0D0D10] transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl shrink-0 bg-amber-500/20 text-amber-400">
                    <TrendingUp className="w-5 h-5 text-zinc-100" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-zinc-100 block">Top Performer</span>
                    <span className="text-xs text-zinc-400 block mt-0.5 leading-relaxed">Highest source quality</span>
                  </div>
                </div>
              </div>
              <div className="mt-auto">
                {overall.topCompetitor ? (
                  <div className="space-y-1">
                    <div className="text-lg font-semibold text-zinc-100">{overall.topCompetitor.competitor}</div>
                    <div className="text-sm text-zinc-500">Score: {overall.topCompetitor.score}/100</div>
                  </div>
                ) : (
                  <div className="text-zinc-500 text-sm">—</div>
                )}
              </div>
            </div>
          </div>

          <Card className="bg-[#111113] border-zinc-800">
            <CardHeader>
              <div className="flex flex-col gap-4">
                <div>
                  <CardTitle className="text-lg font-medium text-zinc-100">Source Domain Analysis</CardTitle>
                  <CardDescription className="text-zinc-400">
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
                            active ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-transparent border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                          )}
                        >
                          <span>{r.competitor}</span>
                          <span className="ml-2 text-zinc-500">{r.source_domain_influence_score}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="relative w-full lg:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search domains..."
                      className="bg-zinc-900/50 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 w-full"
                      value={searchDomain}
                      onChange={(e) => setSearchDomain(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {!activeRow ? (
                <div className="text-zinc-500 text-sm">No competitor data available.</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-zinc-100 font-medium">{activeRow.competitor}</div>
                        <div className="text-zinc-500 text-xs mt-1">
                          {activeRow.citation_count} cited sources found
                        </div>
                      </div>
                      <Badge className="bg-zinc-800 text-zinc-100 border-zinc-700 hover:bg-zinc-700">
                        Score {activeRow.source_domain_influence_score}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="rounded-lg border border-zinc-800 bg-[#111113] p-3">
                        <div className="text-[10px] text-zinc-500">Avg DA</div>
                        <div className="text-lg font-semibold text-zinc-100 mt-1">{activeRow.average_domain_authority}</div>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-[#111113] p-3">
                        <div className="text-[10px] text-zinc-500">Citations</div>
                        <div className="text-lg font-semibold text-zinc-100 mt-1">{activeRow.citation_count}</div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <ScrollArea className="h-[420px] pr-4">
                      <div className="space-y-3">
                        {filteredCitations.map((c, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 hover:bg-zinc-900 transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="min-w-0 flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-[#111113] border border-zinc-800 shrink-0">
                                    <Globe className="w-4 h-4 text-zinc-400" />
                                </div>
                                <div>
                                    <div className="text-zinc-100 font-medium text-sm break-words">{c.domain}</div>
                                    {c.citation_type && (
                                        <div className="text-zinc-500 text-xs mt-1 capitalize">
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
                            <div className="text-zinc-500 text-sm text-center py-8">
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
