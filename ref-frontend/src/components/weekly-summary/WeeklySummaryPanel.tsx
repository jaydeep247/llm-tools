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
  return good ? 'text-emerald-600' : 'text-rose-600'
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
    <div className="rounded-2xl p-4" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--nd-text-secondary)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: 'var(--nd-text-primary)' }}>{displayValue}</p>
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
          <div className="flex items-center gap-2 text-amber-600 text-xs font-semibold uppercase tracking-wide">
            <Calendar className="h-4 w-4" />
            Report history
          </div>
          <p className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>Last 12 weeks</p>
          <div className="rounded-xl p-2 max-h-105 overflow-y-auto space-y-1" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
            {isLoading && (
              <div className="flex items-center gap-2 text-sm p-2" style={{ color: 'var(--nd-text-muted)' }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}
            {!isLoading && reports.length === 0 && (
              <p className="text-sm p-2" style={{ color: 'var(--nd-text-muted)' }}>
                No reports yet. Run analysis, then click Generate now.
              </p>
            )}
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className="w-full text-left rounded-lg px-3 py-2 text-sm transition-colors"
                style={activeReport?.id === r.id
                  ? { background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)', border: '1px solid var(--nd-purple)', fontWeight: 600 }
                  : { color: 'var(--nd-text-secondary)', border: '1px solid transparent' }
                }
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
              <h2 className="nd-page-title">Weekly Summary</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--nd-text-secondary)' }}>{weekLabel}</p>
              {(domainLabel || d?.meta.domain_label) && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--nd-text-muted)' }}>
                  {domainLabel ?? d?.meta.domain_label}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!jobId || isGenerating}
                onClick={onGenerate}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 transition-colors"
                style={{ background: 'var(--nd-purple)' }}
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
                className="px-3 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
                style={{ border: '1px solid var(--nd-border)', color: 'var(--nd-text-secondary)', background: 'var(--nd-card-bg)' }}
              >
                Refresh list
              </button>
            </div>
          </div>

          {/* Generating banner */}
          {isGenerating && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating your weekly summary… This usually takes about 30 seconds.
              </span>
            </div>
          )}

          {/* No reports yet */}
          {!activeReport && !isLoading && (
            <div className="rounded-2xl p-10 text-center" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)', color: 'var(--nd-text-secondary)' }}>
              No weekly report for this project yet. Run analysis then click{' '}
              <strong style={{ color: 'var(--nd-text-primary)' }}>Generate now</strong>.
            </div>
          )}

          {/* Report body */}
          {d && (
            <>
              {/* First-week info banner (meta.is_first_week: true) */}
              {d.meta.is_first_week && (
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
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
                <div className="rounded-2xl p-4 overflow-x-auto" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--nd-text-primary)' }}>Top wins</h3>
                  <table className="min-w-full text-sm">
                    <thead style={{ borderBottom: '1px solid var(--nd-border)' }}>
                      <tr style={{ color: 'var(--nd-text-secondary)' }}>
                        <th className="text-left py-2 pr-2">Metric</th>
                        <th className="text-left py-2 pr-2">Model</th>
                        <th className="text-right py-2 pr-2">Prev</th>
                        <th className="text-right py-2 pr-2">Now</th>
                        <th className="text-right py-2">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.wins.map((w, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--nd-border)' }}>
                          <td className="py-2 pr-2" style={{ color: 'var(--nd-text-primary)' }}>{w.metric}</td>
                          <td className="py-2 pr-2 text-xs" style={{ color: 'var(--nd-text-secondary)' }}>{w.model}</td>
                          <td className="py-2 pr-2 text-right" style={{ color: 'var(--nd-text-secondary)' }}>{w.previous.toFixed(1)}</td>
                          <td className="py-2 pr-2 text-right" style={{ color: 'var(--nd-text-primary)' }}>{w.current.toFixed(1)}</td>
                          <td className="py-2 text-right text-emerald-600 font-medium">
                            +{w.delta.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d.wins.length === 0 && (
                    <p className="text-sm py-3" style={{ color: 'var(--nd-text-muted)' }}>No wins in this period.</p>
                  )}
                </div>

                {/* Losses */}
                <div className="rounded-2xl p-4 overflow-x-auto" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--nd-text-primary)' }}>Top losses</h3>
                  <table className="min-w-full text-sm">
                    <thead style={{ borderBottom: '1px solid var(--nd-border)' }}>
                      <tr style={{ color: 'var(--nd-text-secondary)' }}>
                        <th className="text-left py-2 pr-2">Metric</th>
                        <th className="text-left py-2 pr-2">Model</th>
                        <th className="text-right py-2 pr-2">Δ</th>
                        <th className="text-left py-2">Fix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.losses.map((w, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--nd-border)' }}>
                          <td className="py-2 pr-2" style={{ color: 'var(--nd-text-primary)' }}>{w.metric}</td>
                          <td className="py-2 pr-2 text-xs" style={{ color: 'var(--nd-text-secondary)' }}>{w.model}</td>
                          <td className="py-2 pr-2 text-right text-rose-600 font-medium">
                            {w.delta.toFixed(1)}
                          </td>
                          <td className="py-2">
                            {w.fix_title && w.fix_link ? (
                              <button
                                type="button"
                                onClick={() => onNavigate?.(w.fix_link!)}
                                className="text-amber-700 hover:text-amber-900 text-xs underline text-left transition-colors"
                              >
                                {w.fix_title}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--nd-text-muted)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d.losses.length === 0 && (
                    <p className="text-sm py-3" style={{ color: 'var(--nd-text-muted)' }}>No losses in this period.</p>
                  )}
                </div>
              </div>

              {/* ── Top cited pages ─────────────────────────────────────── */}
              <div className="rounded-2xl p-4" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--nd-text-primary)' }}>Top cited pages</h3>
                {d.top_pages.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>No cited URLs in the last 7 days.</p>
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
                          className="text-left truncate max-w-[min(100%,28rem)] transition-colors inline-flex items-center gap-1"
                          style={{ color: 'var(--nd-blue)' }}
                        >
                          {p.url}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </button>
                        <span className="text-xs shrink-0" style={{ color: 'var(--nd-text-muted)' }}>
                          {p.citations} cites · {p.primary_model}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Priority actions ────────────────────────────────────── */}
              <div className="rounded-2xl p-4" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--nd-text-primary)' }}>Priority actions</h3>
                {d.recommendations.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>No ranked recommendations for this job yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {d.recommendations.map((r, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => onNavigate?.(r.module_link)}
                          className="text-left w-full rounded-lg px-3 py-2 transition-colors"
                          style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nd-border-hover)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nd-border)' }}
                        >
                          <span className="font-medium text-sm" style={{ color: 'var(--nd-text-primary)' }}>{r.action}</span>
                          <span className="block text-xs mt-1" style={{ color: 'var(--nd-text-muted)' }}>
                            Impact: {r.impact} · Effort: {r.effort}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Competitor snapshot ─────────────────────────────────── */}
              <div className="rounded-2xl p-4 overflow-x-auto" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--nd-text-primary)' }}>Competitor snapshot</h3>
                {d.competitor_movements.length === 0 ? (
                  <div className="rounded-lg px-3 py-4 text-sm" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)', color: 'var(--nd-text-muted)' }}>
                    No competitor movement data.{' '}
                    <button
                      type="button"
                      onClick={() => onNavigate?.('visibility-comparision')}
                      className="text-amber-700 hover:text-amber-900 underline transition-colors"
                    >
                      Add competitors
                    </button>
                  </div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead style={{ borderBottom: '1px solid var(--nd-border)' }}>
                      <tr style={{ color: 'var(--nd-text-secondary)' }}>
                        <th className="text-left py-2 pr-2">Competitor</th>
                        <th className="text-right py-2 pr-2">SoV Δ</th>
                        <th className="text-right py-2 pr-2">Prompts +</th>
                        <th className="text-right py-2">Prompts −</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.competitor_movements.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--nd-border)' }}>
                          <td className="py-2 pr-2" style={{ color: 'var(--nd-text-primary)' }}>{c.name}</td>
                          <td
                            className={cn(
                              'py-2 pr-2 text-right',
                              c.sov_change === null
                                ? 'text-zinc-500'
                                : c.sov_change > 0
                                ? 'text-rose-600'   // competitor gaining — inverted colour
                                : 'text-emerald-600',
                            )}
                          >
                            {c.sov_change !== null ? fmtDelta(c.sov_change) : '—'}
                          </td>
                          <td className="py-2 pr-2 text-right text-emerald-600">
                            {c.prompts_gained}
                          </td>
                          <td className="py-2 text-right text-rose-600">{c.prompts_lost}</td>
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
                  className="px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50 transition-colors"
                  style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)', color: 'var(--nd-text-secondary)' }}
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => onExport('csv')}
                  disabled={!activeReport}
                  className="px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50 transition-colors"
                  style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)', color: 'var(--nd-text-secondary)' }}
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
                  className="px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2 transition-colors"
                  style={{ border: '1px solid var(--nd-border)', color: 'var(--nd-text-secondary)' }}
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