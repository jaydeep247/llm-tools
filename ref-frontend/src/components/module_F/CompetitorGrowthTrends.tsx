'use client'

import { type ModuleFMetricRecommendation, useGetModuleFTrendsQuery, useGetModuleFResultQuery } from '@/store/api/module_F/moduleFApi'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TrendingUp, TrendingDown, LineChart as LineChartIcon, Activity, Calendar, Info } from 'lucide-react'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useCallback, useMemo, useState } from 'react'
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
  const visibilityRec = normalizeMetricRecommendation(latestResult?.data?.recommendations?.visibility_score)
  const shareRec = normalizeMetricRecommendation(latestResult?.data?.recommendations?.market_share)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-75 w-full rounded-xl" />
        <Skeleton className="h-75 w-full rounded-xl" />
      </div>
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
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#111113] border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              Visibility Change
              {visibilityRec && (
                <TooltipProvider>
                  <UiTooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-w-xs text-xs p-3">
                      {visibilityRec.why && (
                        <>
                          <div className="font-medium text-zinc-100 mb-1">Why this</div>
                          <div className="text-zinc-300">{visibilityRec.why}</div>
                        </>
                      )}
                      <div className={cn('font-medium text-zinc-100', visibilityRec.why ? 'mt-3 mb-1' : 'mb-1')}>
                        How to improve
                      </div>
                      <div className="text-zinc-300">{visibilityRec.fix}</div>
                    </TooltipContent>
                  </UiTooltip>
                </TooltipProvider>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-zinc-100">
                {canComputeDelta && brandVisibilityChangePct !== null
                  ? `${formatSigned(brandVisibilityChangePct)}%`
                  : (brandNowVisibility !== null ? brandNowVisibility.toFixed(1) : '—')}
              </span>
              {canComputeDelta && brandVisibilityChangePct !== null ? (
                brandVisibilityChangePct >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                )
              ) : null}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {canComputeDelta ? 'vs previous run' : 'Current visibility'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[#111113] border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              Market Share Change
              {shareRec && (
                <TooltipProvider>
                  <UiTooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-w-xs text-xs p-3">
                      {shareRec.why && (
                        <>
                          <div className="font-medium text-zinc-100 mb-1">Why this</div>
                          <div className="text-zinc-300">{shareRec.why}</div>
                        </>
                      )}
                      <div className={cn('font-medium text-zinc-100', shareRec.why ? 'mt-3 mb-1' : 'mb-1')}>
                        How to improve
                      </div>
                      <div className="text-zinc-300">{shareRec.fix}</div>
                    </TooltipContent>
                  </UiTooltip>
                </TooltipProvider>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-zinc-100">
                {canComputeDelta && brandMarketShareChange !== null
                  ? `${formatSigned(brandMarketShareChange)}%`
                  : (brandNowShare !== null ? `${brandNowShare.toFixed(1)}%` : '—')}
              </span>
              {canComputeDelta && brandMarketShareChange !== null ? (
                brandMarketShareChange >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                )
              ) : null}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {canComputeDelta ? 'vs previous run' : 'Current market share'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[#111113] border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Latest Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-zinc-100">{brandNowVisibility?.toFixed(1) ?? '—'}</span>
                  <span className="text-xs text-zinc-500">visibility</span>
                  <span className="text-xs text-zinc-500">•</span>
                  <span className="text-sm font-semibold text-zinc-200">{brandNowShare?.toFixed(1) ?? '—'}%</span>
                  <span className="text-xs text-zinc-500">share</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="truncate">
                    {latestPoint?.date ? format(new Date(latestPoint.date), 'MMM dd, yyyy • HH:mm') : '—'}
                  </span>
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <Badge variant="outline" className="border-zinc-700 text-zinc-400 bg-zinc-900/40">
                  Runs: {runCount}
                </Badge>
                {brandNowMentions !== null ? (
                  <span className="text-xs text-zinc-500">Mentions: {brandNowMentions}</span>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Trends Chart */}
      <Card className="bg-[#111113] border-zinc-800">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <LineChartIcon className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-zinc-100">Growth Trends</CardTitle>
              </div>
              <CardDescription className="text-zinc-400">
                Track visibility and market share across runs (dots show each run).
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {series.map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSeries(s.key)}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors',
                    hidden[s.key]
                      ? 'border-zinc-800 bg-zinc-900/30 text-zinc-500 hover:bg-zinc-900/50'
                      : 'border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-900/80',
                  )}
                  type="button"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="max-w-45 truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="visibility">
            <TabsList className="bg-zinc-900/50 border border-zinc-800">
              <TabsTrigger value="visibility" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400">
                Visibility
              </TabsTrigger>
              <TabsTrigger value="share" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400">
                Market Share
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visibility" className="mt-4">
              <div className="h-95 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0b0b0f',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '12px',
                      }}
                      labelStyle={{ color: '#e4e4e7' }}
                      itemStyle={{ color: '#e4e4e7' }}
                      formatter={(value: any, name: any, item: any) => {
                        const s = series.find((x) => x.key === item?.dataKey)
                        const mentions = item?.payload?.[`${item?.dataKey}_mentions`]
                        const label = s?.label ?? String(name)
                        const extra = Number.isFinite(mentions) ? ` • mentions ${mentions}` : ''
                        return [`${Number(value ?? 0).toFixed(1)}${extra}`, label]
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
                          strokeWidth={s.kind === 'brand' ? 2.6 : 2}
                          dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                      ),
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="share" className="mt-4">
              <div className="h-95 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0b0b0f',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '12px',
                      }}
                      labelStyle={{ color: '#e4e4e7' }}
                      itemStyle={{ color: '#e4e4e7' }}
                      formatter={(value: any, name: any, item: any) => {
                        const rawKey = String(item?.dataKey || '')
                        const baseKey = rawKey.replace(/_share$/, '')
                        const s = series.find((x) => x.key === baseKey)
                        const label = s?.label ?? String(name)
                        return [`${Number(value ?? 0).toFixed(1)}%`, label]
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
                          strokeWidth={s.kind === 'brand' ? 2.6 : 2}
                          strokeDasharray={s.kind === 'brand' ? undefined : '6 6'}
                          dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                        />
                      ),
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {canComputeDelta && topMovers.length > 0 ? (
        <Card className="bg-[#111113] border-zinc-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-zinc-100">Top Movers (Last Run)</CardTitle>
            </div>
            <CardDescription className="text-zinc-400">
              Biggest visibility changes compared to the previous run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topMovers.map((m) => (
                <div key={m.name} className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-100 truncate">{m.name}</div>
                    <div className="text-xs text-zinc-500">
                      Visibility {m.currentVisibility.toFixed(1)} • Share {m.currentShare.toFixed(1)}%
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <div className={cn('text-sm font-semibold', m.visibilityDelta >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {formatSigned(m.visibilityDelta, 1)}
                    </div>
                    <div className="text-xs text-zinc-500">{formatSigned(m.shareDelta, 1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-[#111113] border-zinc-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            <CardTitle className="text-zinc-100">Emerging Trends</CardTitle>
          </div>
          <CardDescription className="text-zinc-400">
            Changes detected in the latest run
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(!competitorChanges.length && !promptSwings.length) ? (
              <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-4">
                No emerging patterns detected in this run.
              </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {emerging?.summary ? (
                <div className="lg:col-span-2 -mt-2 mb-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                    Trends: {emerging.summary.trends_detected}
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                    Avg Δ Visibility: {formatSigned(emerging.summary.avg_visibility_delta, 1)}
                  </Badge>
                  <Badge className={
                    emerging.summary.threat_level === 'high'
                      ? 'bg-rose-500/15 text-rose-400 border-rose-600/30'
                      : emerging.summary.threat_level === 'medium'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-600/30'
                      : 'bg-emerald-500/15 text-emerald-400 border-emerald-600/30'
                  }>
                    {emerging.summary.threat_level} threat
                  </Badge>
                </div>
              ) : null}
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-400 mb-3">Competitor Changes</div>
                <div className="space-y-2">
                  {competitorChanges.slice(0, 6).map((c) => {
                    const up = c.delta_visibility >= 0
                    const color =
                      c.status === 'rising' || c.status === 'new'
                        ? 'text-emerald-400'
                        : c.status === 'falling' || c.status === 'missing'
                        ? 'text-rose-400'
                        : 'text-zinc-400'
                    const badgeClass =
                      c.status === 'rising' || c.status === 'new'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-600/30'
                        : c.status === 'falling' || c.status === 'missing'
                        ? 'bg-rose-500/15 text-rose-400 border-rose-600/30'
                        : 'bg-zinc-900/50 text-zinc-400 border-zinc-700'
                    return (
                      <div key={c.name} className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-100 truncate">{c.name}</div>
                          <div className="text-xs text-zinc-500">Visibility {formatSigned(c.delta_visibility, 1)} • Share {formatSigned(c.delta_market_share, 1)}%</div>
                        </div>
                        <Badge variant="outline" className={badgeClass}>
                          {c.status}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-400 mb-3">Prompt Swings</div>
                {promptSwings.length ? (
                  <div className="space-y-2">
                    {promptSwings.slice(0, 6).map((p, idx) => (
                      <div key={idx} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
                        <div className="text-xs text-zinc-400 mb-1 truncate">{p.prompt}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-zinc-700 text-zinc-300">{p.from}</Badge>
                          <span className="text-xs text-zinc-500">→</span>
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-600/30">{p.to}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-xl p-4">No prompt winner changes detected.</div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
