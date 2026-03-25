import { useState, useMemo } from 'react'
import { 
  Trophy, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Search, 
  BarChart3, 
  FileText,
  Activity,
  Info,
  Zap,
  Sword,
  Swords,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Star,
  Globe,
  Lock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatCard } from '@/components/ui/StatCard'
import { 
  type ModuleFMetricRecommendation, 
  ModuleFResult, 
  useGetModuleFResultQuery, 
  resolveFeatureFlags,
  normaliseMetricRec
} from '@/store/api/module_F/moduleFApi'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface CompetitorWinsLibraryProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
  jobId?: string | null
}

export default function CompetitorWinsLibrary({ moduleFData, isLoading, jobId }: CompetitorWinsLibraryProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'brand' | 'competitor'>('all')
  const [expandedPrompt, setExpandedPrompt] = useState<number | null>(null)

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

  const winsData = effectiveData?.competitor_wins
  const summary = winsData?.summary
  const detailedResults = winsData?.detailed_results || []
  const competitorBreakdown = winsData?.competitor_breakdown || []

  const brandName = effectiveData?.compare_visibility_against_competitors?.brand?.name || 'Brand'
  const flags = resolveFeatureFlags(effectiveData)

  const filteredResults = useMemo(() => detailedResults.filter(item => {
    const matchesSearch = item.prompt.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filter === 'all' 
      ? true 
      : filter === 'brand' 
        ? item.winner === 'brand' 
        : item.winner === 'competitor'
    return matchesSearch && matchesFilter
  }), [detailedResults, searchTerm, filter])

  if (!effectiveData && !isLoading && !isFetchingModuleF) {
    return (
      <AnalysisEmptyState
        icon={<Trophy className="w-8 h-8 text-zinc-400" />}
        title="No Competitor Wins Data"
        description="Run Module F from the Visibility Comparison tab to generate competitor win data and content gap insights."
      />
    )
  }

  const isActuallyLoading = isLoading || isFetchingModuleF

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Premium Header */}
      <div className="rounded-3xl border border-zinc-800 bg-[#111113] p-6 sm:p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 blur-[100px] -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 blur-[100px] -ml-32 -mb-32" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl group-hover:border-yellow-500/30 transition-colors">
              <Trophy className="w-8 h-8 text-yellow-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">Competitor Wins Library</h2>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">AEO Analysis</span>
                </div>
              </div>
              <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                Analyze prompts where competitors rank higher or appear more frequently. Identify content gaps and opportunities to improve your AI visibility and citation share.
              </p>
            </div>
          </div>
          
          {summary?.total_prompts && (
            <div className="flex flex-col items-end gap-1 bg-zinc-900/50 px-4 py-2 rounded-2xl border border-zinc-800">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Dataset</span>
              <span className="text-sm font-bold text-zinc-200">{summary.total_prompts} Prompts Tracked</span>
            </div>
          )}
        </div>
      </div>


      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Competitor Win Rate"
          value={`${summary?.competitor_win_rate ?? 0}%`}
          subtext={`${summary?.competitor_wins ?? 0} Prompts Lost`}
          icon={XCircle}
          accent="rose"
          progress={summary?.competitor_win_rate ?? 0}
          description={normaliseMetricRec(effectiveData?.metric_recommendations?.competitor_win_rate)?.why || "Percentage of prompts where competitors outperform your brand."}
        />
        
        <StatCard
          label="Brand Win Rate"
          value={`${summary?.brand_win_rate ?? 0}%`}
          subtext={`${summary?.brand_wins ?? 0} Prompts Won`}
          icon={Trophy}
          accent="amber"
          progress={summary?.brand_win_rate ?? 0}
          description={normaliseMetricRec(effectiveData?.metric_recommendations?.brand_win_rate)?.why || "Percentage of prompts where your brand outperforms competitors."}
        />

        <StatCard
          label="Content Gap Score"
          value={summary?.avg_content_gap_score ?? 0}
          subtext={`${summary?.brand_prompt_mentions ?? 0} Brand Mentions`}
          icon={FileText}
          accent="blue"
          progress={summary?.avg_content_gap_score ?? 0}
          description={normaliseMetricRec(effectiveData?.metric_recommendations?.content_gap_score)?.why || "Average gap in content completeness or entity coverage."}
        />

        <StatCard
          label="Market Share"
          value={`${effectiveData?.compare_visibility_against_competitors?.brand?.market_share_percent ?? 0}%`}
          subtext="Overall SOV Share"
          icon={Activity}
          accent="violet"
          progress={effectiveData?.compare_visibility_against_competitors?.brand?.market_share_percent ?? 0}
          description={normaliseMetricRec(effectiveData?.metric_recommendations?.market_share)?.why || "Your brand's share of voice across all analyzed prompts."}
        />
      </div>

      {competitorBreakdown.length > 0 && (
        <SectionCard 
          title="Competitor Win Breakdown" 
          description="Per-competitor wins and win percentage (competitor rank better than your brand)."
          className="bg-[#111113]"
        >
          <ScrollArea className="h-[400px] pr-4 -mr-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-4">
                {competitorBreakdown.map((row) => (
                <div key={row.competitor} className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/20 p-5 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900/40 overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-[40px] -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="relative flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700/50 group-hover:border-red-500/30 transition-colors">
                        <Sword className="w-5 h-5 text-zinc-400 group-hover:text-red-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-zinc-100 font-bold truncate text-base" title={row.competitor}>{row.competitor}</div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter mt-0.5">
                          Mentioned in {row.prompts_mentioned} / {summary?.total_prompts ?? 0} prompts
                        </div>
                      </div>
                    </div>
                    <Badge className={cn('px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider',
                      row.win_percent >= 60 ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      row.win_percent >= 30 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      'bg-zinc-800/50 text-zinc-400 border-zinc-700'
                    )}>
                      {row.win_percent}% Win Rate
                    </Badge>
                  </div>

                  <div className="relative h-2 w-full bg-zinc-800/50 rounded-full overflow-hidden mb-6 border border-zinc-800/50">
                    <div
                      className={cn('h-full rounded-full transition-all duration-1000 ease-out',
                        row.win_percent >= 60 ? 'bg-red-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' :
                        row.win_percent >= 30 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
                        'bg-zinc-600 shadow-[0_0_8px_rgba(113,113,122,0.4)]'
                      )}
                      style={{ width: `${Math.min(100, row.win_percent)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col items-center text-center">
                      <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Prompts Won</div>
                      <div className="text-lg font-bold text-zinc-200 font-mono">{row.prompts_won}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col items-center text-center">
                      <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Win %</div>
                      <div className="text-lg font-bold text-zinc-200 font-mono">{row.win_percent}%</div>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 flex flex-col items-center text-center">
                      <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Content Gap</div>
                      <div className="text-lg font-bold text-zinc-200 font-mono">{row.content_gap_score}%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SectionCard>
      )}

      {/* Detailed Analysis Section */}
      <SectionCard 
        title="Prompt Analysis Library" 
        description="Detailed breakdown of winner and ranking for each prompt analyzed by AI models."
        className="bg-[#111113]"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            {!flags.prompt_level_drilldown && (
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/25 text-[10px] font-bold uppercase">
                Pro Feature
              </Badge>
            )}
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              {filteredResults.length} Result{filteredResults.length !== 1 ? 's' : ''}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-blue-400 transition-colors" />
              <input 
                type="text" 
                placeholder="Search prompts..." 
                className="bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 w-full md:w-64 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-auto">
              <TabsList className="bg-zinc-900 border border-zinc-800 p-1 h-9">
                <TabsTrigger value="all" className="text-[10px] font-bold uppercase tracking-wider px-3 data-[state=active]:bg-zinc-800 data-[state=active]:text-white transition-all">All</TabsTrigger>
                <TabsTrigger value="brand" className="text-[10px] font-bold uppercase tracking-wider px-3 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 transition-all">My Wins</TabsTrigger>
                <TabsTrigger value="competitor" className="text-[10px] font-bold uppercase tracking-wider px-3 data-[state=active]:bg-red-500/10 data-[state=active]:text-red-400 transition-all">Losses</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {!flags.prompt_level_drilldown ? (
          <div className="text-center py-20 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
            <div className="w-20 h-20 rounded-3xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mx-auto mb-6 shadow-2xl">
              <Lock className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Prompt-Level Drilldown</h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto leading-relaxed mb-8">
              Upgrade to Agency or Enterprise to see per-prompt winner analysis, coverage gap scores, and ranking breakdowns.
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
                <Star className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Agency</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/5 border border-purple-500/10">
                <Zap className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Enterprise</span>
              </div>
            </div>
          </div>
        ) : isActuallyLoading ? (
           <div className="space-y-4">
             {[1, 2, 3].map((i) => (
               <div key={i} className="h-32 bg-zinc-900/50 rounded-2xl animate-pulse border border-zinc-800" />
             ))}
           </div>
        ) : filteredResults.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900/50 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-zinc-700" />
            </div>
            <h3 className="text-white font-bold mb-1">No prompts found</h3>
            <p className="text-zinc-500 text-sm">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredResults.map((result, idx) => {
              const isExpanded = expandedPrompt === idx
              const winColor = result.winner === 'brand' ? 'emerald' : result.winner === 'competitor' ? 'rose' : 'zinc'
              
              return (
                <div key={idx} className={cn(
                  "group relative bg-zinc-900/20 border border-zinc-800 rounded-2xl transition-all duration-300",
                  isExpanded ? "bg-zinc-900/40 border-zinc-700 shadow-2xl" : "hover:border-zinc-700 hover:bg-zinc-900/30"
                )}>
                  <div 
                    className="p-5 cursor-pointer"
                    onClick={() => setExpandedPrompt(isExpanded ? null : idx)}
                  >
                    <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-3">
                          <Badge 
                            className={cn(
                              "px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider",
                              result.winner === 'brand' 
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                : result.winner === 'competitor'
                                  ? "bg-rose-500/10 text-red-400 border-rose-500/20"
                                  : "bg-zinc-800/50 text-zinc-400 border-zinc-700"
                            )}
                          >
                            {result.winner === 'brand' ? (
                              <div className="flex items-center gap-1.5">
                                <Trophy className="w-3 h-3" /> Brand Win
                              </div>
                            ) : result.winner === 'competitor' ? (
                              <div className="flex items-center gap-1.5">
                                <Sword className="w-3 h-3" /> {result.winner_name} Win
                              </div>
                            ) : 'No Clear Winner'}
                          </Badge>
                          
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-[10px] font-bold text-zinc-500 uppercase">
                            <Activity className="w-3 h-3 text-blue-400" />
                            Gap: {result.coverage_gap_score}%
                          </div>
                        </div>

                        <h4 className="text-zinc-100 font-bold text-base mb-3 leading-snug group-hover:text-blue-400 transition-colors">
                          {result.prompt}
                        </h4>
                        
                        <div className="flex items-center gap-2 text-zinc-500 text-xs italic line-clamp-1">
                          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                          "{result.text_snippet}"
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-3 shrink-0 min-w-[200px] bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/50">
                        <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-2">
                          <span>Ranking Analysis</span>
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Target className="w-3.5 h-3.5 text-blue-400" />
                              <span className="text-xs font-bold text-zinc-300">Your Rank</span>
                            </div>
                            <span className={cn(
                              "font-mono font-bold text-sm",
                              result.brand_rank ? "text-emerald-400" : "text-zinc-600"
                            )}>
                              {result.brand_rank ? `#${result.brand_rank}` : 'UNRANKED'}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                              <span className="text-xs font-bold text-zinc-300">Winner</span>
                            </div>
                            <span className="text-xs font-bold text-zinc-400 font-mono truncate max-w-[100px]">
                              {result.winner === 'brand' ? 'YOU' : result.winner_name || 'NONE'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-5 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="pt-5 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest">
                            <Search className="w-3.5 h-3.5" /> Full Response Context
                          </div>
                          <div className="bg-zinc-950/60 rounded-xl p-4 border border-zinc-800 text-sm text-zinc-400 leading-relaxed font-light italic">
                            "{result.text_snippet}"
                          </div>
                          {result.intent_coverage && (
                             <div className="flex flex-wrap gap-2">
                               {result.intent_coverage.direct_answer && (
                                 <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-bold uppercase">Direct Answer</Badge>
                               )}
                               {result.intent_coverage.has_list && (
                                 <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] font-bold uppercase">List Format</Badge>
                               )}
                             </div>
                          )}
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest">
                            <BarChart3 className="w-3.5 h-3.5" /> Competitive Rankings
                          </div>
                          <div className="space-y-2">
                            {Object.entries(result.ranks ?? {})
                              .sort((a, b) => (a[1] || 99) - (b[1] || 99))
                              .map(([name, rank]) => {
                                const isBrand = normalizeKey(name) === normalizeKey(brandName)
                                return (
                                  <div key={name} className={cn(
                                    "flex items-center justify-between p-2.5 rounded-xl border transition-all",
                                    isBrand ? "bg-blue-500/5 border-blue-500/20 shadow-lg" : "bg-zinc-900/40 border-zinc-800/50"
                                  )}>
                                    <div className="flex items-center gap-2">
                                      <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        isBrand ? "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.4)]" : "bg-zinc-700"
                                      )} />
                                      <span className={cn(
                                        "text-xs font-bold truncate max-w-[150px]",
                                        isBrand ? "text-blue-400" : "text-zinc-400"
                                      )} title={name}>
                                        {name} {isBrand && '(You)'}
                                      </span>
                                    </div>
                                    <span className={cn(
                                      "text-xs font-bold font-mono",
                                      rank === 1 ? "text-yellow-500" : isBrand ? "text-blue-400" : "text-zinc-500"
                                    )}>
                                      #{rank}
                                    </span>
                                  </div>
                                )
                              })
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
