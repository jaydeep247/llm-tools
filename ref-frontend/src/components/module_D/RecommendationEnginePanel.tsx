'use client'

import { useMemo, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Sparkles, Lightbulb, AlertTriangle, Target, Activity, ChevronDown, ChevronUp, BarChart3, Gauge, Rocket, ListChecks, Search, Flame } from 'lucide-react'

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

interface PromptMetricsSnapshot {
  prompt_visibility_score?: number | null
  ctr_percent?: number | null
  engagement_score?: number | null
  traffic_estimate?: number | null
  visibility_change?: number | null
  // SOP-002 §6.2 — real citation pipeline fields
  citation_rate?: number | null
  avg_position?: number | null
  share_of_voice?: number | null
  // SOP-002 §7.1 — formula audit trail
  pvs_formula_version?: string | null
  // SOP-002 §4.3 — difficulty / refresh cadence
  difficulty_score?: number | null
  // Data quality — lets UI show whether data is real vs estimated
  calculation_method?: string | null
}

interface PromptRecommendation {
  recommendation_id: string
  prompt: string
  module: string
  action_title: string
  action_detail: string
  affected_url: string
  impact_score: number
  effort_score: number
  urgency_score: number
  priority_score: number
  severity: Severity
  trigger_event?: string
  metrics_snapshot?: PromptMetricsSnapshot
  additional_prompts?: string[]
  status?: string
}

interface RecommendationSummary {
  total?: number
  critical?: number
  delta_class?: string
  top_module?: string | null
}

export interface RecommendationEnginePayload {
  recommendations: PromptRecommendation[]
  summary?: RecommendationSummary
  plan_limit_applied?: number
  role_filter_applied?: string
}

interface RecommendationEnginePanelProps {
  data?: RecommendationEnginePayload | null
  isLoading?: boolean
}

function getSeverityBadge(deltaClass?: string): { label: string; variant: 'critical' | 'high' | 'medium' | 'low' | 'info' } {
  if (!deltaClass) return { label: 'Plateau', variant: 'info' }
  const map: Record<string, { label: string; variant: 'critical' | 'high' | 'medium' | 'low' | 'info' }> = {
    'CRITICAL DROP': { label: 'CRITICAL DROP', variant: 'critical' },
    'SIGNIFICANT DROP': { label: 'SIGNIFICANT DROP', variant: 'high' },
    'SLOW EROSION': { label: 'SLOW EROSION', variant: 'medium' },
    'PLATEAU': { label: 'PLATEAU', variant: 'medium' },
    'COMPETITOR THREAT': { label: 'COMPETITOR THREAT', variant: 'high' },
    'IMPROVEMENT SIGNAL': { label: 'IMPROVEMENT SIGNAL', variant: 'low' },
    'GOAL PROXIMITY': { label: 'GOAL PROXIMITY', variant: 'info' },
  }
  return map[deltaClass] || { label: deltaClass, variant: 'info' }
}

function severityColor(sev: Severity): { bar: string; pill: string; pillBg: string } {
  if (sev === 'CRITICAL') return { bar: 'bg-rose-500', pill: 'text-rose-400', pillBg: 'bg-rose-500/10 border-rose-500/40' }
  if (sev === 'HIGH') return { bar: 'bg-amber-400', pill: 'text-amber-300', pillBg: 'bg-amber-500/10 border-amber-500/40' }
  if (sev === 'MEDIUM') return { bar: 'bg-yellow-300', pill: 'text-yellow-200', pillBg: 'bg-yellow-400/10 border-yellow-400/40' }
  return { bar: 'bg-emerald-400', pill: 'text-emerald-300', pillBg: 'bg-emerald-500/10 border-emerald-500/40' }
}

function formatModuleLabel(moduleName?: string): string {
  if (!moduleName) return 'General'
  return moduleName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatScore(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return Number(value).toFixed(digits)
}

function formatPercent(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Number(value).toFixed(digits)}%`
}

function PriorityRing({ score, severity }: { score: number; severity: Severity }) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(10, score))
  const filled = (clamped / 10) * circumference
  const col = severityColor(severity).bar.replace('bg-', 'stroke-')
  return (
    <div className="relative w-11 h-11">
      <svg className="-rotate-90" width="42" height="42" viewBox="0 0 42 42">
        <circle cx="21" cy="21" r={radius} className="fill-none stroke-zinc-800" strokeWidth={3} />
        <circle
          cx="21"
          cy="21"
          r={radius}
          className={cn('fill-none stroke-linecap-round', col)}
          strokeWidth={3}
          strokeDasharray={`${filled.toFixed(1)} ${circumference.toFixed(1)}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-zinc-50">
        {score.toFixed(1)}
      </div>
    </div>
  )
}

export function RecommendationEnginePanel({ data, isLoading }: RecommendationEnginePanelProps) {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | Severity>('ALL')
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [sortBy, setSortBy] = useState<'priority' | 'severity' | 'impact'>('priority')

  // Persist feedback to backend (Moat #4 §8.1 — RAR / SLAR / RDR instrumentation).
  // mark_recommendation_feedback() in runner.py requires recommendation_id + feedback.
  const postFeedback = useCallback(async (id: string, feedback: 'completed' | 'dismissed') => {
    setPendingIds((prev) => new Set(prev).add(id))
    try {
      await fetch('/api/v1/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation_id: id, feedback }),
      })
    } catch (err) {
      // Non-blocking: local state already updated; backend will reconcile on next load
      console.warn('[RE] feedback persist failed', err)
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [])

  const handleToggleDone = useCallback((id: string) => {
    const isCurrentlyDone = completedIds.has(id)
    setCompletedIds((prev) => {
      const next = new Set(prev)
      isCurrentlyDone ? next.delete(id) : next.add(id)
      return next
    })
    // Remove from dismissed if re-marking as done
    setDismissedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    postFeedback(id, isCurrentlyDone ? 'dismissed' : 'completed')
  }, [completedIds, postFeedback])

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id))
    // Remove from completed if dismissing a previously completed item
    setCompletedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    postFeedback(id, 'dismissed')
  }, [postFeedback])

  const recommendations = data?.recommendations || []
  const summary = data?.summary

  const filtered = useMemo(() => {
    const bySeverity = severityFilter === 'ALL' ? recommendations : recommendations.filter((r) => r.severity === severityFilter)
    const bySearch = searchTerm
      ? bySeverity.filter(
          (r) =>
            r.action_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.module.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : bySeverity
    const sorted = [...bySearch].sort((a, b) => {
      if (sortBy === 'priority') return b.priority_score - a.priority_score
      if (sortBy === 'impact') return b.impact_score - a.impact_score
      const order: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
      return order[b.severity] - order[a.severity]
    })
    return sorted
  }, [recommendations, severityFilter, searchTerm, sortBy])

  const highCount = useMemo(
    () => recommendations.filter((r) => r.severity === 'HIGH').length,
    [recommendations]
  )

  const delta = getSeverityBadge(summary?.delta_class)

  const handleToggleExpand = (id: string) => {
    setExpandedId((curr) => (curr === id ? null : id))
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-[#0b0c10] p-6">
        <div className="h-5 w-40 bg-zinc-800 rounded mb-4" />
        <div className="h-4 w-64 bg-zinc-900 rounded mb-6" />
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="h-16 bg-zinc-900 rounded" />
          <div className="h-16 bg-zinc-900 rounded" />
          <div className="h-16 bg-zinc-900 rounded" />
          <div className="h-16 bg-zinc-900 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-20 bg-zinc-900 rounded" />
          <div className="h-20 bg-zinc-900 rounded" />
        </div>
      </div>
    )
  }

  if (!recommendations.length) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-[#0b0c10] p-8 text-center text-sm text-zinc-500">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 mb-3">
          <Lightbulb className="w-5 h-5" />
        </div>
        No recommendation cards available yet. Run prompt tracking to generate prioritized actions.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0b0c10] p-6 space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 via-indigo-500/10 to-emerald-500/10" />
        <div className="relative p-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/40">
              <Sparkles className="w-5 h-5 text-violet-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Action Plan</h2>
                <span
                  className={cn(
                    'inline-flex items-center gap-2 px-2 py-0.5 rounded-md border text-[11px] font-mono',
                    delta.variant === 'critical' && 'border-rose-500/40 bg-rose-500/10 text-rose-400',
                    delta.variant === 'high' && 'border-amber-500/40 bg-amber-500/10 text-amber-300',
                    delta.variant === 'medium' && 'border-yellow-400/40 bg-yellow-400/10 text-yellow-200',
                    delta.variant === 'low' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                    delta.variant === 'info' && 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                  )}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{delta.label}</span>
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {(data?.role_filter_applied || 'SEO Manager') +
                  ' · ' +
                  (data?.plan_limit_applied ?? recommendations.length) +
                  ' actions max · ' +
                  (summary?.top_module || 'Prompt intelligence')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-[#111318] px-4 py-3 rounded-lg border border-zinc-800">
              <div className="text-2xl font-extrabold tracking-tight text-zinc-50">{summary?.total ?? recommendations.length}</div>
              <div className="text-[11px] text-zinc-500 font-mono uppercase tracking-[0.18em]">Total</div>
            </div>
            <div className="bg-[#111318] px-4 py-3 rounded-lg border border-zinc-800">
              <div className="text-2xl font-extrabold tracking-tight text-zinc-50">
                {summary?.critical ?? recommendations.filter((r) => r.severity === 'CRITICAL').length}
              </div>
              <div className="text-[11px] text-zinc-500 font-mono uppercase tracking-[0.18em]">Critical</div>
            </div>
            <div className="bg-[#111318] px-4 py-3 rounded-lg border border-zinc-800">
              <div className="text-2xl font-extrabold tracking-tight text-zinc-50">{highCount}</div>
              <div className="text-[11px] text-zinc-500 font-mono uppercase tracking-[0.18em]">High</div>
            </div>
            <div className="bg-[#111318] px-4 py-3 rounded-lg border border-zinc-800">
              <div className="text-2xl font-extrabold tracking-tight text-zinc-50">{data?.plan_limit_applied ?? recommendations.length}</div>
              <div className="text-[11px] text-zinc-500 font-mono uppercase tracking-[0.18em]">Plan</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
          <Button
            key={sev}
            size="sm"
            variant={severityFilter === sev ? 'default' : 'outline'}
            className={cn(
              'h-8 px-3 text-[11px] font-mono rounded-md border',
              severityFilter === sev ? 'bg-violet-500 text-white border-violet-500' : 'bg-[#111318] text-zinc-400 border-zinc-800 hover:bg-zinc-900'
            )}
            onClick={() => setSeverityFilter(sev as any)}
          >
            {sev === 'ALL' ? 'All priorities' : sev.charAt(0) + sev.slice(1).toLowerCase()}
          </Button>
        ))}
        <div className="inline-flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-2.5" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by action, prompt, or module"
              className="h-8 pl-7 text-[12px] bg-[#111318] border-zinc-800 text-zinc-200 placeholder:text-zinc-500"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-[11px] font-mono border-zinc-700 text-zinc-400 hover:text-zinc-100"
            onClick={() => setSortBy(sortBy === 'priority' ? 'severity' : sortBy === 'severity' ? 'impact' : 'priority')}
          >
            {sortBy === 'priority' && 'Sort: Priority'}
            {sortBy === 'severity' && 'Sort: Severity'}
            {sortBy === 'impact' && 'Sort: Impact'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-zinc-500 font-mono">
            <div className="text-3xl mb-2 text-emerald-400">✓</div>
            No {severityFilter.toLowerCase()} priority items
          </div>
        )}

        {filtered.map((rec) => {
          const sevColors = severityColor(rec.severity)
          const snapshot = rec.metrics_snapshot || {}
          const changeVal = snapshot.visibility_change
          const changeStr =
            changeVal === null || changeVal === undefined
              ? 'first run'
              : changeVal > 0
              ? `+${changeVal.toFixed(1)}`
              : changeVal.toFixed(1)
          const changeIsPositive = typeof changeVal === 'number' && changeVal > 0
          const changeIsNegative = typeof changeVal === 'number' && changeVal < 0
          const changeColor =
            changeVal === null || changeVal === undefined
              ? 'text-zinc-500'
              : changeIsPositive
              ? 'text-emerald-400'
              : 'text-rose-400'

          const isDone = completedIds.has(rec.recommendation_id)
          const isDismissed = dismissedIds.has(rec.recommendation_id)
          const isPending = pendingIds.has(rec.recommendation_id)
          const expanded = expandedId === rec.recommendation_id
          const moduleLabel = formatModuleLabel(rec.module)
          const affectedTarget =
            rec.affected_url?.replace(/^https?:\/\//, '').split('/').slice(0, 2).join('/') || 'Not specified'
          const moduleIcon =
            rec.module.toLowerCase().includes('prompt') ? <ListChecks className="w-4 h-4 text-violet-300" /> :
            rec.module.toLowerCase().includes('visibility') ? <Gauge className="w-4 h-4 text-emerald-300" /> :
            rec.module.toLowerCase().includes('content') ? <BarChart3 className="w-4 h-4 text-blue-300" /> :
            rec.module.toLowerCase().includes('entity') ? <Target className="w-4 h-4 text-yellow-200" /> :
            <Activity className="w-4 h-4 text-zinc-300" />

          return (
            <div
              key={rec.recommendation_id}
              className={cn(
                'group rounded-xl border border-zinc-800 bg-[#111318] overflow-hidden transition-colors cursor-pointer',
                expanded && 'border-violet-500/40'
              )}
              onClick={() => handleToggleExpand(rec.recommendation_id)}
            >
              <div className="flex items-center gap-4 px-4 py-3">
                <div className={cn('w-1.5 h-10 rounded-full', sevColors.bar)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-[#151821] border border-zinc-800">
                      {moduleIcon}
                    </div>
                    <div className="truncate text-sm font-semibold text-zinc-50">{rec.action_title}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-sm border',
                        sevColors.pillBg,
                        sevColors.pill,
                        'uppercase tracking-[0.14em] text-[10px]'
                      )}
                    >
                      {rec.severity}
                    </span>
                    <span>{moduleLabel}</span>
                    <span className={cn('flex items-center gap-1', changeColor)}>
                      {changeStr !== 'first run' && (
                        <span>{changeIsPositive ? '▲' : changeIsNegative ? '▼' : '•'}</span>
                      )}
                      <span>{changeStr}</span>
                    </span>
                    <span className="text-zinc-600">Target: {affectedTarget}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-[13px] font-mono text-zinc-50">
                        {formatScore(snapshot.prompt_visibility_score)}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.16em]">
                        Visibility
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-[13px] font-mono text-zinc-50">
                        {formatPercent(snapshot.ctr_percent)}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.16em]">
                        CTR
                      </div>
                    </div>
                  </div>
                  <PriorityRing score={rec.priority_score} severity={rec.severity} />
                </div>

                <div className="flex items-center justify-center w-6 h-6 text-[10px] text-zinc-500">
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
              </div>

              {expanded && (
                <div
                  className="px-4 pb-4 pt-2 border-t border-zinc-800 bg-[#0f1117]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-zinc-800 bg-[#141721] p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 mb-1">What happened</div>
                      <p className="text-sm text-zinc-200 leading-relaxed">
                        {rec.action_title}
                      </p>
                      <p className={cn('mt-2 text-xs font-mono', changeColor)}>
                        Visibility change: {changeStr}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-[#141721] p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 mb-1">Why this matters</div>
                      <p className="text-sm text-zinc-300 leading-relaxed">
                        Priority is {rec.priority_score.toFixed(2)} with {rec.severity.toLowerCase()} severity.
                        Trigger: {(rec.trigger_event || 'standard').replace(/_/g, ' ')}.
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">Module: {moduleLabel}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-[#141721] p-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 mb-1">What to do now</div>
                      <p className="text-sm text-zinc-200 leading-relaxed">
                        {rec.action_detail}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <div className="rounded-md border border-zinc-800 bg-[#151821] px-2.5 py-2">
                      <div className="text-sm font-mono text-zinc-50">{formatScore(snapshot.engagement_score)}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-[0.14em]">Engagement</div>
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-[#151821] px-2.5 py-2">
                      <div className="text-sm font-mono text-zinc-50">{formatScore(snapshot.traffic_estimate)}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-[0.14em]">Traffic</div>
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-[#151821] px-2.5 py-2">
                      <div className="text-sm font-mono text-zinc-50">{formatPercent(snapshot.citation_rate ? snapshot.citation_rate * 100 : snapshot.citation_rate)}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-[0.14em]">Citation</div>
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-[#151821] px-2.5 py-2">
                      <div className="text-sm font-mono text-zinc-50">{formatScore(snapshot.avg_position)}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-[0.14em]">Avg position</div>
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-[#151821] px-2.5 py-2">
                      <div className="text-sm font-mono text-zinc-50">{formatPercent(snapshot.share_of_voice ? snapshot.share_of_voice * 100 : snapshot.share_of_voice)}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-[0.14em]">Share of voice</div>
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-[#151821] px-2.5 py-2">
                      <div className="text-sm font-mono text-zinc-50">{formatScore(snapshot.difficulty_score)}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-[0.14em]">Difficulty</div>
                    </div>
                  </div>

                  {/* SOP-002 §7.1 data quality badge — real vs estimated */}
                  {snapshot.calculation_method && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#141621] px-2.5 py-1 font-mono text-[10px]">
                      <span className="text-zinc-500">data source:</span>
                      <span className={cn(
                        snapshot.calculation_method === 'real_citation_data' ? 'text-emerald-400' :
                        snapshot.calculation_method === 'ranking' ? 'text-amber-300' :
                        'text-zinc-400'
                      )}>
                        {snapshot.calculation_method.replace(/_/g, ' ')}
                      </span>
                      {snapshot.pvs_formula_version && (
                        <span className="text-zinc-600 ml-1">· {snapshot.pvs_formula_version}</span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-zinc-800 bg-[#151821] px-3 py-2.5">
                      <div className="text-base font-mono text-violet-300">{rec.impact_score.toFixed(1)}</div>
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.16em]">
                        Impact ×0.50
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-[#151821] px-3 py-2.5">
                      <div className="text-base font-mono text-violet-300">
                        {(11 - rec.effort_score).toFixed(0)}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.16em]">
                        Effort inv. ×0.30
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-[#151821] px-3 py-2.5">
                      <div className="text-base font-mono text-violet-300">{rec.urgency_score.toFixed(1)}</div>
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.16em]">
                        Urgency ×0.20
                      </div>
                    </div>
                    <div className="rounded-lg border border-violet-500/40 bg-[#17192a] px-3 py-2.5">
                      <div className="text-base font-mono text-zinc-50">{rec.priority_score.toFixed(2)}</div>
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.16em]">
                        Priority score
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-md border border-zinc-800 bg-[#141621] px-3 py-1.5 text-[11px] text-zinc-400">
                    <span className="text-zinc-500">Main prompt:</span>
                    <span className="truncate text-zinc-200">"{rec.prompt}"</span>
                  </div>

                  {rec.additional_prompts && rec.additional_prompts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rec.additional_prompts.slice(0, 4).map((p) => (
                        <span
                          key={p}
                          className="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-800 bg-[#111318] px-2 py-0.5 font-mono text-[10px] text-zinc-400"
                        >
                          <span className="text-zinc-500">+ prompt</span>
                          <span className="truncate">{p}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      disabled={isPending || isDismissed}
                      className={cn(
                        'h-8 px-3 text-[11px] font-mono',
                        isDone
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
                          : 'bg-violet-500 text-white border border-violet-500'
                      )}
                      onClick={() => handleToggleDone(rec.recommendation_id)}
                    >
                      {isPending ? '…' : isDone ? '✓ Completed' : 'Mark as done'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending || isDone}
                      className={cn(
                        'h-8 px-3 text-[11px] font-mono border-zinc-700 hover:text-zinc-100',
                        isDismissed
                          ? 'text-zinc-600 border-zinc-800 cursor-default'
                          : 'text-zinc-400'
                      )}
                      onClick={() => !isDismissed && handleDismiss(rec.recommendation_id)}
                    >
                      {isDismissed ? 'Dismissed' : 'Dismiss'}
                    </Button>
                    {rec.affected_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-8 px-3 text-[11px] font-mono border-zinc-700 text-zinc-400 hover:text-zinc-100"
                        onClick={() => window.open(rec.affected_url, '_blank', 'noopener,noreferrer')}
                      >
                        Open target page ↗
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-2">
        <Flame className="w-3.5 h-3.5 text-emerald-400" />
        <span>Start with critical/high cards, open each card, and follow "What to do now".</span>
      </div>
    </div>
  )
}