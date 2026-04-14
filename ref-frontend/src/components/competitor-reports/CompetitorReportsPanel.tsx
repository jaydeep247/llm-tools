'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  BarChart3,
  ChevronDown,
  Download,
  ExternalLink,
  LineChart,
  Loader2,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModuleFResult } from '@/store/api/module_F/moduleFApi'
import { resolveGapAnalysis, useGetModuleFTrendsQuery } from '@/store/api/module_F/moduleFApi'
import { useGetCompetitorReportQuery } from '@/store/api/competitorReportsApi'
import { useAppSelector } from '@/store/hooks'
import { selectDateRangePreset } from '@/store/slices/dateRangeSlice'
import { DateRangeToggle } from '@/components/date-range/DateRangeToggle'

interface CompetitorReportsPanelProps {
  jobId?: string | null
  projectId?: string | null
  data?: ModuleFResult | null
  isLoading?: boolean
  onNavigate?: (tab: string) => void
}

type SortKey = 'name' | 'sov' | 'sovDelta' | 'citations' | 'citationDelta'

const CHART_W = 720
const CHART_H = 200
const TREND_COLORS = ['#f59e0b', '#10b981', '#60a5fa', '#f472b6', '#22d3ee', '#a78bfa']

const CARD_CLASS =
  'rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-[#191919] to-[#121212] shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-sm'

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function formatSigned(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`
}

// IMPORTANT: For competitor deltas, positive = they are gaining = BAD for us = RED
// This is INVERTED from the customer's own metrics (PDF spec section 07)
function competitorDeltaClass(delta: number): string {
  if (delta > 0) return 'text-rose-300'   // competitor gained — bad for us
  if (delta < 0) return 'text-emerald-300' // competitor lost — good for us
  return 'text-zinc-400'
}

function competitorDeltaIcon(delta: number) {
  if (delta > 0) return <TrendingUp className="h-3 w-3 text-rose-400 inline" />
  if (delta < 0) return <TrendingDown className="h-3 w-3 text-emerald-400 inline" />
  return null
}

export default function CompetitorReportsPanel({
  jobId,
  projectId,
  data,
  isLoading = false,
  onNavigate,
}: CompetitorReportsPanelProps) {
  const params = useParams()
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

  // Read period from global Redux store — updated by DateRangeToggle
  const period = useAppSelector((s: any) => selectDateRangePreset(s))

  const effectiveProjectId = (projectId || (params?.projectId as string) || '').trim()

  // Competitor reports API uses project_id (NOT jobId)
  const { data: reportData, isLoading: isLoadingReport } = useGetCompetitorReportQuery(
    { projectId: effectiveProjectId, period },
    { skip: !effectiveProjectId, refetchOnMountOrArgChange: true },
  )

  const { data: trendsResponse } = useGetModuleFTrendsQuery(jobId || '', { skip: !jobId })

  // Merge API report rows with any module_F data
  const compare = data?.compare_visibility_against_competitors
  const competitorRows = reportData?.competitors ?? compare?.competitors ?? []
  const wins = data?.competitor_wins
  const opportunities = resolveGapAnalysis(data)
  const changes = data?.emerging_trends?.competitor_changes ?? []
  const trendHistory = trendsResponse?.data?.history ?? []

  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<SortKey>('sov')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [activePrompt, setActivePrompt] = useState<number | null>(null)
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({})

  const allCompetitors = useMemo(
    () => competitorRows.map((c: any) => c.name).filter(Boolean),
    [competitorRows],
  )
  const selectedSet = new Set(
    selectedCompetitors.length > 0 ? selectedCompetitors : allCompetitors,
  )
  const filteredCompetitors = competitorRows.filter((c: any) => selectedSet.has(c.name))
  const promptRows = (wins?.detailed_results ?? []).slice(0, 20)
  const hasData =
    filteredCompetitors.length > 0 ||
    promptRows.length > 0 ||
    opportunities.length > 0 ||
    trendHistory.length > 0

  const loadingCombined = isLoading || isLoadingReport

  // No prior job — show insufficient data state
  const noPriorJob = !loadingCombined && reportData?.meta?.prior_job_id === ''
  const showSnapshotNotice = noPriorJob && filteredCompetitors.length > 0

  const primaryModelByCompetitor = useMemo(() => {
    const out: Record<string, string> = {}
    for (const row of filteredCompetitors) {
      const best = Object.entries((row as any).per_model || {}).sort(
        (a, b) =>
          num((b[1] as any)?.citations ?? (b[1] as any)?.mentions) -
          num((a[1] as any)?.citations ?? (a[1] as any)?.mentions),
      )[0]
      out[row.name] = best?.[0] || 'n/a'
    }
    return out
  }, [filteredCompetitors])

  const tableRows = useMemo(() => {
    const rows = filteredCompetitors.map((c) => {
      const trendDelta = changes.find((x) => x.name === c.name)
      return {
        name: c.name,
        model: primaryModelByCompetitor[c.name] || 'n/a',
        sov: num((c as any).sov_avg_percent ?? (c as any).share_of_voice),
        sovDelta: num((c as any).sov_delta_avg ?? trendDelta?.delta_market_share),
        citations: num(
          (c as any).citations_total ?? (c as any).citation_count ?? (c as any).mentions_total,
        ),
        citationDelta: num(
          (c as any).citations_delta_total ?? trendDelta?.delta_visibility,
        ),
      }
    })
    return rows.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortBy === 'name') return a.name.localeCompare(b.name) * dir
      return (num(a[sortBy]) - num(b[sortBy])) * dir
    })
  }, [filteredCompetitors, changes, primaryModelByCompetitor, sortBy, sortDir])

  const gapRows = useMemo(
    () =>
      opportunities
        .flatMap((g) =>
          (g.opportunities ?? []).map((o) => ({
            competitor: g.competitor,
            prompt: o.prompt,
            score: num(o.opportunityScore),
          })),
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, 10),
    [opportunities],
  )

  const topPages = useMemo(() => {
    const blocks = reportData?.top_pages ?? []
    const byName: Record<string, any> = {}
    for (const b of blocks) byName[b.name] = b
    return filteredCompetitors.map((c: any) => {
      const b = byName[c.name]
      const urls = Array.isArray(b?.pages)
        ? b.pages.map((p: any) => ({ url: String(p.url), citation_count: p.citation_count, primary_model: p.primary_model })).slice(0, 5)
        : (c.cited_urls ?? []).slice(0, 5).map((u: string) => ({ url: u }))
      return {
        name: c.name,
        primaryModel: primaryModelByCompetitor[c.name] || 'n/a',
        citations: num(c.citations_total ?? c.citation_count ?? c.mentions_total),
        urls,
      }
    })
  }, [filteredCompetitors, primaryModelByCompetitor, reportData])

  const trendData = useMemo(() => {
    const labels = trendHistory.map((h) => h.date.slice(5))
    const brand = trendHistory.map((h) => num(h.brand.market_share_percent))
    const competitorMap: Record<string, number[]> = {}
    for (const point of trendHistory) {
      for (const c of point.competitors ?? []) {
        if (!selectedSet.has(c.name)) continue
        if (!competitorMap[c.name]) competitorMap[c.name] = []
      }
    }
    for (const point of trendHistory) {
      for (const name of Object.keys(competitorMap)) {
        const found = (point.competitors ?? []).find((c) => c.name === name)
        competitorMap[name].push(num(found?.market_share_percent))
      }
    }
    return { labels, brand, competitorMap }
  }, [trendHistory, selectedSet])

  const allVals = [...trendData.brand, ...Object.values(trendData.competitorMap).flat()]
  const minV = Math.min(0, ...allVals)
  const maxV = Math.max(10, ...allVals)
  const span = Math.max(1, maxV - minV)

  const linePath = (vals: number[]) =>
    vals
      .map((v, i) => {
        const x = (i / Math.max(1, vals.length - 1)) * CHART_W
        const y = CHART_H - ((v - minV) / span) * CHART_H
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')

  const setSort = (k: SortKey) => {
    if (sortBy === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(k); setSortDir('desc') }
  }

  const toggleCompetitor = (name: string) =>
    setSelectedCompetitors((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    )

  const toggleSeries = (name: string) =>
    setHiddenSeries((prev) => ({ ...prev, [name]: !prev[name] }))

  const buildExportUrl = (kind: 'pdf' | 'csv') => {
    if (!jobId) return null
    if (kind === 'pdf') return `${apiBase}/export/pdf/competitor-report?job_id=${encodeURIComponent(jobId)}`
    return `${apiBase}/export/csv/competitors?job_id=${encodeURIComponent(jobId)}`
  }

  const sortIndicator = (k: SortKey) =>
    sortBy === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  return (
    <div className="space-y-6 animate-fade-in-hero pb-2">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-violet-400/20 bg-violet-400/10 text-[11px] text-violet-200 mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              Competitive Intelligence Dashboard
            </div>
            <h2 className="text-2xl md:text-[30px] font-bold text-white tracking-tight">
              Competitor Reports
            </h2>
            <p className="text-zinc-400 text-sm mt-1">
              Track competitor share, prompt wins, top pages, and growth trends in one place.
            </p>
          </div>
          {/* Global period toggle */}
          <DateRangeToggle />
        </div>

        {/* Comparison label from meta */}
        {reportData?.meta?.compared_to_label && (
          <p className="text-[12px] text-zinc-500">
            {reportData.meta.compared_to_label}
          </p>
        )}
      </div>

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={cn(CARD_CLASS, 'p-4')}>
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Users className="h-3.5 w-3.5 text-cyan-300" /> Active competitors
          </div>
          <div className="text-2xl font-bold text-white mt-2">{filteredCompetitors.length}</div>
        </div>
        <div className={cn(CARD_CLASS, 'p-4')}>
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Target className="h-3.5 w-3.5 text-amber-300" /> Tracked prompts
          </div>
          <div className="text-2xl font-bold text-white mt-2">{promptRows.length}</div>
        </div>
        <div className={cn(CARD_CLASS, 'p-4')}>
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-300" /> Trend snapshots
          </div>
          <div className="text-2xl font-bold text-white mt-2">{trendHistory.length}</div>
        </div>
      </div>

      {/* ── Competitor selector ──────────────────────────────────────────── */}
      <div className={cn(CARD_CLASS, 'p-4 md:p-5 relative z-40')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <span className="text-[11px] text-zinc-500 uppercase tracking-[0.14em] font-semibold">
              Competitor Selector
            </span>
            <p className="text-xs text-zinc-500 mt-1">
              Pick competitors to filter every block in this report.
            </p>
          </div>
          <div className="text-[11px] text-zinc-500">
            {allCompetitors.length > 0
              ? `${allCompetitors.length} tracked`
              : 'No competitors tracked'}
          </div>
        </div>
        <div className="relative mt-2 inline-block z-30">
          <button
            onClick={() => setSelectorOpen((v) => !v)}
            disabled={allCompetitors.length === 0}
            className="px-3 py-2 rounded-lg border border-zinc-700/60 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800/70 text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {selectedCompetitors.length === 0
              ? 'All competitors selected'
              : `${selectedCompetitors.length} selected`}
            <ChevronDown className="h-4 w-4" />
          </button>
          {selectorOpen && (
            <div className="mt-2 w-72 rounded-xl border border-zinc-700 bg-zinc-900/95 backdrop-blur-md p-3 shadow-xl absolute z-50">
              {allCompetitors.map((name) => (
                <label key={name} className="flex items-center gap-2 text-sm text-zinc-200 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(name)}
                    onChange={() => toggleCompetitor(name)}
                    className="accent-amber-400"
                  />
                  {name}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loadingCombined && (
        <div className={cn(CARD_CLASS, 'p-8 text-center text-zinc-400')}>
          <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
          Loading competitor report...
        </div>
      )}

      {showSnapshotNotice && (
        <div className={cn(CARD_CLASS, 'p-5')}>
          <p className="text-zinc-200 font-medium">Showing current competitor snapshot</p>
          <p className="text-zinc-500 text-sm mt-1">
            This is your first completed analysis in the selected period. Current competitor data
            is available now, and deltas will appear automatically after a later comparison run.
          </p>
        </div>
      )}

      {/* ── No prior job / insufficient data ────────────────────────────── */}
      {noPriorJob && !hasData && (
        <div className={cn(CARD_CLASS, 'p-10 text-center')}>
          <p className="text-zinc-300 font-medium">Comparison data not yet available</p>
          <p className="text-zinc-500 text-sm mt-1">
            Your first run has finished, but no competitor snapshot data was found yet for this
            period. Run analysis again after competitor tracking is configured to see changes.
          </p>
        </div>
      )}

      {/* ── No competitors added ─────────────────────────────────────────── */}
      {!loadingCombined && !noPriorJob && !hasData && (
        <div className={cn(CARD_CLASS, 'p-10 text-center')}>
          <p className="text-zinc-300 font-medium">No competitor data yet</p>
          <p className="text-zinc-500 text-sm mt-1">
            Add competitor domains in the Competitors module to start tracking their AI
            visibility.
          </p>
          {onNavigate && (
            <button
              onClick={() => onNavigate('visibility-comparision')}
              className="mt-4 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-300 text-sm font-semibold hover:bg-amber-500/25 transition-all"
            >
              Add Competitor
            </button>
          )}
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {!loadingCombined && hasData && (
        <>
          {/* SoV Comparison Table */}
          <div className={cn(CARD_CLASS, 'p-4 md:p-5 overflow-x-auto')}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">SoV Comparison Table</h3>
                <p className="text-xs text-zinc-500">
                  Compare share-of-voice and citation movement.
                  <span className="ml-2 text-[10px] text-zinc-600">
                    ↑ red = competitor gaining | ↓ green = competitor losing
                  </span>
                </p>
              </div>
              <span className="text-[11px] px-2 py-1 rounded-full border border-zinc-700 text-zinc-400 shrink-0">
                Sortable
              </span>
            </div>
            <table className="min-w-full text-sm">
              <thead className="text-zinc-500 border-b border-zinc-800/80">
                <tr>
                  <th
                    className="text-left py-2 pr-3 cursor-pointer hover:text-zinc-300 transition-colors"
                    onClick={() => setSort('name')}
                  >
                    Competitor{sortIndicator('name')}
                  </th>
                  <th className="text-left py-2 pr-3">Primary Model</th>
                  <th
                    className="text-left py-2 pr-3 cursor-pointer hover:text-zinc-300 transition-colors"
                    onClick={() => setSort('sov')}
                  >
                    SoV %{sortIndicator('sov')}
                  </th>
                  <th
                    className="text-left py-2 pr-3 cursor-pointer hover:text-zinc-300 transition-colors"
                    onClick={() => setSort('sovDelta')}
                  >
                    SoV Δ{sortIndicator('sovDelta')}
                  </th>
                  <th
                    className="text-left py-2 pr-3 cursor-pointer hover:text-zinc-300 transition-colors"
                    onClick={() => setSort('citations')}
                  >
                    Citations{sortIndicator('citations')}
                  </th>
                  <th
                    className="text-left py-2 cursor-pointer hover:text-zinc-300 transition-colors"
                    onClick={() => setSort('citationDelta')}
                  >
                    Citation Δ{sortIndicator('citationDelta')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr
                    key={row.name}
                    className="border-b border-zinc-900/70 hover:bg-zinc-900/45 transition-colors"
                  >
                    <td className="py-2 pr-3 text-zinc-200 font-medium">{row.name}</td>
                    <td className="py-2 pr-3 text-zinc-400 text-xs">{row.model}</td>
                    <td className="py-2 pr-3 text-zinc-300">{row.sov.toFixed(1)}%</td>
                    {/* Inverted: competitor SoV gain = red (bad for us) */}
                    <td className={cn('py-2 pr-3 text-xs font-semibold', competitorDeltaClass(row.sovDelta))}>
                      <span className="inline-flex items-center gap-1">
                        {competitorDeltaIcon(row.sovDelta)}
                        {formatSigned(row.sovDelta)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-zinc-300">{row.citations}</td>
                    {/* Inverted: competitor citation gain = red */}
                    <td className={cn('py-2 text-xs font-semibold', competitorDeltaClass(row.citationDelta))}>
                      <span className="inline-flex items-center gap-1">
                        {competitorDeltaIcon(row.citationDelta)}
                        {formatSigned(row.citationDelta)}
                      </span>
                    </td>
                  </tr>
                ))}
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-zinc-500 text-sm">
                      No competitor data for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Prompt Win/Loss Matrix */}
          {promptRows.length > 0 && (
            <div className={cn(CARD_CLASS, 'p-4 md:p-5 overflow-x-auto')}>
              <h3 className="text-sm font-semibold text-white mb-1">Prompt Win/Loss Matrix</h3>
              <p className="text-xs text-zinc-500 mb-3">
                See who appears in AI answers for your tracked prompts.
              </p>
              <table className="min-w-full text-xs">
                <thead className="text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="text-left py-2 pr-3">Prompt</th>
                    <th className="text-left py-2 pr-3">Your Brand</th>
                    {filteredCompetitors.map((c) => (
                      <th key={c.name} className="text-left py-2 pr-3">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {promptRows.map((row, idx) => {
                    const brandRank = (row as any).brand_rank
                    const brandStatus =
                      !brandRank || brandRank <= 0
                        ? 'NOT_CITED'
                        : brandRank <= 3
                        ? 'CITED'
                        : 'PARTIAL'
                    return (
                      <tr
                        key={`${row.prompt}-${idx}`}
                        className="border-b border-zinc-900/70 hover:bg-zinc-900/35 transition-colors"
                      >
                        <td className="py-2 pr-3 text-zinc-200 max-w-[320px] truncate">
                          {row.prompt}
                        </td>
                        <td className="py-2 pr-3">
                          <button
                            onClick={() => setActivePrompt(activePrompt === idx ? null : idx)}
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all',
                              brandStatus === 'CITED'
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : brandStatus === 'PARTIAL'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
                            )}
                          >
                            {brandStatus}
                          </button>
                        </td>
                        {filteredCompetitors.map((c) => {
                          const rankMap = ((row as any).ranks ?? (row as any).rankings ?? {}) as Record<string, number>
                          
                          // Helper to normalize keys for lookup
                          const normalize = (s: string) => s.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
                          const targetKey = normalize(c.name)
                          
                          // Try exact match then fuzzy match
                          let rank = rankMap[c.name]
                          if (rank === undefined) {
                            const foundKey = Object.keys(rankMap).find(k => normalize(k) === targetKey)
                            if (foundKey) rank = rankMap[foundKey]
                          }

                          const status =
                            !rank || rank <= 0
                              ? 'NOT_CITED'
                              : rank <= 3
                              ? 'CITED'
                              : 'PARTIAL'
                          return (
                            <td key={c.name} className="py-2 pr-3">
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                                  status === 'CITED'
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    : status === 'PARTIAL'
                                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                    : 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
                                )}
                              >
                                {status}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {activePrompt !== null && promptRows[activePrompt] && (
                <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="text-xs text-zinc-500">Response excerpt</p>
                  <p className="text-sm text-zinc-200 mt-1">
                    {(promptRows[activePrompt] as any).text_snippet ||
                      'No response text available for this prompt.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Opportunity Gaps + Top Pages */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Opportunity Gap List */}
            <div className={cn(CARD_CLASS, 'p-4 md:p-5')}>
              <h3 className="text-sm font-semibold text-white mb-1">Opportunity Gap List</h3>
              <p className="text-xs text-zinc-500 mb-3">
                High-impact prompts where competitors are currently winning.
              </p>
              {gapRows.length === 0 ? (
                <p className="text-zinc-500 text-sm">No high-priority opportunity gaps found yet.</p>
              ) : (
                <ul className="space-y-2">
                  {gapRows.map((g, i) => (
                    <li key={`${g.competitor}-${i}`} className="text-sm text-zinc-300 leading-6">
                      <span className="text-amber-300 font-semibold">{g.score.toFixed(1)}</span> —{' '}
                      {g.competitor}: {g.prompt}
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={() => onNavigate?.('gap-opportunities')}
                className="mt-3 text-xs text-amber-300 hover:text-amber-200 inline-flex items-center gap-1"
              >
                Open Gap Opportunities <ExternalLink className="h-3 w-3" />
              </button>
            </div>

            {/* Top Competitor Pages */}
            <div className={cn(CARD_CLASS, 'p-4 md:p-5')}>
              <h3 className="text-sm font-semibold text-white mb-1">Top Competitor Pages</h3>
              <p className="text-xs text-zinc-500 mb-3">
                Most-cited pages by competitor from the current analysis run.
              </p>
              {topPages.length === 0 ? (
                <p className="text-zinc-500 text-sm">No competitor pages found.</p>
              ) : (
                <div className="space-y-3">
                  {topPages.map((c) => (
                    <div
                      key={c.name}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                    >
                      <div className="text-xs text-zinc-500 mb-2 font-medium">
                        {c.name}
                        {c.primaryModel !== 'n/a' && (
                          <span className="ml-2 text-zinc-600">· {c.primaryModel}</span>
                        )}
                        {c.citations > 0 && (
                          <span className="ml-2 text-zinc-600">· {c.citations} citations</span>
                        )}
                      </div>
                      <ol className="space-y-1">
                        {c.urls.map((u: any, i: number) => (
                          <li
                            key={`${typeof u === 'string' ? u : u.url}-${i}`}
                            className="text-xs text-zinc-300 truncate leading-5"
                          >
                            <a
                              href={typeof u === 'string' ? u : u.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-zinc-100 transition-colors"
                            >
                              {i + 1}. {typeof u === 'string' ? u : u.url}
                            </a>
                            {typeof u === 'object' && u.citation_count > 0 && (
                              <span className="ml-2 text-zinc-600">
                                ({u.citation_count} cites · {u.primary_model})
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Growth Trend Chart */}
          <div className={cn(CARD_CLASS, 'p-4 md:p-5')}>
            <div className="flex items-center gap-2 mb-3">
              <LineChart className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold text-white">Competitor Growth Trend</h3>
            </div>
            {trendHistory.length < 2 ? (
              <p className="text-zinc-500 text-sm">Not enough trend data yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-2">
                  <svg
                    viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                    className="w-full min-w-[720px] h-[220px]"
                  >
                    {!hiddenSeries['Your Brand'] && (
                      <path
                        d={linePath(trendData.brand)}
                        fill="none"
                        stroke={TREND_COLORS[0]}
                        strokeWidth={2.4}
                        strokeLinecap="round"
                      />
                    )}
                    {Object.entries(trendData.competitorMap).map(([name, vals], i) =>
                      hiddenSeries[name] ? null : (
                        <path
                          key={name}
                          d={linePath(vals)}
                          fill="none"
                          stroke={TREND_COLORS[(i + 1) % TREND_COLORS.length]}
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                      ),
                    )}
                  </svg>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => toggleSeries('Your Brand')}
                    className={cn(
                      'px-2 py-1 rounded-full border text-xs transition-colors',
                      hiddenSeries['Your Brand']
                        ? 'text-zinc-500 border-zinc-700'
                        : 'text-zinc-200 border-zinc-600 bg-zinc-900/40',
                    )}
                  >
                    Your Brand
                  </button>
                  {Object.keys(trendData.competitorMap).map((name) => (
                    <button
                      key={name}
                      onClick={() => toggleSeries(name)}
                      className={cn(
                        'px-2 py-1 rounded-full border text-xs transition-colors',
                        hiddenSeries[name]
                          ? 'text-zinc-500 border-zinc-700'
                          : 'text-zinc-200 border-zinc-600 bg-zinc-900/40',
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-zinc-500">
                  Dates: {trendData.labels.join(', ')}
                </div>
              </>
            )}
          </div>

          {/* Export row */}
          <div className={cn(CARD_CLASS, 'p-4 md:p-5 flex items-center justify-between gap-3 flex-wrap')}>
            <div>
              <h3 className="text-sm font-semibold text-white">Download Full Report</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Export this report as PDF or CSV for stakeholder sharing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const url = buildExportUrl('pdf')
                  if (url) window.open(url, '_blank')
                }}
                disabled={!jobId}
                className="px-3 py-2 rounded-lg border border-zinc-700/60 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800/70 text-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>
              <button
                onClick={() => {
                  const url = buildExportUrl('csv')
                  if (url) window.open(url, '_blank')
                }}
                disabled={!jobId}
                className="px-3 py-2 rounded-lg border border-zinc-700/60 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800/70 text-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
