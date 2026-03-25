'use client'

import { 
  type ModuleFMetricRecommendation, 
  useGetModuleFTrendsQuery, 
  useGetModuleFResultQuery, 
  resolveFeatureFlags, 
  resolveD7Output,
  normaliseMetricRec
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
  ChevronRight
} from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useCallback, useMemo, useState } from 'react'
import { SectionCard } from '@/components/ui/SectionCard'
import { StatCard } from '@/components/ui/StatCard'
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
    const colors = ['#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#22c55e', '#06b6d4']

    const competitorsFromLatest = (latestPoint?.competitors || []).map((c) => c.name).filter(Boolean)
    const competitorsUnique = Array.from(new Set(competitorsFromLatest))
    const limitedCompetitors = competitorsUnique.slice(0, 6)

    const s: TrendSeries[] = [{ key: 's_brand', label: brandLabel, color: '#3b82f6', kind: 'brand' }]
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
  const visibilityRec = normaliseMetricRec(latestResult?.data?.metric_recommendations?.visibility_score)
  const shareRec = normaliseMetricRec(latestResult?.data?.metric_recommendations?.market_share)
  const flags = resolveFeatureFlags(latestResult?.data)
  const d7 = resolveD7Output(latestResult?.data)
  const eventOverlays = useMemo(() => {
    if (!chartData.length) return [] as Array<{ label: string; y: number; color: string }>
    const events: Array<{ label: string; y: number; color: string }> = []

    // Overlay signals based on latest run deltas/swings.
    if (promptSwings.length > 0) {
      events.push({ label: 'Content published', y: 96, color: '#22c55e' })
    }
    if (competitorChanges.some((c) => c.status === 'rising' || c.status === 'falling')) {
      events.push({ label: 'Model update detected', y: 90, color: '#f59e0b' })
    }
    if (latestResult?.data?.moat4_recommendations?.all_actions?.some((a) => a.gap_type === 'schema')) {
      events.push({ label: 'Schema added', y: 84, color: '#06b6d4' })
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
        icon={<LineChartIcon className="w-8 h-8 text-zinc-400" />}
        title="Growth Trends Locked"
        description="Upgrade to Pro plan or above to unlock growth trend charts and competitor movement tracking."
      />
    )
  }

  if (error || !trends || !history.length) {
    return (
      <AnalysisEmptyState
        icon={<LineChartIcon className="w-8 h-8 text-zinc-400" />}
        title="No Trend Data Available"
        description="Trends appear after you run Module F multiple times. Use the Visibility Comparison tab to run the analysis."
      />
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Premium Header */}
      <div className="rounded-3xl border border-zinc-800 bg-[#111113] p-6 sm:p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 blur-[100px] -ml-32 -mb-32" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl group-hover:border-emerald-500/30 transition-colors">
              <History className="w-8 h-8 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">Growth Trends</h2>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Historical Tracking</span>
                </div>
              </div>
              <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                Monitor visibility shifts and market share momentum over time. Analyze how model updates and content changes impact your competitive standing.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1 bg-zinc-900/50 px-4 py-2 rounded-2xl border border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Dataset</span>
            <span className="text-sm font-bold text-zinc-200">{runCount} Historical Runs</span>
          </div>
        </div>
      </div>

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
        />

        <StatCard
          label="Latest Snapshot"
          value={brandNowVisibility?.toFixed(1) ?? '—'}
          subtext={`${brandNowShare?.toFixed(1) ?? '—'}% Share • ${runCount} Runs`}
          icon={Clock}
          accent="violet"
          description={`Last analysis run on ${latestPoint?.date ? format(new Date(latestPoint.date), 'MMM dd, yyyy') : 'N/A'}`}
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
          />
        )}
      </div>


      {/* Trends Chart */}
      <SectionCard 
        title="Performance Trends" 
        description="Visualize visibility and market share shifts across multiple analysis runs."
        className="bg-[#111113]"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-auto">
              <TabsList className="bg-zinc-900 border border-zinc-800 p-1 h-9">
                <TabsTrigger value="visibility" className="text-[10px] font-bold uppercase tracking-wider px-4 data-[state=active]:bg-zinc-800 data-[state=active]:text-white transition-all">Visibility</TabsTrigger>
                <TabsTrigger value="share" className="text-[10px] font-bold uppercase tracking-wider px-4 data-[state=active]:bg-zinc-800 data-[state=active]:text-white transition-all">Market Share</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mr-2">Legend:</div>
              {series.map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSeries(s.key)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[10px] font-bold uppercase tracking-tighter transition-all duration-300',
                    hidden[s.key]
                      ? 'border-zinc-800 bg-zinc-900/30 text-zinc-600 hover:bg-zinc-900/50'
                      : 'border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:border-zinc-600 shadow-lg shadow-black/20',
                  )}
                  type="button"
                >
                  <div className={cn("h-1.5 w-1.5 rounded-full transition-all", hidden[s.key] ? "bg-zinc-800" : "")} style={{ backgroundColor: hidden[s.key] ? undefined : s.color }} />
                  <span className="max-w-32 truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-[400px] w-full bg-zinc-950/40 rounded-3xl border border-zinc-800/50 p-6 relative overflow-hidden group/chart">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[40px] -mr-16 -mt-16 opacity-0 group-hover/chart:opacity-100 transition-opacity" />
            
            <ResponsiveContainer width="100%" height="100%">
              {activeTab === 'visibility' ? (
                <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#52525b" 
                    fontSize={10} 
                    fontWeight="bold"
                    tickLine={false} 
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="#52525b" 
                    fontSize={10} 
                    fontWeight="bold"
                    tickLine={false} 
                    axisLine={false} 
                    domain={[0, 100]} 
                    dx={-10}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b0b0f',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '16px',
                      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)',
                      padding: '12px'
                    }}
                    labelStyle={{ color: '#71717a', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}
                    itemStyle={{ padding: '2px 0' }}
                    formatter={(value: any, name: any, item: any) => {
                      const s = series.find((x) => x.key === item?.dataKey)
                      const mentions = item?.payload?.[`${item?.dataKey}_mentions`]
                      const label = s?.label ?? String(name)
                      return [
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-white">{Number(value ?? 0).toFixed(1)}</span>
                          {Number.isFinite(mentions) && (
                            <span className="text-[10px] font-bold text-zinc-500 uppercase">{mentions} Mentions</span>
                          )}
                        </div>,
                        <span className="text-[11px] font-medium text-zinc-400">{label}</span>
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
                        dot={{ r: 4, fill: s.color, strokeWidth: 2, stroke: '#0b0b0f' }}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#52525b" 
                    fontSize={10} 
                    fontWeight="bold"
                    tickLine={false} 
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="#52525b" 
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
                      backgroundColor: '#0b0b0f',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '16px',
                      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)',
                      padding: '12px'
                    }}
                    labelStyle={{ color: '#71717a', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}
                    formatter={(value: any, name: any, item: any) => {
                      const rawKey = String(item?.dataKey || '')
                      const baseKey = rawKey.replace(/_share$/, '')
                      const s = series.find((x) => x.key === baseKey)
                      const label = s?.label ?? String(name)
                      return [
                        <span className="text-sm font-bold text-white">{Number(value ?? 0).toFixed(1)}%</span>,
                        <span className="text-[11px] font-medium text-zinc-400">{label}</span>
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
                        dot={{ r: 4, fill: s.color, strokeWidth: 2, stroke: '#0b0b0f' }}
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

      {canComputeDelta && (topMovers.length > 0 || competitorChanges.length > 0 || promptSwings.length > 0) ? (
        <SectionCard 
          title="Market Momentum & Emerging Shifts" 
          description="Identify competitors with the highest visibility gains and analyze recent prompt winner shifts."
          className="bg-[#111113]"
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Top Movers */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-3">
                <Rocket className="w-3.5 h-3.5 text-emerald-400" /> Top Movers (Visibility)
              </div>
              <div className="space-y-3">
                {topMovers.map((m) => (
                  <div key={m.name} className="group flex items-center justify-between p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-300">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-xl shrink-0", m.visibilityDelta > 0 ? "bg-emerald-500/10" : "bg-rose-500/10")}>
                        {m.visibilityDelta > 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-zinc-100 truncate max-w-[120px]">{m.name}</div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">Score: {m.currentVisibility.toFixed(1)}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className={cn("text-sm font-bold font-mono", m.visibilityDelta > 0 ? "text-emerald-400" : "text-rose-400")}>
                        {formatSigned(m.visibilityDelta)} pts
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Competitor Changes */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-3">
                <Activity className="w-3.5 h-3.5 text-blue-400" /> Competitor Status
              </div>
              <div className="space-y-3">
                {competitorChanges.length > 0 ? (
                  competitorChanges.slice(0, 5).map((c, idx) => (
                    <div key={idx} className="group flex items-center justify-between p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-300">
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-xl shrink-0", 
                          c.status === 'rising' || c.status === 'new' ? "bg-emerald-500/10" : 
                          c.status === 'falling' || c.status === 'missing' ? "bg-rose-500/10" : "bg-zinc-800/50"
                        )}>
                          {c.status === 'rising' || c.status === 'new' ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : 
                           c.status === 'falling' || c.status === 'missing' ? <TrendingDown className="w-4 h-4 text-rose-400" /> : 
                           <Zap className="w-4 h-4 text-zinc-400" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-zinc-100 truncate max-w-[120px]">{c.name}</div>
                          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter capitalize">{c.status}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("border-0 text-[10px] font-bold uppercase", 
                        c.status === 'rising' || c.status === 'new' ? "bg-emerald-500/10 text-emerald-400" : 
                        c.status === 'falling' || c.status === 'missing' ? "bg-rose-500/10 text-rose-400" : "bg-zinc-800 text-zinc-500"
                      )}>
                        {formatSigned(c.delta_market_share)}% Share
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20">
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest text-center px-6">No major status changes</p>
                  </div>
                )}
              </div>
            </div>

            {/* Prompt Swings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800 pb-3">
                <Swords className="w-3.5 h-3.5 text-amber-400" /> Recent Prompt Swings
              </div>
              <div className="space-y-3">
                {promptSwings.length > 0 ? (
                  promptSwings.slice(0, 5).map((p, idx) => (
                    <div key={idx} className="group p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-300">
                      <div className="text-[11px] font-bold text-zinc-100 mb-2 truncate" title={p.prompt}>{p.prompt}</div>
                      <div className="flex items-center gap-2">
                        <div className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[9px] font-bold text-zinc-400 uppercase">{p.from}</div>
                        <ChevronRight className="w-3 h-3 text-zinc-600" />
                        <div className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 uppercase">{p.to}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20">
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest text-center px-6">No winner swings detected</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}
