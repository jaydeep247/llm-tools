'use client'

import { useMemo, useState, useRef, useEffect, type FormEvent } from 'react'
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
  Lightbulb,
  MessageSquare
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
  normaliseMetricRec,
  useAskModuleFAIMutation,
  ModuleFResult
} from '@/store/api/module_F/moduleFApi'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleFAskAiChatShell } from '@/components/module_F/ModuleFAskAiChatShell'

interface GapOpportunitiesProps {
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

/** Scoped Ask AI targets for Gap Opportunities */
type GapAskTarget =
  | 'gap_score'
  | 'missing_prompts'
  | 'potential_gain'
  | 'top_opportunity'
  | 'competitor_coverage_gaps'

function buildGapAskPrompt(
  target: GapAskTarget,
  data: ModuleFResult | null | undefined,
  brandName: string,
): string {
  const recommendations = data?.metric_recommendations
  const gaps = data?.gap_opportunities ?? []
  const detailed = data?.competitor_wins?.detailed_results ?? []

  const base = `You are answering from the user's latest Module F "Gap Opportunities" run for brand "${brandName}".
Answer immediately — do not ask the user for clarification. Focus ONLY on the metric/section named in the title below.
Use the glossary in PROJECT DATA. Use markdown with short headings and bullets where helpful.`

  switch (target) {
    case 'gap_score':
      return `${base}

**Title: Gap Score Analysis**

Explain what the Gap Score means and interpret the overall opportunity size (JSON). How significant are these gaps for the brand?
${JSON.stringify({
        recommendation: recommendations?.content_gap_score,
        overall_gaps_count: gaps.length,
      })}`
    case 'missing_prompts':
      return `${base}

**Title: Missing Prompts**

Explain what "Missing Prompts" represents (JSON). These are areas where the brand is currently weak or unranked. What's the priority?
${JSON.stringify({
        recommendation: recommendations?.missing_prompts,
        total_prompts: data?.competitor_wins?.summary?.total_prompts,
      })}`
    case 'potential_gain':
      return `${base}

**Title: Potential Gain**

Analyze the potential visibility gain if these gaps are addressed (JSON). How much market share could be captured?
${JSON.stringify({
        recommendation: recommendations?.potential_gain,
      })}`
    case 'top_opportunity':
      return `${base}

**Title: Top Opportunity**

Identify and explain the top competitor opportunity (JSON). Which competitor is most vulnerable and why?
${JSON.stringify({
        top_competitor_gap: gaps[0],
      })}`
    case 'competitor_coverage_gaps':
      return `${base}

**Title: Competitor Coverage Gaps**

Summarize the gaps identified in this section (JSON). Which specific competitors have the largest coverage gaps that the brand can exploit?
${JSON.stringify({
        gaps_sample: gaps.slice(0, 5).map(g => ({
          competitor: g.competitor,
          gap_score: g.gapScore,
          missing_prompts: g.missingPrompts,
          potential_gain: g.potentialGainPercent,
        })),
        detailed_sample: detailed.slice(0, 5).map(r => ({
          prompt: r.prompt,
          winner: r.winner,
          gap: r.coverage_gap_score,
        })),
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
  const brandName = effectiveData?.compare_visibility_against_competitors?.brand?.name || 'Brand'
  
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

  const runMetricAskAi = async (target: GapAskTarget, displayLabel: string) => {
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

    const fullPrompt = buildGapAskPrompt(target, effectiveData, brandName)

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

  const flags = resolveFeatureFlags(effectiveData)

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
      <div className="space-y-8 animate-pulse">
        <div className="h-32 rounded-3xl border" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-border)' }} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl p-5 border h-32" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-border)' }} />
          ))}
        </div>
        <div className="h-96 rounded-2xl border" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-border)' }} />
      </div>
    )
  }

  const hasData = rows.length > 0 && totalPrompts > 0
  const gapRec = normaliseMetricRec(effectiveData?.metric_recommendations?.content_gap_score)
  const missingRec = normaliseMetricRec(effectiveData?.metric_recommendations?.missing_prompts)
  const gainRec = normaliseMetricRec(effectiveData?.metric_recommendations?.potential_gain)

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

      {/* Header */}
      <div className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl border shrink-0" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
              <Radar className="w-6 h-6" style={{ color: 'var(--nd-teal)' }} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="nd-page-title">Gap Opportunities</h2>
                {flags.gap_opportunities === 'limited' && (
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700">Limited View</span>
                )}
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>
                Identify prompts where competitors are missing coverage or underperforming, and estimate how much visibility you can capture for{' '}
                <span className="font-bold" style={{ color: 'var(--nd-text-primary)' }}>{brandName}</span>.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 md:self-start shrink-0">
            <div className="flex flex-col items-end gap-0.5 px-4 py-2 rounded-xl border" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>Total Prompts</span>
              <span className="text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>{totalPrompts}</span>
            </div>
            <Button
              type="button"
              onClick={openAskAiDialog}
              disabled={isAskingAI}
              className="rounded-xl text-xs font-bold uppercase tracking-wider px-4 py-2 border-0"
              style={{ background: 'var(--nd-purple)', color: '#fff' }}
            >
              <MessageSquare className="size-4 shrink-0 mr-1.5" strokeWidth={2.25} aria-hidden />
              Ask AI
            </Button>
          </div>
        </div>
      </div>

      {!flags.gap_opportunities ? (
        <div className="rounded-2xl border p-16 text-center" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
          <div className="w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto mb-5" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
            <Lock className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />
          </div>
          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--nd-text-primary)' }}>Prompt-Level Gap Analysis</h3>
          <p className="text-sm max-w-sm mx-auto leading-relaxed mb-6" style={{ color: 'var(--nd-text-secondary)' }}>
            Upgrade to Agency or Enterprise to unlock prompt-level coverage gap analysis and competitor opportunity scoring.
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl border" style={{ borderColor: 'var(--nd-teal)', background: '#f0fdfb' }}>
              <Star className="w-4 h-4" style={{ color: 'var(--nd-teal)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-teal)' }}>Agency</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-200 bg-amber-50">
              <Zap className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">Enterprise</span>
            </div>
          </div>
        </div>
      ) : !hasData ? (
        <AnalysisEmptyState
          icon={<Target className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />}
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
              labelAction={
                <MetricAskButton
                  disabled={!jobId || isAskingAI}
                  onClick={() => runMetricAskAi('gap_score', 'Gap Score')}
                />
              }
            />

            <StatCard
              label="Missing Prompts"
              value={overall.totalMissingPrompts}
              subtext="Gaps found"
              icon={Radar}
              accent="amber"
              description={missingRec?.why || "Prompts where your brand is currently outside the top 3 results."}
              labelAction={
                <MetricAskButton
                  disabled={!jobId || isAskingAI}
                  onClick={() => runMetricAskAi('missing_prompts', 'Missing Prompts')}
                />
              }
            />

            <StatCard
              label="Potential Gain"
              value={`${overall.averagePotentialGainPercent}%`}
              subtext="Average capture rate"
              icon={TrendingUp}
              accent="emerald"
              progress={overall.averagePotentialGainPercent}
              description={gainRec?.why || "Estimated visibility share you can capture by addressing these content gaps."}
              labelAction={
                <MetricAskButton
                  disabled={!jobId || isAskingAI}
                  onClick={() => runMetricAskAi('potential_gain', 'Potential Gain')}
                />
              }
            />

            <StatCard
              label="Top Opportunity"
              value={overall.topCompetitor?.competitor ?? '—'}
              subtext={`Score: ${overall.topCompetitor?.gapScore ?? 0}/100`}
              icon={Trophy}
              accent="violet"
              progress={overall.topCompetitor?.gapScore}
              description="Competitor with the largest share of voice that is currently uncontested or weak."
              labelAction={
                <MetricAskButton
                  disabled={!jobId || isAskingAI}
                  onClick={() => runMetricAskAi('top_opportunity', 'Top Opportunity')}
                />
              }
            />
          </div>

          <SectionCard
            title="Competitor Coverage Gaps"
            description="Deep dive into specific prompts where competitors are missing coverage or ranking poorly."
            actionSlot={
              <MetricAskButton
                disabled={!jobId || isAskingAI}
                onClick={() => runMetricAskAi('competitor_coverage_gaps', 'Competitor Coverage Gaps')}
              />
            }
          >
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Sidebar / Selector */}
              <div className="w-full lg:w-72 shrink-0 space-y-6">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] mb-4" style={{ color: 'var(--nd-text-muted)' }}>Competitors</div>
                  <div className="flex flex-col gap-2">
                    {rows.map((row) => (
                      <button
                        key={row.competitor}
                        onClick={() => setSelectedCompetitor(row.competitor)}
                        className="flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 text-left"
                        style={activeCompetitor === row.competitor
                          ? { background: 'var(--nd-purple-subtle)', borderColor: 'var(--nd-purple)', color: 'var(--nd-text-primary)' }
                          : { background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: activeCompetitor === row.competitor ? 'var(--nd-purple)' : 'var(--nd-border)' }}
                          />
                          <span className="font-bold truncate text-sm">{row.competitor}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: activeCompetitor === row.competitor ? 'var(--nd-purple)' : 'var(--nd-text-muted)' }} />
                      </button>
                    ))}
                  </div>
                </div>

                {activeRow && (
                  <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-b pb-3" style={{ color: 'var(--nd-text-muted)', borderColor: 'var(--nd-border)' }}>
                      <BarChart3 className="w-3.5 h-3.5" style={{ color: 'var(--nd-teal)' }} /> Performance
                    </div>
                    <div className="space-y-3">
                      {[['Gap Score', `${activeRow.gapScore}/100`], ['Missing Prompts', String(activeRow.missingPrompts)], ['Potential Gain', `${activeRow.potentialGainPercent}%`]].map(([label, val]) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>{label}</span>
                          <span className="text-sm font-bold font-mono" style={{ color: 'var(--nd-text-primary)' }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--nd-border)' }}>
                      <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>Opportunity Summary</div>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>
                        Addressing these{' '}
                        <span className="font-bold" style={{ color: 'var(--nd-text-primary)' }}>{activeRow.missingPrompts}</span>{' '}
                        gaps could improve{' '}
                        <span className="font-bold" style={{ color: 'var(--nd-text-primary)' }}>{brandName}'s</span>{' '}
                        visibility by up to{' '}
                        <span className="font-bold" style={{ color: 'var(--nd-positive-text)' }}>{activeRow.potentialGainPercent}%</span>{' '}
                        for this competitor's share.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Main Content Area */}
              <div className="flex-1 min-w-0 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl border" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                      <Target className="w-5 h-5" style={{ color: 'var(--nd-teal)' }} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold leading-tight" style={{ color: 'var(--nd-text-primary)' }}>{activeCompetitor} Coverage Gaps</h3>
                      <p className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>Showing top {filteredOpportunities.length} opportunities</p>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--nd-text-muted)' }} />
                    <input 
                      type="text" 
                      placeholder="Filter prompts..." 
                      className="rounded-xl pl-10 pr-4 py-2 text-sm w-full md:w-64 outline-none border transition-all"
                      style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }}
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
                        <div key={idx} className="group relative border rounded-xl p-4 transition-all duration-200 hover:shadow-sm" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
                          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-3">
                                <Badge className={cn(
                                  'px-2 py-0.5 rounded-lg border text-xs font-bold uppercase tracking-wider',
                                  isMissing ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                                )}>
                                  {isMissing ? 'High Priority Gap' : 'Moderate Opportunity'}
                                </Badge>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-xs font-bold uppercase" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)', color: 'var(--nd-text-muted)' }}>
                                  <MousePointer2 className="w-3 h-3" style={{ color: 'var(--nd-teal)' }} />
                                  Score: {round1(o.opportunityScore)}
                                </div>
                              </div>
                              <h4 className="font-bold text-base mb-3 leading-snug" style={{ color: 'var(--nd-text-primary)' }}>
                                {o.prompt}
                              </h4>
                              <div className="flex items-center gap-4">
                                <div className="flex-1 max-w-xs space-y-1.5">
                                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-tighter" style={{ color: 'var(--nd-text-muted)' }}>
                                    <span>Opportunity Strength</span>
                                    <span>{round1(o.opportunityScore)}%</span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--nd-border)' }}>
                                    <div
                                      className="h-full rounded-full transition-all duration-700"
                                      style={{
                                        width: `${Math.min(100, o.opportunityScore)}%`,
                                        background: o.opportunityScore >= 80 ? '#d97706' : o.opportunityScore >= 50 ? 'var(--nd-teal)' : 'var(--nd-text-muted)',
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 shrink-0 border px-4 py-3 rounded-xl w-full md:w-auto" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                              <div className="flex flex-col items-center border-r pr-4" style={{ borderColor: 'var(--nd-border)' }}>
                                <span className="text-[11px] font-bold uppercase tracking-tighter" style={{ color: 'var(--nd-text-muted)' }}>Comp. Rank</span>
                                <span className={cn('text-lg font-bold font-mono', isMissing ? 'text-amber-600' : '')} style={!isMissing ? { color: 'var(--nd-text-secondary)' } : {}}>
                                  {o.rank ? `#${o.rank}` : 'N/A'}
                                </span>
                              </div>
                              <div className="flex flex-col items-end flex-1 md:flex-none">
                                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--nd-teal)' }}>
                                  <Lightbulb className="w-3 h-3" /> Action
                                </div>
                                <span className="text-xs text-right font-medium" style={{ color: 'var(--nd-text-secondary)' }}>Create Targeting Content</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {filteredOpportunities.length === 0 && (
                      <div className="text-center py-16 border rounded-2xl border-dashed" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                        <div className="w-12 h-12 rounded-xl border flex items-center justify-center mx-auto mb-4" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
                          <Search className="w-6 h-6" style={{ color: 'var(--nd-text-muted)' }} />
                        </div>
                        <h3 className="font-bold mb-1" style={{ color: 'var(--nd-text-primary)' }}>No prompts found</h3>
                        <p className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>Try adjusting your search filter.</p>
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

