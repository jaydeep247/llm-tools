'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { 
  AlertCircle, 
  Globe, 
  Link2, 
  ShieldCheck, 
  TrendingUp, 
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
  BarChart3
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

interface CompetitorCitedURLsProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
  jobId?: string | null
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function formatPercentFromRatio(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (!Number.isFinite(value)) return '—'
  return `${round1(value * 100)}%`
}

export default function CompetitorCitedURLs({ moduleFData, isLoading, jobId }: CompetitorCitedURLsProps) {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null)
  const [searchDomain, setSearchDomain] = useState('')

  const { data: fetched, isLoading: isFetchingModuleF } = useGetModuleFResultQuery(jobId ?? '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const effectiveData: ModuleFResult | null | undefined = fetched?.data ?? moduleFData
  const flags = resolveFeatureFlags(effectiveData)

  const sourceData = effectiveData?.source_analysis?.competitor_source_analysis || []
  
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

  const hasData = sourceData.length > 0
  const sourceRec = normaliseMetricRec(effectiveData?.metric_recommendations?.source_influence)
  const domainAuthorityRec = normaliseMetricRec(effectiveData?.metric_recommendations?.avg_domain_authority)
  const citationsRec = normaliseMetricRec(effectiveData?.metric_recommendations?.total_citations)

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Premium Header */}
      <div className="rounded-3xl border border-zinc-800 bg-[#111113] p-6 sm:p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 blur-[100px] -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 blur-[100px] -ml-32 -mb-32" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl group-hover:border-purple-500/30 transition-colors">
              <Globe className="w-8 h-8 text-purple-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">Competitor Cited URLs</h2>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Source Analysis</span>
                </div>
              </div>
              <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                Evaluate the authority and influence of domains cited by or associated with competitors in AI responses. Track source diversity and credibility.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1 bg-zinc-900/50 px-4 py-2 rounded-2xl border border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tracking</span>
            <span className="text-sm font-bold text-zinc-200">{sourceData.length} Competitors</span>
          </div>
        </div>
      </div>

      {!flags.competitor_cited_urls ? (
        <div className="bg-[#111113] rounded-3xl border border-zinc-800 p-20 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent" />
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mx-auto mb-6 shadow-2xl">
              <Lock className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Source Authority Tracking</h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto leading-relaxed mb-8">
              Upgrade to Agency or Enterprise to unlock source analysis, domain authority tracking, and citation frequency data for your competitors.
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/5 border border-purple-500/10">
                <Shield className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Agency</span>
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
          icon={<Link2 className="w-8 h-8 text-zinc-400" />}
          title="No Source Analysis Data"
          description="Run Module F from the Visibility Comparison tab to generate source analysis data for competitors."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Avg Influence Score"
              value={overall.avgInfluenceScore}
              subtext="Overall source quality"
              icon={ShieldCheck}
              accent="violet"
              progress={overall.avgInfluenceScore}
              description={sourceRec?.why || "Overall quality and reliability of sources cited for competitors."}
            />

            <StatCard
              label="Avg Domain Authority"
              value={overall.avgDomainAuthority}
              subtext="Authority of cited sources"
              icon={Globe}
              accent="blue"
              progress={overall.avgDomainAuthority}
              description={domainAuthorityRec?.why || "Average Moz Domain Authority score of domains cited in AI results."}
            />

            <StatCard
              label="Total Citations"
              value={overall.totalCitations}
              subtext="Sources identified"
              icon={Link2}
              accent="emerald"
              description={citationsRec?.why || "Total number of unique URLs and domains cited across all analyzed prompts."}
            />

            <StatCard
              label="Top Performer"
              value={overall.topCompetitor?.competitor ?? '—'}
              subtext={`Score: ${overall.topCompetitor?.score ?? 0}/100`}
              icon={Trophy}
              accent="amber"
              progress={overall.topCompetitor?.score}
              description="Competitor with the highest quality and most authoritative citation profile."
            />
          </div>

          <SectionCard 
            title="Source Domain Analysis" 
            description="Deep dive into the domains and specific URLs cited by AI models for each competitor."
            className="bg-[#111113]"
          >
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Sidebar / Selector */}
              <div className="w-full lg:w-72 shrink-0 space-y-6">
                <div>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">Competitors</div>
                  <div className="flex flex-col gap-2">
                    {sourceData.map((row) => (
                      <button
                        key={row.competitor}
                        onClick={() => setSelectedCompetitor(row.competitor)}
                        className={cn(
                          "flex items-center justify-between px-4 py-3 rounded-2xl border transition-all duration-300 text-left group",
                          activeCompetitor === row.competitor 
                            ? "bg-purple-500/10 border-purple-500/30 text-white shadow-lg shadow-purple-500/5" 
                            : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/60"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "w-2 h-2 rounded-full shrink-0 transition-all",
                            activeCompetitor === row.competitor ? "bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.6)]" : "bg-zinc-700 group-hover:bg-zinc-500"
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
                      <BarChart3 className="w-3.5 h-3.5 text-purple-400" /> Performance
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Credibility Score</span>
                        <span className="text-sm font-bold font-mono text-zinc-200">{activeRow.credibility_score}/100</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Unique Domains</span>
                        <span className="text-sm font-bold font-mono text-zinc-200">{activeRow.unique_domains}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Source Diversity</span>
                        <span className="text-sm font-bold font-mono text-zinc-200">{round1((activeRow.source_diversity ?? 0) * 100)}%</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-zinc-800">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Top Domains</div>
                      <div className="space-y-2">
                        {(activeRow.citation_frequency ?? []).slice(0, 3).map((freq, i) => (
                          <div key={i} className="flex items-center justify-between bg-zinc-950/40 px-3 py-2 rounded-xl border border-zinc-800/50">
                            <span className="text-[11px] text-zinc-400 truncate max-w-[120px]" title={freq.domain}>{freq.domain}</span>
                            <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[9px] h-4">{freq.count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Main Content Area */}
              <div className="flex-1 min-w-0 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                      <Link2 className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white leading-tight">{activeCompetitor} Citations</h3>
                      <p className="text-xs text-zinc-500">Showing {filteredCitations.length} cited sources</p>
                    </div>
                  </div>

                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-purple-400 transition-colors" />
                    <input 
                      type="text" 
                      placeholder="Filter by domain..." 
                      className="bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 w-full md:w-64 transition-all"
                      value={searchDomain}
                      onChange={(e) => setSearchDomain(e.target.value)}
                    />
                  </div>
                </div>

                <ScrollArea className="h-[600px] pr-4 -mr-2">
                  <div className="space-y-3 pb-4">
                    {filteredCitations.map((citation, idx) => (
                      <div key={idx} className="group relative bg-zinc-900/20 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 hover:bg-zinc-900/40 transition-all duration-300">
                        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 group-hover:border-purple-500/30 transition-colors">
                              <Globe className="w-5 h-5 text-zinc-500 group-hover:text-purple-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold text-zinc-100 truncate">{citation.domain}</span>
                                <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] font-bold h-4">DA {citation.authority_score}</Badge>
                                {citation.content_type && (
                                  <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700 text-[9px] h-4 uppercase">{citation.content_type}</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono truncate hover:text-blue-400 transition-colors">
                                <Link2 className="w-3 h-3 shrink-0" />
                                <a href={citation.url || '#'} target="_blank" rel="noopener noreferrer" className="truncate underline underline-offset-4 decoration-zinc-800 group-hover:decoration-blue-500/30">
                                  {citation.url || citation.domain}
                                </a>
                                <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 bg-zinc-950/40 px-4 py-2 rounded-xl border border-zinc-800/50 w-full md:w-auto">
                            <div className="flex flex-col items-center border-r border-zinc-800 pr-4">
                              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">Frequency</span>
                              <span className="text-sm font-bold font-mono text-zinc-300">{activeRow?.citation_count ?? 0}x</span>
                            </div>
                            <div className="flex flex-col items-end flex-1 md:flex-none">
                              <Link 
                                href={`/dashboard/module_C/generate?url=${encodeURIComponent(citation.url || citation.domain)}`}
                                className="flex items-center gap-1.5 text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-wider group/link"
                              >
                                Create Competing Content
                                <ChevronRight className="w-3 h-3 group-hover/link:translate-x-1 transition-transform" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {filteredCitations.length === 0 && (
                      <div className="text-center py-20 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-900/50 flex items-center justify-center mx-auto mb-4">
                          <Search className="w-8 h-8 text-zinc-700" />
                        </div>
                        <h3 className="text-white font-bold mb-1">No domains found</h3>
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
