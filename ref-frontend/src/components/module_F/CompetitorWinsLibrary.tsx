import { useState, useMemo, useRef, useEffect, type FormEvent } from 'react'
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
  ChevronLeft,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Star,
  Globe,
  Lock,
  BookOpen,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatCard } from '@/components/ui/StatCard'
import { 
  ModuleFResult, 
  ModuleFTopicWin,
  useGetModuleFResultQuery, 
  useAskModuleFAIMutation,
  resolveFeatureFlags,
  normaliseMetricRec,
  resolveRecommendations,
} from '@/store/api/module_F/moduleFApi'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleFAskAiChatShell } from '@/components/module_F/ModuleFAskAiChatShell'

interface CompetitorWinsLibraryProps {
  moduleFData?: ModuleFResult | null
  isLoading: boolean
  jobId?: string | null
}

type ChatTurn = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

function chatMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Scoped Ask AI targets — each maps to a programmatic prompt (no free-text step). */
type MetricAskTarget =
  | 'competitor_win_rate'
  | 'brand_win_rate'
  | 'content_gap_score'
  | 'market_share'
  | 'competitor_win_breakdown'
  | 'prompt_analysis_library'

function metricRecSnapshot(
  data: ModuleFResult | null | undefined,
  key: 'competitor_win_rate' | 'brand_win_rate' | 'content_gap_score' | 'market_share',
) {
  const v = resolveRecommendations(data)[key]
  const n = normaliseMetricRec(v)
  return n ? { why: n.why, fix: n.fix } : null
}

function buildMetricAskPrompt(
  target: MetricAskTarget,
  data: ModuleFResult | null | undefined,
  brandName: string,
): string {
  const wins = data?.competitor_wins
  const summary = wins?.summary
  const cw = data?.compare_visibility_against_competitors
  const brand = cw?.brand
  const breakdown = (wins?.competitor_breakdown ?? []).slice(0, 12)
  const detailed = wins?.detailed_results ?? []
  const samplePrompts = detailed.slice(0, 6).map((r) => ({
    prompt: r.prompt?.slice(0, 160),
    winner: r.winner,
    winner_name: r.winner_name,
    coverage_gap_score: r.coverage_gap_score,
    brand_rank: r.brand_rank,
  }))

  const base = `You are answering from the user's latest Module F "Competitor Wins Library" run for brand "${brandName}".
Answer immediately — do not ask the user for clarification. Focus ONLY on the metric/section named in the title below.
Use the glossary in PROJECT DATA. Use markdown with short headings and bullets where helpful.`

  switch (target) {
    case 'competitor_win_rate':
      return `${base}

**Title: Competitor Win Rate**

Explain what this metric means and interpret these values from our stored summary (JSON). Say whether the situation is concerning and one concrete next step if relevant.
${JSON.stringify({
        competitor_win_rate: summary?.competitor_win_rate,
        competitor_wins: summary?.competitor_wins,
        total_prompts: summary?.total_prompts,
        brand_wins: summary?.brand_wins,
        recommendation: metricRecSnapshot(data, 'competitor_win_rate'),
      })}`
    case 'brand_win_rate':
      return `${base}

**Title: Brand Win Rate**

Explain what this metric means and interpret these values (JSON). Note strengths and one improvement angle if relevant.
${JSON.stringify({
        brand_win_rate: summary?.brand_win_rate,
        brand_wins: summary?.brand_wins,
        total_prompts: summary?.total_prompts,
        competitor_win_rate: summary?.competitor_win_rate,
        recommendation: metricRecSnapshot(data, 'brand_win_rate'),
      })}`
    case 'content_gap_score':
      return `${base}

**Title: Content Gap Score**

Explain how average content/coverage gap is measured in this library and interpret these values (JSON).
${JSON.stringify({
        avg_content_gap_score: summary?.avg_content_gap_score,
        brand_prompt_mentions: summary?.brand_prompt_mentions,
        total_prompts: summary?.total_prompts,
        recommendation: metricRecSnapshot(data, 'content_gap_score'),
      })}`
    case 'market_share':
      return `${base}

**Title: Market Share (citation / SOV share)**

Explain what "market share" represents in this Module F visibility comparison and interpret the brand row (JSON). Compare briefly to top competitors if present in PROJECT DATA.
${JSON.stringify({
        brand_name: brand?.name ?? brandName,
        market_share_percent: brand?.market_share_percent,
        visibility_score: brand?.visibility_score,
        mentions_total: brand?.mentions_total,
        top_competitors: (cw?.competitors ?? []).slice(0, 4).map((c) => ({
          name: c.name,
          market_share_percent: c.market_share_percent,
        })),
        recommendation: metricRecSnapshot(data, 'market_share'),
      })}`
    case 'competitor_win_breakdown':
      return `${base}

**Title: Competitor Win Breakdown**

Summarize how each competitor is performing in this table: who wins most prompts, typical content gap %, and which domains to watch first. Use only the JSON below plus PROJECT DATA.
${JSON.stringify({
        total_prompts: summary?.total_prompts,
        rows: breakdown,
      })}`
    case 'prompt_analysis_library':
      return `${base}

**Title: Prompt Analysis Library**

Explain how to read per-prompt winner, coverage gap, and rankings in this library. Then interpret the current sample of prompts (JSON) — patterns of losses vs wins, not every row.
${JSON.stringify({
        total_prompts: summary?.total_prompts,
        filtered_count_sample: detailed.length,
        sample: samplePrompts,
      })}`
  }
}

function MetricAskButton({
  disabled,
  onClick,
}: {
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onClick()
      }}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ borderColor: 'var(--nd-purple)', background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' }}
    >
      <MessageSquare className="size-3 shrink-0" aria-hidden />
      Ask AI
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TopicGrid — shown when topic_wins is present and no topic is selected
// ─────────────────────────────────────────────────────────────────────────────

interface TopicGridProps {
  topicWins: ModuleFTopicWin[]
  brandName: string
  onSelectTopic: (topic: string) => void
}

function TopicGrid({ topicWins, brandName: _brandName, onSelectTopic }: TopicGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {topicWins.map((tw) => {
        const total = tw.results.length
        const brandWins = tw.results.filter(r => r.winner === 'brand').length
        const winRate = total > 0 ? Math.round((brandWins / total) * 100) : 0
        const winColor = winRate >= 60 ? 'emerald' : winRate >= 40 ? 'amber' : 'rose'

        return (
          <button
            key={tw.topic}
            type="button"
            onClick={() => onSelectTopic(tw.topic)}
            className="group text-left flex flex-col gap-4 p-5 rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-md"
            style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl border flex items-center justify-center shrink-0" style={{ borderColor: 'var(--nd-purple)', background: 'var(--nd-purple-subtle)' }}>
                  <BookOpen className="w-4 h-4" style={{ color: 'var(--nd-purple)' }} />
                </div>
                <h4 className="text-sm font-bold leading-snug line-clamp-2" style={{ color: 'var(--nd-text-primary)' }}>
                  {tw.topic}
                </h4>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--nd-text-muted)' }} />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--nd-text-muted)' }}>
                <Layers className="w-3 h-3" />
                {total} analyzed
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--nd-text-muted)' }}>
                <Target className="w-3 h-3" />
                {tw.prompts_total} total
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span style={{ color: 'var(--nd-text-muted)' }}>Brand Win Rate</span>
                <span className={cn(
                  winColor === 'emerald' ? 'text-emerald-600' :
                  winColor === 'amber' ? 'text-amber-600' : 'text-orange-600'
                )}>{winRate}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    winColor === 'emerald' ? 'bg-emerald-600' :
                    winColor === 'amber' ? 'bg-amber-600' : 'bg-orange-400'
                  )}
                  style={{ width: `${winRate}%` }}
                />
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PromptResultList — renders the expandable prompt rows for both flat and
// topic-filtered views
// ─────────────────────────────────────────────────────────────────────────────

interface PromptResultItem {
  prompt: string
  topic?: string
  winner: 'brand' | 'competitor' | 'none' | 'unknown'
  winner_name?: string | null
  brand_rank?: number | null
  ranks: Record<string, number>
  text_snippet: string
  coverage_gap_score: number
  intent_coverage?: {
    intent_coverage_score?: number
    has_list?: boolean
    direct_answer?: boolean
  }
}

interface PromptResultListProps {
  results: PromptResultItem[]
  brandName: string
  expandedPrompt: number | null
  onToggleExpand: (idx: number) => void
  normalizeKey: (v: string) => string
}

function PromptResultList({
  results,
  brandName,
  expandedPrompt,
  onToggleExpand,
  normalizeKey,
}: PromptResultListProps) {
  return (
    <div className="space-y-3">
      {results.map((result, idx) => {
        const isExpanded = expandedPrompt === idx
        return (
          <div key={idx} className="border rounded-xl transition-all duration-200" style={{
            borderColor: isExpanded ? 'var(--nd-purple)' : 'var(--nd-border)',
            background: 'var(--nd-card-bg)',
          }}>
            <div className="p-4 cursor-pointer" onClick={() => onToggleExpand(idx)}>
              <div className="flex flex-col md:flex-row gap-4 justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-3">
                    <Badge className={cn(
                      'px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider',
                      result.winner === 'brand'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : result.winner === 'competitor'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                    )}>
                      {result.winner === 'brand' ? (
                        <div className="flex items-center gap-1.5"><Trophy className="w-3 h-3" /> Brand Win</div>
                      ) : result.winner === 'competitor' ? (
                        <div className="flex items-center gap-1.5"><Sword className="w-3 h-3" /> {result.winner_name} Win</div>
                      ) : 'No Clear Winner'}
                    </Badge>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)', color: 'var(--nd-text-muted)' }}>
                      <Activity className="w-3 h-3" style={{ color: 'var(--nd-blue)' }} />
                      Gap: {result.coverage_gap_score}%
                    </div>
                  </div>
                  <h4 className="font-bold text-base mb-2 leading-snug" style={{ color: 'var(--nd-text-primary)' }}>
                    {result.prompt}
                  </h4>
                  <div className="flex items-center gap-2 text-xs italic line-clamp-1" style={{ color: 'var(--nd-text-muted)' }}>
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    "{result.text_snippet}"
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0 min-w-44 border p-3 rounded-xl" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest border-b pb-2" style={{ color: 'var(--nd-text-muted)', borderColor: 'var(--nd-border)' }}>
                    <span>Ranking Analysis</span>
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="w-3.5 h-3.5" style={{ color: 'var(--nd-blue)' }} />
                        <span className="text-xs font-bold" style={{ color: 'var(--nd-text-secondary)' }}>Your Rank</span>
                      </div>
                      <span className={cn('font-mono font-bold text-sm', result.brand_rank ? 'text-emerald-600' : '')} style={!result.brand_rank ? { color: 'var(--nd-text-muted)' } : {}}>
                        {result.brand_rank ? `#${result.brand_rank}` : 'UNRANKED'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-xs font-bold" style={{ color: 'var(--nd-text-secondary)' }}>Winner</span>
                      </div>
                      <span className="text-xs font-bold font-mono truncate max-w-25" style={{ color: 'var(--nd-text-secondary)' }}>
                        {result.winner === 'brand' ? 'YOU' : result.winner_name || 'NONE'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="px-4 pb-4">
                <div className="pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-6" style={{ borderColor: 'var(--nd-border)' }}>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>
                      <Search className="w-3.5 h-3.5" /> Full Response Context
                    </div>
                    <div className="rounded-xl p-4 border text-sm leading-relaxed font-light italic" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)', color: 'var(--nd-text-secondary)' }}>
                      "{result.text_snippet}"
                    </div>
                    {result.intent_coverage && (
                      <div className="flex flex-wrap gap-2">
                        {result.intent_coverage.direct_answer && (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-bold uppercase">Direct Answer</Badge>
                        )}
                        {result.intent_coverage.has_list && (
                          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] font-bold uppercase">List Format</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>
                      <BarChart3 className="w-3.5 h-3.5" /> Competitive Rankings
                    </div>
                    <div className="space-y-2">
                      {Object.entries(result.ranks ?? {})
                        .sort((a, b) => (a[1] || 99) - (b[1] || 99))
                        .map(([name, rank]) => {
                          const isBrand = normalizeKey(name) === normalizeKey(brandName)
                          return (
                            <div key={name} className="flex items-center justify-between p-2.5 rounded-xl border transition-all" style={{
                              borderColor: isBrand ? 'var(--nd-blue)' : 'var(--nd-border)',
                              background: isBrand ? '#EFF6FF' : 'var(--nd-bg)',
                            }}>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ background: isBrand ? 'var(--nd-blue)' : 'var(--nd-border)' }} />
                                <span className="text-xs font-bold truncate max-w-37.5" style={{ color: isBrand ? 'var(--nd-blue)' : 'var(--nd-text-secondary)' }} title={name}>
                                  {name} {isBrand && '(You)'}
                                </span>
                              </div>
                              <span className="text-xs font-bold font-mono" style={{ color: rank === 1 ? '#d97706' : isBrand ? 'var(--nd-blue)' : 'var(--nd-text-muted)' }}>
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
  )
}

export default function CompetitorWinsLibrary({ moduleFData, isLoading, jobId }: CompetitorWinsLibraryProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'brand' | 'competitor'>('all')
  const [expandedPrompt, setExpandedPrompt] = useState<number | null>(null)
  /** null = topic grid, string = topic detail view */
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const { toast } = useToast()

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
  const [askModuleFAI, { isLoading: isAskingAI, error: askAIError, reset: resetAskAI }] =
    useAskModuleFAIMutation()

  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatTurn[]>([])
  const [chatFocusBadge, setChatFocusBadge] = useState<string | undefined>(undefined)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!askDialogOpen || !chatScrollRef.current) return
    const el = chatScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [askDialogOpen, chatMessages, isAskingAI])

  const filteredResults = useMemo(() => {
    const base = selectedTopic
      ? detailedResults.filter(item => item.topic === selectedTopic)
      : detailedResults
    return base.filter(item => {
      const matchesSearch = item.prompt.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesFilter = filter === 'all'
        ? true
        : filter === 'brand'
          ? item.winner === 'brand'
          : item.winner === 'competitor'
      return matchesSearch && matchesFilter
    })
  }, [detailedResults, searchTerm, filter, selectedTopic])

  /** topic_wins from the result — present for runs after brand_prompts integration */
  const topicWins: ModuleFTopicWin[] = useMemo(
    () => (effectiveData?.topic_wins ?? []).filter(tw => tw.results.length > 0),
    [effectiveData]
  )
  const hasTopicWins = topicWins.length > 0

  if (!effectiveData && !isLoading && !isFetchingModuleF) {
    return (
      <AnalysisEmptyState
        icon={<Trophy className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />}
        title="No Competitor Wins Data"
        description="Run Module F from the Visibility Comparison tab to generate competitor win data and content gap insights."
      />
    )
  }

  const isActuallyLoading = isLoading || isFetchingModuleF

  const openAskAiDialog = () => {
    if (!jobId) {
      toast({
        title: 'Job not ready yet',
        description: 'Run Module F first so Ask AI can use your stored analysis.',
        variant: 'destructive',
      })
      return
    }
    resetAskAI()
    setChatFocusBadge(undefined)
    setChatMessages([])
    setChatInput('')
    setAskDialogOpen(true)
  }

  const runMetricAskAi = async (target: MetricAskTarget, displayLabel: string) => {
    if (!jobId) {
      toast({
        title: 'Job not ready yet',
        description: 'Run Module F first so Ask AI can use your stored analysis.',
        variant: 'destructive',
      })
      return
    }
    resetAskAI()
    setChatFocusBadge(displayLabel)
    setChatInput('')
    const userDisplay = `Explain: ${displayLabel}`
    const userTurn: ChatTurn = { id: chatMessageId(), role: 'user', content: userDisplay }
    setChatMessages([userTurn])
    setAskDialogOpen(true)

    const fullPrompt = buildMetricAskPrompt(target, effectiveData, brandName)

    try {
      const res = await askModuleFAI({
        jobId,
        body: { question: fullPrompt },
      }).unwrap()
      const text = res?.data?.answer?.trim() ?? ''
      const sources = res?.data?.sources
      if (!text) {
        toast({
          title: 'Empty response',
          description: 'The model returned no text. Try again.',
          variant: 'destructive',
        })
        setChatMessages([])
        setAskDialogOpen(false)
        return
      }
      setChatMessages((prev) => [
        ...prev,
        { id: chatMessageId(), role: 'assistant', content: text, sources },
      ])
    } catch (err: unknown) {
      const msg =
        (err as { data?: { message?: string; error?: string } })?.data?.message ||
        (err as { data?: { error?: string } })?.data?.error ||
        (err as Error)?.message ||
        'Please try again.'
      toast({
        title: 'Ask AI failed',
        description: msg,
        variant: 'destructive',
      })
      setChatMessages([])
      setAskDialogOpen(false)
    }
  }

  const submitAskAi = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!jobId || !chatInput.trim() || isAskingAI) return
    const question = chatInput.trim()
    setChatInput('')

    const priorHistory = chatMessages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const userTurn: ChatTurn = { id: chatMessageId(), role: 'user', content: question }
    setChatMessages((prev) => [...prev, userTurn])

    try {
      const res = await askModuleFAI({
        jobId,
        body: { question, conversationHistory: priorHistory.length ? priorHistory : undefined },
      }).unwrap()
      const text = res?.data?.answer?.trim() ?? ''
      const sources = res?.data?.sources
      if (!text) {
        toast({
          title: 'Empty response',
          description: 'The model returned no text. Try again or shorten your question.',
          variant: 'destructive',
        })
        return
      }
      setChatMessages((prev) => [
        ...prev,
        { id: chatMessageId(), role: 'assistant', content: text, sources },
      ])
    } catch (err: unknown) {
      const msg =
        (err as { data?: { message?: string; error?: string } })?.data?.message ||
        (err as { data?: { error?: string } })?.data?.error ||
        (err as Error)?.message ||
        'Please try again.'
      toast({
        title: 'Ask AI failed',
        description: msg,
        variant: 'destructive',
      })
      setChatMessages((prev) => prev.filter((m) => m.id !== userTurn.id))
      setChatInput(question)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Dialog
        open={askDialogOpen}
        onOpenChange={(open) => {
          setAskDialogOpen(open)
          if (!open) {
            resetAskAI()
            setChatMessages([])
            setChatInput('')
            setChatFocusBadge(undefined)
          }
        }}
      >
        <DialogContent
          className={cn(
            'w-[calc(100vw-1rem)] max-h-[95vh] gap-0 overflow-visible border-0 bg-transparent p-0 pt-10 shadow-none sm:max-w-3xl lg:max-w-5xl',
            'data-[state=open]:zoom-in-[0.98]',
          )}
          showCloseButton
        >
          <ModuleFAskAiChatShell
            brandName={brandName}
            focusBadge={chatFocusBadge}
            chatScrollRef={chatScrollRef}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            isAskingAI={isAskingAI}
            askAIError={askAIError}
            onSubmit={submitAskAi}
            onSuggestionClick={(text) => setChatInput(text)}
          />
        </DialogContent>
      </Dialog>

      {/* Premium Header */}
      <div className="rounded-3xl p-6 sm:p-8 relative overflow-hidden" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="p-4 rounded-2xl shadow-sm" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
              <Trophy className="w-8 h-8 text-amber-500 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--nd-text-primary)' }}>Competitor Wins Library</h2>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">AEO Analysis</span>
                </div>
              </div>
              <p className="text-sm max-w-2xl leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>
                Analyze prompts where competitors rank higher or appear more frequently. Identify content gaps and opportunities to improve your AI visibility and citation share.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-3 md:self-start">
            {summary?.total_prompts && (
              <div className="flex flex-col items-end gap-1 px-4 py-2 rounded-2xl" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>Dataset</span>
                <span className="text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>{summary.total_prompts} Prompts Tracked</span>
              </div>
            )}

            <Button
              type="button"
              onClick={openAskAiDialog}
              disabled={isAskingAI}
              className={cn(
                'rounded-full border-0 shadow-lg shadow-fuchsia-950/30',
                'text-sm font-extrabold uppercase tracking-wider sm:text-base',
                'bg-gradient-to-r from-purple-500 via-pink-500 to-amber-300',
                'text-black hover:opacity-95 hover:shadow-xl',
                'h-auto min-h-[48px] px-6 py-3 sm:min-h-[52px] sm:px-8 sm:py-3.5',
                'gap-2.5',
              )}
            >
              <MessageSquare className="size-5 shrink-0 sm:size-6" strokeWidth={2.25} aria-hidden />
              ASK AI
            </Button>
          </div>
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
          labelAction={
            <MetricAskButton
              disabled={!jobId || isAskingAI}
              onClick={() => runMetricAskAi('competitor_win_rate', 'Competitor Win Rate')}
            />
          }
        />
        
        <StatCard
          label="Brand Win Rate"
          value={`${summary?.brand_win_rate ?? 0}%`}
          subtext={`${summary?.brand_wins ?? 0} Prompts Won`}
          icon={Trophy}
          accent="amber"
          progress={summary?.brand_win_rate ?? 0}
          description={normaliseMetricRec(effectiveData?.metric_recommendations?.brand_win_rate)?.why || "Percentage of prompts where your brand outperforms competitors."}
          labelAction={
            <MetricAskButton
              disabled={!jobId || isAskingAI}
              onClick={() => runMetricAskAi('brand_win_rate', 'Brand Win Rate')}
            />
          }
        />

        <StatCard
          label="Content Gap Score"
          value={summary?.avg_content_gap_score ?? 0}
          subtext={`${summary?.brand_prompt_mentions ?? 0} Brand Mentions`}
          icon={FileText}
          accent="blue"
          progress={summary?.avg_content_gap_score ?? 0}
          description={normaliseMetricRec(effectiveData?.metric_recommendations?.content_gap_score)?.why || "Average gap in content completeness or entity coverage."}
          labelAction={
            <MetricAskButton
              disabled={!jobId || isAskingAI}
              onClick={() => runMetricAskAi('content_gap_score', 'Content Gap Score')}
            />
          }
        />

        <StatCard
          label="Market Share"
          value={`${effectiveData?.compare_visibility_against_competitors?.brand?.market_share_percent ?? 0}%`}
          subtext="Overall SOV Share"
          icon={Activity}
          accent="violet"
          progress={effectiveData?.compare_visibility_against_competitors?.brand?.market_share_percent ?? 0}
          description={normaliseMetricRec(effectiveData?.metric_recommendations?.market_share)?.why || "Your brand's share of voice across all analyzed prompts."}
          labelAction={
            <MetricAskButton
              disabled={!jobId || isAskingAI}
              onClick={() => runMetricAskAi('market_share', 'Market Share')}
            />
          }
        />
      </div>

      {competitorBreakdown.length > 0 && (
        <SectionCard 
          title="Competitor Win Breakdown" 
          description="Per-competitor wins and win percentage (competitor rank better than your brand)."
          actionSlot={
            <MetricAskButton
              disabled={!jobId || isAskingAI}
              onClick={() => runMetricAskAi('competitor_win_breakdown', 'Competitor Win Breakdown')}
            />
          }
        >
          <ScrollArea className="h-[400px] pr-4 -mr-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-4">
                {competitorBreakdown.map((row) => (
                <div key={row.competitor} className="group rounded-2xl p-5 transition-all duration-300 overflow-hidden" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border)')}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                        <Sword className="w-5 h-5" style={{ color: 'var(--nd-text-muted)' }} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold truncate text-base" style={{ color: 'var(--nd-text-primary)' }} title={row.competitor}>{row.competitor}</div>
                      <div className="text-[11px] font-bold uppercase tracking-tighter mt-0.5" style={{ color: 'var(--nd-text-muted)' }}>
                          Mentioned in {row.prompts_mentioned} / {summary?.total_prompts ?? 0} prompts
                        </div>
                      </div>
                    </div>
                    <Badge className={cn('px-2.5 py-1 rounded-lg border text-xs font-bold uppercase tracking-wider',
                      row.win_percent >= 60 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                      row.win_percent >= 30 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-gray-50 text-gray-600 border-gray-200'
                    )}>
                      {row.win_percent}% Win Rate
                    </Badge>
                  </div>

                  <div className="relative h-2 w-full rounded-full overflow-hidden mb-6" style={{ background: 'var(--nd-border)' }}>
                    <div
                      className={cn('h-full rounded-full transition-all duration-1000 ease-out',
                        row.win_percent >= 60 ? 'bg-orange-400' :
                        row.win_percent >= 30 ? 'bg-amber-600' : 'bg-gray-400'
                      )}
                      style={{ width: `${Math.min(100, row.win_percent)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl p-3 flex flex-col items-center text-center" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
                      <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--nd-text-muted)' }}>Prompts Won</div>
                      <div className="text-lg font-bold font-mono" style={{ color: 'var(--nd-text-primary)' }}>{row.prompts_won}</div>
                    </div>
                    <div className="rounded-xl p-3 flex flex-col items-center text-center" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
                      <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--nd-text-muted)' }}>Win %</div>
                      <div className="text-lg font-bold font-mono" style={{ color: 'var(--nd-text-primary)' }}>{row.win_percent}%</div>
                    </div>
                    <div className="rounded-xl p-3 flex flex-col items-center text-center" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
                      <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--nd-text-muted)' }}>Content Gap</div>
                      <div className="text-lg font-bold font-mono" style={{ color: 'var(--nd-text-primary)' }}>{row.content_gap_score}%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SectionCard>
      )}

      {/* Prompt Analysis Library — topic-wise when available, flat list otherwise */}
      <SectionCard 
        title={
          hasTopicWins && selectedTopic
            ? `Topic: ${selectedTopic}`
            : 'Prompt Analysis Library'
        }
        description={
          hasTopicWins && selectedTopic
            ? `All analyzed prompts for this topic. Click a prompt to see the competitive ranking.`
            : hasTopicWins
              ? `Prompts are organized by the topics generated during brand onboarding. Click a topic to explore its prompts.`
              : 'Detailed breakdown of winner and ranking for each prompt analyzed by AI models.'
        }
        className=""
        actionSlot={
          <MetricAskButton
            disabled={!jobId || isAskingAI}
            onClick={() => runMetricAskAi('prompt_analysis_library', 'Prompt Analysis Library')}
          />
        }
      >
        {!flags.prompt_level_drilldown ? (
          <div className="text-center py-20 rounded-3xl border border-dashed" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6" style={{ background: 'var(--nd-border)', border: '1px solid var(--nd-border)' }}>
              <Lock className="w-10 h-10" style={{ color: 'var(--nd-text-muted)' }} />
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--nd-text-primary)' }}>Prompt-Level Drilldown</h3>
            <p className="text-sm max-w-sm mx-auto leading-relaxed mb-8" style={{ color: 'var(--nd-text-secondary)' }}>
              Upgrade to Agency or Enterprise to see per-prompt winner analysis, coverage gap scores, and ranking breakdowns.
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200">
                <Star className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">Agency</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: 'var(--nd-purple-subtle)', border: '1px solid var(--nd-purple)' }}>
                <Zap className="w-4 h-4" style={{ color: 'var(--nd-purple)' }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-purple)' }}>Enterprise</span>
              </div>
            </div>
          </div>
        ) : isActuallyLoading ? (
           <div className="space-y-4">
             {[1, 2, 3].map((i) => (
               <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: 'var(--nd-border)', border: '1px solid var(--nd-border)' }} />
             ))}
           </div>
        ) : hasTopicWins && !selectedTopic ? (
          /* ── TOPIC GRID VIEW ── */
          <TopicGrid
            topicWins={topicWins}
            brandName={brandName}
            onSelectTopic={(topic) => {
              setSelectedTopic(topic)
              setExpandedPrompt(null)
              setSearchTerm('')
              setFilter('all')
            }}
          />
        ) : (
          /* ── PROMPT LIST VIEW (flat or topic-filtered) ── */
          <>
            {/* Back button + search/filter row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                {selectedTopic && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTopic(null)
                      setExpandedPrompt(null)
                      setSearchTerm('')
                      setFilter('all')
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold transition-colors px-3 py-1.5 rounded-lg"
                    style={{ color: 'var(--nd-text-muted)', background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> All Topics
                  </button>
                )}
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>
                  {filteredResults.length} Result{filteredResults.length !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors" style={{ color: 'var(--nd-text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Search prompts..." 
                    className="rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none w-full md:w-64 transition-all"
                    style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)', color: 'var(--nd-text-primary)' }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-auto">
                  <TabsList className="p-1 h-9" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                    <TabsTrigger value="all" className="text-xs font-bold uppercase tracking-wider px-3 data-[state=active]:bg-white transition-all">All</TabsTrigger>
                    <TabsTrigger value="brand" className="text-xs font-bold uppercase tracking-wider px-3 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 transition-all">My Wins</TabsTrigger>
                    <TabsTrigger value="competitor" className="text-xs font-bold uppercase tracking-wider px-3 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 transition-all">Losses</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {filteredResults.length === 0 ? (
              <div className="text-center py-20 rounded-3xl border border-dashed" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--nd-border)' }}>
                  <Search className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />
                </div>
                <h3 className="font-bold mb-1" style={{ color: 'var(--nd-text-primary)' }}>No prompts found</h3>
                <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>Try adjusting your search or filters.</p>
              </div>
            ) : (
              <PromptResultList
                results={filteredResults}
                brandName={brandName}
                expandedPrompt={expandedPrompt}
                onToggleExpand={(idx) => setExpandedPrompt(expandedPrompt === idx ? null : idx)}
                normalizeKey={normalizeKey}
              />
            )}
          </>
        )}
      </SectionCard>
    </div>
  )
}
