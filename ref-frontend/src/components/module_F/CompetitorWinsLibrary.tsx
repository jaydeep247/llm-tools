'use client'

import { useState } from 'react'
import { 
  Trophy, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Search, 
  BarChart, 
  FileText,
  Activity
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ModuleFResult } from '@/store/api/module_F/moduleFApi'

// Score Card Component
interface ScoreCardProps {
  title: string
  score?: number | null
  value?: string | number | React.ReactNode
  icon: React.ReactNode
  color: string
  trend?: number
  subStats?: { label: string; value: string | number | React.ReactNode }[]
  error?: string
  isLoading?: boolean
  description?: string
  footer?: React.ReactNode
  suffix?: string
}

function ScoreCard({ title, score, value, icon, color, trend, subStats, error, isLoading, description, footer, suffix = '/100' }: ScoreCardProps) {
  const getScoreLabel = (s: number) => {
    if (s >= 80) return { text: 'Excellent', color: 'text-green-400 bg-green-500/10' }
    if (s >= 60) return { text: 'Good', color: 'text-yellow-400 bg-yellow-500/10' }
    if (s >= 40) return { text: 'Fair', color: 'text-orange-400 bg-orange-500/10' }
    return { text: 'Needs Work', color: 'text-red-400 bg-red-500/10' }
  }

  if (isLoading) {
    return (
      <div className="bg-[#111113] rounded-xl p-5 border border-zinc-800 animate-pulse h-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-800" />
          <div className="h-4 w-24 bg-zinc-800 rounded" />
        </div>
        <div className="h-12 w-20 bg-zinc-800 rounded mt-4" />
      </div>
    )
  }

  return (
    <div className="bg-[#111113] rounded-xl p-5 border border-zinc-800 hover:bg-[#0D0D10] transition-all duration-300 group h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className={cn("p-2.5 rounded-xl shrink-0", color)}>
            {icon}
          </div>
          <div>
            <span className="text-sm font-medium text-zinc-100 block">{title}</span>
            {description && <span className="text-xs text-zinc-400 block mt-0.5 leading-relaxed">{description}</span>}
          </div>
        </div>
        {score !== undefined && score !== null && !error && (
          <span className={cn(
            "text-xs px-2 py-1 rounded-full font-medium shrink-0 ml-2",
            getScoreLabel(score).color
          )}>
            {getScoreLabel(score).text}
          </span>
        )}
      </div>

      {/* Score/Value */}
      <div className="flex items-end justify-between mb-4">
        <div>
          {error ? (
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Error loading data</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-zinc-100 tracking-tight">
                {value ?? score ?? '-'}
              </span>
              {score !== undefined && score !== null && (
                <span className="text-sm text-zinc-500 font-medium mb-1">{suffix}</span>
              )}
            </div>
          )}
        </div>
        {trend !== undefined && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg mb-1",
            trend > 0 ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
          )}>
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>

      {/* Sub Stats */}
      {subStats && subStats.length > 0 && (
        <div className="mt-auto pt-4 border-t border-zinc-800 space-y-2">
          {subStats.map((stat, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">{stat.label}</span>
              <span className="text-zinc-300 font-medium">{stat.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {footer && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          {footer}
        </div>
      )}
    </div>
  )
}

interface CompetitorWinsLibraryProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
}

export default function CompetitorWinsLibrary({ moduleFData, isLoading }: CompetitorWinsLibraryProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'brand' | 'competitor'>('all')

  const winsData = moduleFData?.competitor_wins
  const summary = winsData?.summary
  const detailedResults = winsData?.detailed_results || []

  const brandName = moduleFData?.compare_visibility_against_competitors?.brand?.name || 'Brand'

  const filteredResults = detailedResults.filter(item => {
    const matchesSearch = item.prompt.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filter === 'all' 
      ? true 
      : filter === 'brand' 
        ? item.winner === 'brand' 
        : item.winner === 'competitor'
    return matchesSearch && matchesFilter
  })

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Section */}
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight flex items-center gap-3">
          <Trophy className="w-6 h-6 text-yellow-400" />
          Competitor Wins Library
        </h2>
        <p className="text-zinc-400 text-base max-w-3xl">
          Analyze prompts where competitors rank higher or appear more frequently. Identify content gaps and opportunities to improve your AI visibility.
        </p>
      </div>

      <Card className="bg-[#111113] border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-zinc-100">Recommendations</CardTitle>
          <CardDescription className="text-zinc-400">
            Actions to convert competitor wins into your wins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="text-sm font-medium text-zinc-100 mb-2">Win the Prompt</div>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-400">
                <li>Create a dedicated page for each high-value prompt with a direct, ranked answer.</li>
                <li>Add strong differentiators: pricing model, support, integrations, limits, and use-cases.</li>
                <li>Include an explicit “best for” section to match recommendation-style queries.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="text-sm font-medium text-zinc-100 mb-2">Close Content Gaps</div>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-400">
                <li>Expand missing entities: features, categories, locations, and industry terminology.</li>
                <li>Improve structure: headings, lists, FAQs, tables, and short summaries at the top.</li>
                <li>Add trust assets: case studies, testimonials, references, and compliance claims.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="text-sm font-medium text-zinc-100 mb-2">Defend Against Rivals</div>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-400">
                <li>Publish “alternatives” and “vs” pages for the top winner domains.</li>
                <li>Target citations: get your domain referenced by the sources models rely on.</li>
                <li>Re-run after changes to confirm the win-rate moves in your favor.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ScoreCard
          title="Competitor Win Rate"
          value={`${summary?.competitor_win_rate ?? 0}%`}
          icon={<Target className="w-5 h-5 text-zinc-100" />}
          color="bg-red-500/20 text-red-400"
          description="Percentage of prompts where competitors outperform your brand."
          isLoading={isLoading}
          subStats={[
            { label: 'Total Prompts Analyzed', value: summary?.total_prompts ?? 0 },
            { label: 'Competitor Wins', value: summary?.competitor_wins ?? 0 },
          ]}
        />
        
        <ScoreCard
          title="Brand Win Rate"
          value={`${summary?.brand_win_rate ?? 0}%`}
          icon={<Trophy className="w-5 h-5 text-zinc-100" />}
          color="bg-yellow-500/20 text-yellow-400"
          description="Percentage of prompts where your brand outperforms competitors."
          isLoading={isLoading}
          subStats={[
            { label: 'Brand Wins', value: summary?.brand_wins ?? 0 },
          ]}
        />

        <ScoreCard
          title="Content Gap Score"
          value={summary?.avg_content_gap_score ?? 0}
          suffix="/100"
          icon={<FileText className="w-5 h-5 text-zinc-100" />}
          color="bg-blue-500/20 text-blue-400"
          description="Average gap in content completeness or entity coverage."
          isLoading={isLoading}
          score={100 - (summary?.avg_content_gap_score ?? 0)} // Higher score is better (less gap)
        />

        <ScoreCard
          title="Market Share"
          value={`${moduleFData?.compare_visibility_against_competitors?.brand?.market_share_percent ?? 0}%`}
          icon={<Activity className="w-5 h-5 text-zinc-100" />}
          color="bg-purple-500/20 text-purple-400"
          description="Your brand's share of voice across all analyzed prompts."
          isLoading={isLoading}
        />
      </div>

      {/* Detailed Analysis Section */}
      <Card className="bg-[#111113] border-zinc-800">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-medium text-zinc-100">Prompt Analysis</CardTitle>
              <CardDescription className="text-zinc-400">
                Detailed breakdown of winner and ranking for each prompt.
              </CardDescription>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                  type="text" 
                  placeholder="Search prompts..." 
                  className="bg-zinc-900/50 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 w-full md:w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-auto">
                <TabsList className="bg-zinc-900/50 border border-zinc-800">
                  <TabsTrigger value="all" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400">All</TabsTrigger>
                  <TabsTrigger value="brand" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400">My Wins</TabsTrigger>
                  <TabsTrigger value="competitor" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400">Competitor Wins</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="space-y-4">
               {[1, 2, 3].map((i) => (
                 <div key={i} className="h-24 bg-zinc-900/50 rounded-xl animate-pulse" />
               ))}
             </div>
          ) : filteredResults.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-zinc-900/50 flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-zinc-500" />
              </div>
              <h3 className="text-zinc-100 font-medium mb-1">No prompts found</h3>
              <p className="text-zinc-500 text-sm">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredResults.map((result, idx) => (
                <div key={idx} className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 hover:bg-zinc-900 transition-colors">
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "border-0",
                            result.winner === 'brand' 
                              ? "bg-green-500/20 text-green-400" 
                              : result.winner === 'competitor'
                                ? "bg-red-500/20 text-red-400"
                                : "bg-zinc-800 text-zinc-400"
                          )}
                        >
                          {result.winner === 'brand' ? 'You Won' : result.winner === 'competitor' ? `${result.winner_name} Won` : 'No Winner'}
                        </Badge>
                        <span className="text-xs text-zinc-500 font-mono">
                          Gap Score: {result.coverage_gap_score}
                        </span>
                      </div>
                      <h4 className="text-zinc-100 font-medium mb-2 break-words">{result.prompt}</h4>
                      <p className="text-sm text-zinc-400 line-clamp-2 font-light italic">
                        "{result.text_snippet}"
                      </p>
                    </div>
                    
                    <div className="flex flex-col gap-2 shrink-0 min-w-[200px]">
                      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Rankings</div>
                      <div className="space-y-1.5">
                        {/* Brand Rank */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-zinc-300">Your Rank</span>
                          <span className={cn(
                            "font-mono font-medium",
                            result.brand_rank ? "text-green-400" : "text-zinc-600"
                          )}>
                            {result.brand_rank ? `#${result.brand_rank}` : '-'}
                          </span>
                        </div>
                        
                        {/* Competitor Ranks */}
                        {Object.entries(result.ranks ?? {})
                          .filter(([name]) => name !== brandName) 
                          .slice(0, 3) // Show top 3
                          .map(([name, rank]) => (
                            <div key={name} className="flex items-center justify-between text-sm">
                              <span className="text-zinc-400 truncate max-w-[120px]" title={name}>{name}</span>
                              <span className="text-zinc-400 font-mono">#{rank}</span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
