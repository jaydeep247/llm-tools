'use client'

import { 
  type ModuleFMetricRecommendation, 
  useGetModuleFTrendsQuery, 
  useGetModuleFResultQuery, 
  resolveFeatureFlags, 
  resolveD7Output,
  normaliseMetricRec,
  useAskModuleFAIMutation,
  ModuleFResult
} from '@/store/api/module_F/moduleFApi'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  TrendingUp, 
  TrendingDown, 
  LineChart as LineChartIcon, 
  Activity, 
  Calendar, 
  Info,
  Zap,
  BarChart3,
  Clock,
  Layout,
  Star,
  Shield,
  MousePointer2,
  Trophy,
  History,
  Rocket,
  ArrowUpRight,
  Eye,
  Percent,
  Swords,
  ChevronRight,
  Target,
  Cpu,
  AlertTriangle,
  MessageSquare
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useCallback, useMemo, useState, useRef, useEffect, type FormEvent } from 'react'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatCard } from '@/components/ui/StatCard'
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleFAskAiChatShell } from '@/components/module_F/ModuleFAskAiChatShell'

interface CompetitorGrowthTrendsProps {
  jobId: string
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

/** Scoped Ask AI targets for Growth Trends */
type TrendsAskTarget =
  | 'visibility_change'
  | 'market_share_change'
  | 'latest_snapshot'
  | 'd7_score'
  | 'performance_trends'
  | 'market_momentum'

function buildTrendsAskPrompt(
  target: TrendsAskTarget,
  data: ModuleFResult | null | undefined,
  trends: any,
  brandName: string,
): string {
  const history = trends?.history || []
  const latest = history[history.length - 1]
  const prev = history[history.length - 2]
  const d7 = resolveD7Output(data)
  const recommendations = data?.metric_recommendations
  const emerging = data?.emerging_trends

  const base = `You are answering from the user's latest Module F "Growth Trends" run for brand "${brandName}".
Answer immediately — do not ask the user for clarification. Focus ONLY on the metric/section named in the title below.
Use the glossary in PROJECT DATA. Use markdown with short headings and bullets where helpful.`

  switch (target) {
    case 'visibility_change':
      return `${base}

**Title: Visibility Change Analysis**

Analyze the brand's visibility change over time (JSON). Is the trend positive and what are the key drivers?
${JSON.stringify({
        current_visibility: latest?.brand?.visibility_score,
        prev_visibility: prev?.brand?.visibility_score,
        recommendation: recommendations?.visibility_score,
      })}`
    case 'market_share_change':
      return `${base}

**Title: Market Share Change**

Explain the shift in market share / share of voice (JSON). How has the brand's position evolved relative to competitors?
${JSON.stringify({
        current_share: latest?.brand?.market_share_percent,
        prev_share: prev?.brand?.market_share_percent,
        recommendation: recommendations?.market_share,
      })}`
    case 'latest_snapshot':
      return `${base}

**Title: Latest Performance Snapshot**

Summarize the brand's current performance status (JSON). What are the most important takeaways from the latest analysis?
${JSON.stringify({
        visibility: latest?.brand?.visibility_score,
        share: latest?.brand?.market_share_percent,
        run_count: history.length,
      })}`
    case 'd7_score':
      return `${base}

**Title: AIVS™ D7 Score (Trends)**

Analyze the AIVS™ D7 score trend (JSON). How is the competitive citation gap changing over time?
${JSON.stringify({
        d7_score: d7?.d7_score,
        d7_grade: d7?.d7_grade,
        d7_delta: d7?.d7_delta,
      })}`
    case 'performance_trends':
      return `${base}

**Title: Performance Trends Visualization**

Interpret the trends shown in the charts (JSON). Identify long-term patterns for the brand and its key competitors.
${JSON.stringify({
        history_summary: history.map((h: any) => ({
          date: h.date,
          brand_score: h.brand.visibility_score,
          brand_share: h.brand.market_share_percent,
        })),
      })}`
    case 'market_momentum':
      return `${base}

**Title: Market Momentum & Emerging Shifts**

Analyze the emerging trends and market momentum (JSON). Who are the top movers and what major shifts are occurring in the competitive landscape?
${JSON.stringify({
        emerging_summary: emerging?.summary,
        competitor_changes: emerging?.competitor_changes,
        prompt_swings: emerging?.prompt_swings,
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
      className={cn(
        'inline-flex items-center gap-1 rounded-full',
        'px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider',
        'hover:opacity-80 transition-colors cursor-pointer shrink-0',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
      style={{ border: '1px solid var(--nd-purple)', background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' }}
    >
      <MessageSquare className="size-3 shrink-0" aria-hidden />
      Ask AI
    </button>
  )
}

interface CompetitorGrowthTrendsProps {
  jobId: string
}

type TrendSeries = {
  key: string
  label: string
  color: string
  kind: 'brand' | 'competitor'
}

function formatSigned(value: number, decimals = 1) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}`
}

function computePercentChange(prev: number, next: number) {
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return null
  if (prev <= 0) return null
  return ((next - prev) / prev) * 100
}

export default function CompetitorGrowthTrends({ jobId }: CompetitorGrowthTrendsProps) {
  const { data: response, isLoading, error } = useGetModuleFTrendsQuery(jobId, {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })
  const { data: latestResult } = useGetModuleFResultQuery(jobId, {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const trends = response?.data
  const history = trends?.history || []
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<'visibility' | 'share'>('visibility')
  const { toast } = useToast()

  const brandName = latestResult?.data?.compare_visibility_against_competitors?.brand?.name || 'Brand'
  
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

  const runMetricAskAi = async (target: TrendsAskTarget, displayLabel: string) => {
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

    const fullPrompt = buildTrendsAskPrompt(target, latestResult?.data, trends, brandName)

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

  const toggleSeries = useCallback((seriesKey: string) => {
    setHidden((prev) => ({ ...prev, [seriesKey]: !prev[seriesKey] }))
  }, [])

  const latestPoint = history.length ? history[history.length - 1] : null
  const prevPoint = history.length > 1 ? history[history.length - 2] : null

  const brandNowVisibility = latestPoint?.brand?.visibility_score ?? null
  const brandNowShare = latestPoint?.brand?.market_share_percent ?? null
  const brandNowMentions = latestPoint?.brand?.mentions_total ?? null

  const brandPrevVisibility = prevPoint?.brand?.visibility_score ?? null
  const brandPrevShare = prevPoint?.brand?.market_share_percent ?? null

  const brandVisibilityChangePct =
    brandPrevVisibility === null || brandNowVisibility === null
      ? null
      : computePercentChange(brandPrevVisibility, brandNowVisibility)
  const brandMarketShareChange =
    brandPrevShare === null || brandNowShare === null ? null : brandNowShare - brandPrevShare

  const runCount = history.length
  const canComputeDelta = runCount >= 2

  const series = useMemo((): TrendSeries[] => {
    if (!history.length) return []
    const brandLabel = history[0]?.brand?.name || 'Brand'
    const colors = ['#DC2626', '#059669', '#D97706', '#7C3AED', '#DB2777', '#16A34A', '#0E7490']

    const competitorsFromLatest = (latestPoint?.competitors || []).map((c) => c.name).filter(Boolean)
    const competitorsUnique = Array.from(new Set(competitorsFromLatest))
    const limitedCompetitors = competitorsUnique.slice(0, 6)

    const s: TrendSeries[] = [{ key: 's_brand', label: brandLabel, color: '#5347CE', kind: 'brand' }]
    limitedCompetitors.forEach((name, i) => {
      s.push({
        key: `s_c_${i}`,
        label: name,
        color: colors[i % colors.length],
        kind: 'competitor',
      })
    })
    return s
  }, [history, latestPoint?.competitors])

  const chartData = useMemo(() => {
    if (!history.length || !series.length) return []

    const seriesLabelToKey = new Map(series.map((s) => [s.label, s.key]))

    return history.map((point) => {
      const dateStr = point.date ? format(new Date(point.date), 'MMM dd') : ''
      const row: Record<string, any> = {
        date: dateStr,
        fullDate: point.date,
        runId: point.jobId,
      }

      const brandKey = seriesLabelToKey.get(point.brand.name) || 's_brand'
      row[brandKey] = point.brand.visibility_score
      row[`${brandKey}_share`] = point.brand.market_share_percent
      row[`${brandKey}_mentions`] = point.brand.mentions_total

      point.competitors.forEach((comp) => {
        const key = seriesLabelToKey.get(comp.name)
        if (!key) return
        row[key] = comp.visibility_score
        row[`${key}_share`] = comp.market_share_percent
        row[`${key}_mentions`] = comp.mentions_total
      })

      return row
    })
  }, [history, series])

  const topMovers = useMemo(() => {
    if (!latestPoint || !prevPoint) return []

    const prevMap = new Map(prevPoint.competitors.map((c) => [c.name, c]))
    const rows = latestPoint.competitors.map((c) => {
      const prev = prevMap.get(c.name)
      const visibilityDelta = (c.visibility_score ?? 0) - (prev?.visibility_score ?? 0)
      const shareDelta = (c.market_share_percent ?? 0) - (prev?.market_share_percent ?? 0)
      return {
        name: c.name,
        visibilityDelta,
        shareDelta,
        currentVisibility: c.visibility_score,
        currentShare: c.market_share_percent,
      }
    })

    rows.sort((a, b) => Math.abs(b.visibilityDelta) - Math.abs(a.visibilityDelta))
    return rows.slice(0, 5)
  }, [latestPoint, prevPoint])

  const emerging = latestResult?.data?.emerging_trends || null
  const competitorChanges = emerging?.competitor_changes || []
  const promptSwings = emerging?.prompt_swings || []
  const summary = emerging?.summary || null
  const modelTargeting = emerging?.model_targeting || {}
  const visibilityRec = normaliseMetricRec(latestResult?.data?.metric_recommendations?.visibility_score)
  const shareRec = normaliseMetricRec(latestResult?.data?.metric_recommendations?.market_share)
  const flags = resolveFeatureFlags(latestResult?.data)
  const d7 = resolveD7Output(latestResult?.data)
  const eventOverlays = useMemo(() => {
    if (!chartData.length) return [] as Array<{ label: string; y: number; color: string }>
    const events: Array<{ label: string; y: number; color: string }> = []

    // Overlay signals based on latest run deltas/swings.
    if (promptSwings.length > 0) {
      events.push({ label: 'Content published', y: 96, color: '#059669' })
    }
    if (competitorChanges.some((c) => c.status === 'rising' || c.status === 'falling')) {
      events.push({ label: 'Model update detected', y: 90, color: '#D97706' })
    }
    if (latestResult?.data?.moat4_recommendations?.all_actions?.some((a) => a.gap_type === 'schema')) {
      events.push({ label: 'Schema added', y: 84, color: '#16C8C7' })
    }

    return events
  }, [chartData.length, promptSwings.length, competitorChanges, latestResult?.data?.moat4_recommendations?.all_actions])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-75 w-full rounded-xl" />
        <Skeleton className="h-75 w-full rounded-xl" />
      </div>
    )
  }

  if (flags.trend_chart_days === 0) {
    return (
      <AnalysisEmptyState
        icon={<LineChartIcon className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />}
        title="Growth Trends Locked"
        description="Upgrade to Pro plan or above to unlock growth trend charts and competitor movement tracking."
      />
    )
  }

  if (error || !trends || !history.length) {
    return (
      <AnalysisEmptyState
        icon={<LineChartIcon className="w-8 h-8" style={{ color: 'var(--nd-text-muted)' }} />}
        title="No Trend Data Available"
        description="Trends appear after you run Module F multiple times. Use the Visibility Comparison tab to run the analysis."
      />
    )
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
              <History className="w-8 h-8 text-emerald-600 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--nd-text-primary)' }}>Growth Trends</h2>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Historical Tracking</span>
                </div>
              </div>
              <p className="text-sm max-w-2xl leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>
                Monitor visibility shifts and market share momentum over time. Analyze how model updates and content changes impact your competitive standing.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-3 md:self-start">
            <div className="flex flex-col items-end gap-1 px-4 py-2 rounded-2xl" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>Dataset</span>
              <span className="text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>{runCount} Historical Runs</span>
            </div>

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

      {/* Emerging Trend Summary Highlights */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-3xl p-5" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                <Zap className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--nd-text-muted)' }}>Trends Detected</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{summary.trends_detected}</span>
                  <span className="text-xs font-bold text-emerald-700 uppercase">Active</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl p-5" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200">
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--nd-text-muted)' }}>Avg. Visibility Delta</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>{formatSigned(summary.avg_visibility_delta)}</span>
                  <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--nd-text-muted)' }}>Pts</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl p-5" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-3 rounded-2xl border",
                summary.threat_level === 'high' ? "bg-rose-50 border-rose-200" : 
                summary.threat_level === 'medium' ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
              )}>
                <Shield className={cn(
                  "w-5 h-5",
                  summary.threat_level === 'high' ? "text-rose-600" : 
                  summary.threat_level === 'medium' ? "text-amber-700" : "text-emerald-600"
                )} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--nd-text-muted)' }}>Overall Threat Level</p>
                <div className="flex items-baseline gap-2">
                  <span className={cn(
                    "text-2xl font-bold capitalize",
                    summary.threat_level === 'high' ? "text-rose-600" : 
                    summary.threat_level === 'medium' ? "text-amber-700" : "text-emerald-700"
                  )}>{summary.threat_level}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Summary */}
      <div className={cn('grid gap-4', d7 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3')}>
        <StatCard
          label="Visibility Change"
          value={canComputeDelta && brandVisibilityChangePct !== null
            ? `${formatSigned(brandVisibilityChangePct)}%`
            : (brandNowVisibility !== null ? brandNowVisibility.toFixed(1) : '—')}
          subtext={canComputeDelta ? 'vs previous run' : 'Current visibility'}
          icon={Eye}
          accent={canComputeDelta && brandVisibilityChangePct !== null 
            ? (brandVisibilityChangePct >= 0 ? 'emerald' : 'rose')
            : 'blue'}
          trend={canComputeDelta && brandVisibilityChangePct !== null
            ? (brandVisibilityChangePct >= 0 ? 'up' : 'down')
            : 'neutral'}
          description={visibilityRec?.why || "Change in overall visibility score compared to the previous analysis run."}
          labelAction={
            <MetricAskButton
              disabled={!jobId || isAskingAI}
              onClick={() => runMetricAskAi('visibility_change', 'Visibility Change')}
            />
          }
        />

        <StatCard
          label="Market Share Change"
          value={canComputeDelta && brandMarketShareChange !== null
            ? `${formatSigned(brandMarketShareChange)}%`
            : (brandNowShare !== null ? `${brandNowShare.toFixed(1)}%` : '—')}
          subtext={canComputeDelta ? 'vs previous run' : 'Current market share'}
          icon={Percent}
          accent={canComputeDelta && brandMarketShareChange !== null 
            ? (brandMarketShareChange >= 0 ? 'emerald' : 'rose')
            : 'blue'}
          trend={canComputeDelta && brandMarketShareChange !== null
            ? (brandMarketShareChange >= 0 ? 'up' : 'down')
            : 'neutral'}
          description={shareRec?.why || "Shift in market share (share of voice) since the last data point."}
          labelAction={
            <MetricAskButton
              disabled={!jobId || isAskingAI}
              onClick={() => runMetricAskAi('market_share_change', 'Market Share Change')}
            />
          }
        />

        <StatCard
          label="Latest Snapshot"
          value={brandNowVisibility?.toFixed(1) ?? '—'}
          subtext={`${brandNowShare?.toFixed(1) ?? '—'}% Share • ${runCount} Runs`}
          icon={Clock}
          accent="violet"
          description={`Last analysis run on ${latestPoint?.date ? format(new Date(latestPoint.date), 'MMM dd, yyyy') : 'N/A'}`}
          labelAction={
            <MetricAskButton
              disabled={!jobId || isAskingAI}
              onClick={() => runMetricAskAi('latest_snapshot', 'Latest Snapshot')}
            />
          }
        />

        {d7 && (
          <StatCard
            label="AIVS™ D7 Score"
            value={d7.d7_score?.toFixed(1)}
            subtext={`Grade ${d7.d7_grade} • ${d7.aivs_d7_contribution?.toFixed(2)}/15 pts`}
            icon={Zap}
            accent={d7.d7_delta && d7.d7_delta >= 0 ? 'emerald' : 'amber'}
            trend={d7.d7_delta && d7.d7_delta > 0 ? 'up' : d7.d7_delta && d7.d7_delta < 0 ? 'down' : 'neutral'}
            progress={d7.d7_score}
            description="Competitive Citation Gap Score (15% contribution to AIVS™)"
            labelAction={
              <MetricAskButton
                disabled={!jobId || isAskingAI}
                onClick={() => runMetricAskAi('d7_score', 'AIVS™ D7 Score')}
              />
            }
          />
        )}
      </div>


      {/* Trends Chart */}
      <SectionCard 
        title="Performance Trends" 
        description="Visualize visibility and market share shifts across multiple analysis runs."
        actionSlot={
          <MetricAskButton
            disabled={!jobId || isAskingAI}
            onClick={() => runMetricAskAi('performance_trends', 'Performance Trends')}
          />
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-auto">
              <TabsList className="p-1 h-9" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)' }}>
                <TabsTrigger value="visibility" className="text-xs font-bold uppercase tracking-wider px-4 data-[state=active]:bg-white transition-all">Visibility</TabsTrigger>
                <TabsTrigger value="share" className="text-xs font-bold uppercase tracking-wider px-4 data-[state=active]:bg-white transition-all">Market Share</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-bold uppercase tracking-widest mr-2" style={{ color: 'var(--nd-text-muted)' }}>Legend:</div>
              {series.map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSeries(s.key)}
                  className="flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold uppercase tracking-tighter transition-all duration-300"
                  style={hidden[s.key]
                    ? { borderColor: 'var(--nd-border)', background: 'var(--nd-bg)', color: 'var(--nd-text-muted)' }
                    : { borderColor: 'var(--nd-border-hover)', background: 'var(--nd-card-bg)', color: 'var(--nd-text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                  }
                  type="button"
                >
                  <div className="h-1.5 w-1.5 rounded-full transition-all" style={{ backgroundColor: hidden[s.key] ? 'var(--nd-border)' : s.color }} />
                  <span className="max-w-32 truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-[400px] w-full rounded-3xl p-6" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
            
            <ResponsiveContainer width="100%" height="100%">
              {activeTab === 'visibility' ? (
                <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E9EF" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#737890" 
                    fontSize={10} 
                    fontWeight="bold"
                    tickLine={false} 
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="#737890" 
                    fontSize={10} 
                    fontWeight="bold"
                    tickLine={false} 
                    axisLine={false} 
                    domain={[0, 100]} 
                    dx={-10}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #E8E9EF',
                      borderRadius: '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      padding: '12px'
                    }}
                    labelStyle={{ color: '#737890', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}
                    itemStyle={{ padding: '2px 0' }}
                    formatter={(value: any, name: any, item: any) => {
                      const s = series.find((x) => x.key === item?.dataKey)
                      const mentions = item?.payload?.[`${item?.dataKey}_mentions`]
                      const label = s?.label ?? String(name)
                      return [
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold" style={{ color: '#1A1D2B' }}>{Number(value ?? 0).toFixed(1)}</span>
                          {Number.isFinite(mentions) && (
                            <span className="text-[11px] font-bold uppercase" style={{ color: '#737890' }}>{mentions} Mentions</span>
                          )}
                        </div>,
                        <span className="text-[11px] font-medium" style={{ color: '#4A5068' }}>{label}</span>
                      ]
                    }}
                    labelFormatter={(label: any, payload: any[]) => {
                      const raw = payload?.[0]?.payload?.fullDate
                      return raw ? format(new Date(raw), 'MMM dd, yyyy • HH:mm') : label
                    }}
                  />
                  {series.map((s) =>
                    hidden[s.key] ? null : (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        stroke={s.color}
                        strokeWidth={s.kind === 'brand' ? 3 : 2}
                        dot={{ r: 4, fill: s.color, strokeWidth: 2, stroke: '#ffffff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        animationDuration={1500}
                      />
                    ),
                  )}
                  {eventOverlays.map((e) => (
                    <ReferenceDot
                      key={`v-${e.label}`}
                      x={chartData[chartData.length - 1]?.date}
                      y={e.y}
                      r={4}
                      fill={e.color}
                      stroke="none"
                      label={{ value: e.label, position: 'top', fill: e.color, fontSize: 10, fontWeight: 'bold' }}
                    />
                  ))}
                </LineChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E9EF" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#737890" 
                    fontSize={10} 
                    fontWeight="bold"
                    tickLine={false} 
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="#737890" 
                    fontSize={10} 
                    fontWeight="bold"
                    tickLine={false} 
                    axisLine={false} 
                    domain={[0, 100]} 
                    unit="%"
                    dx={-10}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #E8E9EF',
                      borderRadius: '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      padding: '12px'
                    }}
                    labelStyle={{ color: '#737890', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}
                    formatter={(value: any, name: any, item: any) => {
                      const rawKey = String(item?.dataKey || '')
                      const baseKey = rawKey.replace(/_share$/, '')
                      const s = series.find((x) => x.key === baseKey)
                      const label = s?.label ?? String(name)
                      return [
                        <span className="text-sm font-bold" style={{ color: '#1A1D2B' }}>{Number(value ?? 0).toFixed(1)}%</span>,
                        <span className="text-[11px] font-medium" style={{ color: '#4A5068' }}>{label}</span>
                      ]
                    }}
                    labelFormatter={(label: any, payload: any[]) => {
                      const raw = payload?.[0]?.payload?.fullDate
                      return raw ? format(new Date(raw), 'MMM dd, yyyy • HH:mm') : label
                    }}
                  />
                  {series.map((s) =>
                    hidden[s.key] ? null : (
                      <Line
                        key={`${s.key}_share`}
                        type="monotone"
                        dataKey={`${s.key}_share`}
                        stroke={s.color}
                        strokeWidth={s.kind === 'brand' ? 3 : 2}
                        strokeDasharray={s.kind === 'brand' ? undefined : '6 6'}
                        dot={{ r: 4, fill: s.color, strokeWidth: 2, stroke: '#ffffff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        animationDuration={1500}
                      />
                    ),
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </SectionCard>

      {canComputeDelta && (topMovers.length > 0 || competitorChanges.length > 0 || promptSwings.length > 0 || Object.keys(modelTargeting).length > 0) ? (
        <SectionCard 
          title="Market Momentum & Emerging Shifts" 
          description="Identify competitors with the highest visibility gains and analyze recent prompt winner shifts."
          actionSlot={
            <MetricAskButton
              disabled={!jobId || isAskingAI}
              onClick={() => runMetricAskAi('market_momentum', 'Market Momentum')}
            />
          }
        >
          <div className="space-y-10">
            {/* Row 1: Top Movers, Status, Model Targeting */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Top Movers */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest pb-3" style={{ color: 'var(--nd-text-muted)', borderBottom: '1px solid var(--nd-border)' }}>
                  <Rocket className="w-3.5 h-3.5 text-emerald-600" /> Top Movers (Visibility)
                </div>
                <div className="space-y-3">
                  {topMovers.map((m) => (
                    <div key={m.name} className="flex items-center justify-between p-4 rounded-2xl transition-all duration-300" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border)')}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-xl shrink-0", m.visibilityDelta > 0 ? "bg-emerald-50" : "bg-rose-50")}>
                          {m.visibilityDelta > 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-rose-600" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate max-w-[120px]" style={{ color: 'var(--nd-text-primary)' }}>{m.name}</div>
                          <div className="text-[11px] font-bold uppercase tracking-tighter" style={{ color: 'var(--nd-text-muted)' }}>Score: {m.currentVisibility.toFixed(1)}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className={cn("text-sm font-bold font-mono", m.visibilityDelta > 0 ? "text-emerald-700" : "text-rose-600")}>
                          {formatSigned(m.visibilityDelta)} pts
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Competitor Changes */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest pb-3" style={{ color: 'var(--nd-text-muted)', borderBottom: '1px solid var(--nd-border)' }}>
                  <Activity className="w-3.5 h-3.5 text-blue-600" /> Competitor Status
                </div>
                <div className="space-y-3">
                  {competitorChanges.length > 0 ? (
                    competitorChanges.slice(0, 5).map((c, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 rounded-2xl transition-all duration-300" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border)')}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-xl shrink-0", 
                            c.status === 'rising' || c.status === 'new' ? "bg-emerald-50" : 
                            c.status === 'falling' || c.status === 'missing' ? "bg-rose-50" : "bg-gray-50"
                          )}>
                            {c.status === 'rising' || c.status === 'new' ? <ArrowUpRight className="w-4 h-4 text-emerald-600" /> : 
                            c.status === 'falling' || c.status === 'missing' ? <TrendingDown className="w-4 h-4 text-rose-600" /> : 
                            <Zap className="w-4 h-4" style={{ color: 'var(--nd-text-muted)' }} />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate max-w-[120px]" style={{ color: 'var(--nd-text-primary)' }}>{c.name}</div>
                            <div className="text-[11px] font-bold uppercase tracking-tighter" style={{ color: 'var(--nd-text-muted)' }}>{c.status}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("border text-xs font-bold uppercase", 
                          c.status === 'rising' || c.status === 'new' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : 
                          c.status === 'falling' || c.status === 'missing' ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-gray-50 text-gray-600 border-gray-200"
                        )}>
                          {formatSigned(c.delta_market_share)}% Share
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-40 rounded-2xl border border-dashed" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-center px-6" style={{ color: 'var(--nd-text-muted)' }}>No major status changes</p>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Model Targeting */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest pb-3" style={{ color: 'var(--nd-text-muted)', borderBottom: '1px solid var(--nd-border)' }}>
                  <Target className="w-3.5 h-3.5" style={{ color: 'var(--nd-purple)' }} /> AI Model Targeting
                </div>
                <div className="space-y-3">
                  {Object.keys(modelTargeting).length > 0 ? (
                    Object.entries(modelTargeting).slice(0, 5).map(([comp, models], idx) => (
                      <div key={idx} className="p-4 rounded-2xl transition-all duration-300" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--nd-border)')}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-bold truncate max-w-[140px]" style={{ color: 'var(--nd-text-primary)' }}>{comp}</span>
                          <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--nd-text-muted)' }}>{models.length} Models</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {models.map((m) => (
                            <div key={m} className="px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-tighter" style={{ background: 'var(--nd-purple-subtle)', border: '1px solid var(--nd-purple)', color: 'var(--nd-purple)' }}>
                              {m}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-40 rounded-2xl border border-dashed" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-center px-6" style={{ color: 'var(--nd-text-muted)' }}>No specific model targeting detected</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: Prompt Swings (Full-width Table) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest pb-3" style={{ color: 'var(--nd-text-muted)', borderBottom: '1px solid var(--nd-border)' }}>
                <Swords className="w-3.5 h-3.5 text-amber-600" /> Detailed Prompt Swings
              </div>
              <div className="overflow-hidden rounded-3xl" style={{ border: '1px solid var(--nd-border)' }}>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>High-Value Prompt</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>Previous Winner</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>New Leader</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-right" style={{ color: 'var(--nd-text-muted)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promptSwings.length > 0 ? (
                      promptSwings.map((p, idx) => (
                        <tr key={idx} className="transition-colors" style={{ borderBottom: '1px solid var(--nd-border)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--nd-bg)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                        >
                          <td className="px-6 py-4">
                            <span className="text-sm font-medium" style={{ color: 'var(--nd-text-primary)' }}>{p.prompt}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="inline-flex px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase" style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)', color: 'var(--nd-text-secondary)' }}>
                              {p.from}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="inline-flex items-center gap-2">
                              <div className="px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase bg-emerald-50 border border-emerald-200 text-emerald-700">
                                {p.to}
                              </div>
                              <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Badge variant="outline" className="bg-amber-50 border-amber-200 text-[9px] font-bold text-amber-700 uppercase tracking-tighter">
                              Swing Detected
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center">
                          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--nd-text-muted)' }}>No major winner swings detected in recent runs</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}
