'use client'

import { useMemo, useState } from 'react'
import {
  Calendar,
  Download,
  Loader2,
  Mail,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { WeeklyReport, WeeklyReportData } from '@/store/api/weeklyReportsApi'
import {
  useGenerateWeeklyReportMutation,
  useGetWeeklyReportsQuery,
} from '@/store/api/weeklyReportsApi'

/* ==========================================================================
   Delta formatting helpers
   ========================================================================== */

function fmtDelta(v: number | null | undefined, suffix = ''): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}${suffix}`
}

function deltaClass(v: number | null | undefined, positiveGood = true): string {
  if (v === null || v === undefined || Number.isNaN(v) || v === 0) return 'text-zinc-500'
  const up = v > 0
  const good = positiveGood ? up : !up
  return good ? 'text-emerald-400' : 'text-rose-400'
}

/* ==========================================================================
   KPI card — null-safe, shows "—" not "0" when value is null
   ========================================================================== */
function KpiCard({
  label,
  value,
  delta,
  suffix = '',
  positiveGood = true,
}: {
  label: string
  value: number | null
  delta: number | null
  suffix?: string
  positiveGood?: boolean
}) {
  const displayValue = value !== null ? `${value.toFixed(value % 1 === 0 ? 0 : 1)}${suffix}` : '—'
  const dClass = deltaClass(delta, positiveGood)
  const isNeutral = delta === null || delta === undefined || delta === 0

  return (
    <div className="rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-[#191919] to-[#121212] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
      <p className="text-[11px] text-zinc-500 uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{displayValue}</p>
      {/* Only show delta row when we have a value to compare */}
      {delta !== null && (
        <p className={cn('text-sm mt-1 inline-flex items-center gap-1', dClass)}>
          {!isNeutral && (delta! > 0
            ? <TrendingUp className="h-3.5 w-3.5" />
            : <TrendingDown className="h-3.5 w-3.5" />
          )}
          {isNeutral && <Minus className="h-3.5 w-3.5" />}
          vs prior week {fmtDelta(delta, suffix)}
        </p>
      )}
    </div>
  )
}

/* ==========================================================================
   Main panel
   ========================================================================== */
export default function WeeklySummaryPanel({
  projectId,
  jobId,
  domainLabel,
  onNavigate,
}: {
  projectId: string
  jobId?: string | null
  domainLabel?: string
  onNavigate?: (section: string) => void
}) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

  const {
    data: reports = [],
    isLoading,
    isFetching,
    refetch,
  } = useGetWeeklyReportsQuery(
    { projectId, limit: 12 },
    { skip: !projectId },
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generateWeekly, { isLoading: isGenerating }] = useGenerateWeeklyReportMutation()

  // Default to most recent report; switch when user clicks history
  const activeReport: WeeklyReport | undefined = useMemo(() => {
    if (selectedId) return reports.find((r) => r.id === selectedId)
    return reports[0]
  }, [reports, selectedId])

  const d: WeeklyReportData | undefined = activeReport?.reportData

  const weekLabel = activeReport
    ? `Week of ${activeReport.weekStart} – ${activeReport.weekEnd}`
    : 'Weekly Summary'

  const exportUrl = (format: 'pdf' | 'csv') => {
    if (!activeReport) return null
    return `${apiBase}/reports/weekly/${encodeURIComponent(activeReport.id)}/export?format=${format}`
  }

  const onExport = (format: 'pdf' | 'csv') => {
    const url = exportUrl(format)
    if (url) window.open(url, '_blank')
  }

  const onGenerate = async () => {
    if (!jobId || !projectId) return
    try {
      const rep = await generateWeekly({ jobId, projectId }).unwrap()
      setSelectedId(rep.id)
      toast({ title: 'Report generated', description: 'Your weekly summary is ready.' })
    } catch {
      toast({
        title: 'Generation failed',
        description: 'Could not generate report. Please retry.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-hero pb-4">
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">

        {/* ── History sidebar ────────────────────────────────────────────── */}
        <aside className="w-full lg:w-56 shrink-0 space-y-2">
          <div className="flex items-center gap-2 text-yellow-400 text-xs font-semibold uppercase tracking-wide">
            <Calendar className="h-4 w-4" />
            Report history
          </div>
          <p className="text-xs text-zinc-500">Last 12 weeks</p>
          <div className="rounded-xl border border-zinc-800 bg-[#121212] p-2 max-h-[420px] overflow-y-auto space-y-1">
            {isLoading && (
              <div className="flex items-center gap-2 text-zinc-500 text-sm p-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
            {!isLoading && reports.length === 0 && (
              <p className="text-sm text-zinc-500 p-2">
                No reports yet. Run analysis, then click Generate now.
              </p>
            )}
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2 text-sm transition-colors',
                  activeReport?.id === r.id
                    ? 'bg-violet-950/80 text-white font-medium border border-violet-500/30'
                    : 'text-zinc-400 hover:bg-zinc-800/60 border border-transparent',
                )}
              >
                {r.weekStart} → {r.weekEnd}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Weekly Summary</h2>
              <p className="text-zinc-400 text-sm mt-1">{weekLabel}</p>
              {(domainLabel || d?.meta.domain_label) && (
                <p className="text-zinc-500 text-xs mt-0.5">
                  {domainLabel ?? d?.meta.domain_label}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!jobId || isGenerating}
                onClick={onGenerate}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                {isGenerating
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
                Generate now
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="px-3 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800/70 disabled:opacity-50 transition-colors"
              >
                Refresh list
              </button>
            </div>
          </div>

          {/* Generating banner */}
          {isGenerating && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating your weekly summary… This usually takes about 30 seconds.
              </span>
            </div>
          )}

          {/* No reports yet */}
          {!activeReport && !isLoading && (
            <div className="rounded-2xl border border-zinc-800 bg-[#121212] p-10 text-center text-zinc-400">
              No weekly report for this project yet. Run analysis then click{' '}
              <strong className="text-zinc-200">Generate now</strong>.
            </div>
          )}

          {/* Report body */}
          {d && (
            <>
              {/* First-week info banner (meta.is_first_week: true) */}
              {d.meta.is_first_week && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                  This is your first week report. Comparison data will appear from Week 2 onwards
                  once more snapshots exist.
                </div>
              )}

              {/* ── 4 KPI Cards ────────────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <KpiCard
                  label="AIVS Score"
                  value={d.aivs_score}
                  delta={d.aivs_delta}
                  positiveGood
                />
                <KpiCard
                  label="Health Score"
                  value={d.health_score}
                  delta={d.health_delta}
                  positiveGood
                />
                <KpiCard
                  label="Citations"
                  value={d.citation_count}
                  delta={d.citation_delta}
                  positiveGood
                />
                <KpiCard
                  label="SoV %"
                  value={d.sov_percent}
                  delta={d.sov_delta}
                  suffix="%"
                  positiveGood
                />
              </div>

              {/* ── Wins & Losses tables ────────────────────────────────── */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Wins */}
                <div className="rounded-2xl border border-zinc-800 bg-[#121212] p-4 overflow-x-auto">
                  <h3 className="text-sm font-semibold text-white mb-3">Top wins</h3>
                  <table className="min-w-full text-sm">
                    <thead className="text-zinc-500 border-b border-zinc-800">
                      <tr>
                        <th className="text-left py-2 pr-2">Metric</th>
                        <th className="text-left py-2 pr-2">Model</th>
                        <th className="text-right py-2 pr-2">Prev</th>
                        <th className="text-right py-2 pr-2">Now</th>
                        <th className="text-right py-2">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.wins.map((w, i) => (
                        <tr key={i} className="border-b border-zinc-900/80">
                          <td className="py-2 pr-2 text-zinc-200">{w.metric}</td>
                          <td className="py-2 pr-2 text-zinc-400 text-xs">{w.model}</td>
                          <td className="py-2 pr-2 text-right text-zinc-400">{w.previous.toFixed(1)}</td>
                          <td className="py-2 pr-2 text-right text-zinc-300">{w.current.toFixed(1)}</td>
                          <td className="py-2 text-right text-emerald-400 font-medium">
                            +{w.delta.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d.wins.length === 0 && (
                    <p className="text-zinc-500 text-sm py-3">No wins in this period.</p>
                  )}
                </div>

                {/* Losses */}
                <div className="rounded-2xl border border-zinc-800 bg-[#121212] p-4 overflow-x-auto">
                  <h3 className="text-sm font-semibold text-white mb-3">Top losses</h3>
                  <table className="min-w-full text-sm">
                    <thead className="text-zinc-500 border-b border-zinc-800">
                      <tr>
                        <th className="text-left py-2 pr-2">Metric</th>
                        <th className="text-left py-2 pr-2">Model</th>
                        <th className="text-right py-2 pr-2">Δ</th>
                        <th className="text-left py-2">Fix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.losses.map((w, i) => (
                        <tr key={i} className="border-b border-zinc-900/80">
                          <td className="py-2 pr-2 text-zinc-200">{w.metric}</td>
                          <td className="py-2 pr-2 text-zinc-400 text-xs">{w.model}</td>
                          <td className="py-2 pr-2 text-right text-rose-400 font-medium">
                            {w.delta.toFixed(1)}
                          </td>
                          <td className="py-2">
                            {w.fix_title && w.fix_link ? (
                              <button
                                type="button"
                                onClick={() => onNavigate?.(w.fix_link!)}
                                className="text-amber-300 hover:text-amber-200 text-xs underline text-left transition-colors"
                              >
                                {w.fix_title}
                              </button>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d.losses.length === 0 && (
                    <p className="text-zinc-500 text-sm py-3">No losses in this period.</p>
                  )}
                </div>
              </div>

              {/* ── Top cited pages ─────────────────────────────────────── */}
              <div className="rounded-2xl border border-zinc-800 bg-[#121212] p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Top cited pages</h3>
                {d.top_pages.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No cited URLs in the last 7 days.</p>
                ) : (
                  <ul className="space-y-2">
                    {d.top_pages.map((p, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                      >
                        <button
                          type="button"
                          onClick={() => onNavigate?.('ai-visibility-scorecards')}
                          className="text-cyan-300 hover:text-cyan-200 text-left truncate max-w-[min(100%,28rem)] transition-colors inline-flex items-center gap-1"
                        >
                          {p.url}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </button>
                        <span className="text-zinc-500 text-xs shrink-0">
                          {p.citations} cites · {p.primary_model}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Priority actions ────────────────────────────────────── */}
              <div className="rounded-2xl border border-zinc-800 bg-[#121212] p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Priority actions</h3>
                {d.recommendations.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No ranked recommendations for this job yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {d.recommendations.map((r, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => onNavigate?.(r.module_link)}
                          className="text-left w-full rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 hover:border-zinc-600 transition-colors"
                        >
                          <span className="text-zinc-100 font-medium text-sm">{r.action}</span>
                          <span className="block text-xs text-zinc-500 mt-1">
                            Impact: {r.impact} · Effort: {r.effort}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Competitor snapshot ─────────────────────────────────── */}
              <div className="rounded-2xl border border-zinc-800 bg-[#121212] p-4 overflow-x-auto">
                <h3 className="text-sm font-semibold text-white mb-3">Competitor snapshot</h3>
                {d.competitor_movements.length === 0 ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-4 text-sm text-zinc-500">
                    No competitor movement data.{' '}
                    <button
                      type="button"
                      onClick={() => onNavigate?.('visibility-comparision')}
                      className="text-amber-300 hover:text-amber-200 underline transition-colors"
                    >
                      Add competitors
                    </button>
                  </div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="text-zinc-500 border-b border-zinc-800">
                      <tr>
                        <th className="text-left py-2 pr-2">Competitor</th>
                        <th className="text-right py-2 pr-2">SoV Δ</th>
                        <th className="text-right py-2 pr-2">Prompts +</th>
                        <th className="text-right py-2">Prompts −</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.competitor_movements.map((c, i) => (
                        <tr key={i} className="border-b border-zinc-900/80">
                          <td className="py-2 pr-2 text-zinc-200">{c.name}</td>
                          <td
                            className={cn(
                              'py-2 pr-2 text-right',
                              c.sov_change === null
                                ? 'text-zinc-500'
                                : c.sov_change > 0
                                ? 'text-rose-400'   // competitor gaining — inverted colour
                                : 'text-emerald-400',
                            )}
                          >
                            {c.sov_change !== null ? fmtDelta(c.sov_change) : '—'}
                          </td>
                          <td className="py-2 pr-2 text-right text-emerald-400">
                            {c.prompts_gained}
                          </td>
                          <td className="py-2 text-right text-rose-400">{c.prompts_lost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* ── Export buttons ──────────────────────────────────────── */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onExport('pdf')}
                  disabled={!activeReport}
                  className="px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900/60 text-zinc-200 text-sm inline-flex items-center gap-2 disabled:opacity-50 hover:bg-zinc-800/70 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => onExport('csv')}
                  disabled={!activeReport}
                  className="px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900/60 text-zinc-200 text-sm inline-flex items-center gap-2 disabled:opacity-50 hover:bg-zinc-800/70 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() =>
                    toast({
                      title: 'Email report',
                      description:
                        'Weekly summary email sends when your account has weekly notifications enabled in preferences.',
                    })
                  }
                  className="px-3 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm inline-flex items-center gap-2 hover:bg-zinc-800/70 transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  Email report
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}