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
  if (sev === 'CRITICAL') return { bar: 'bg-[var(--nd-negative-text)]', pill: 'text-[var(--nd-negative-text)]', pillBg: 'bg-[var(--nd-negative-bg)] border-rose-500/20' }
  if (sev === 'HIGH') return { bar: 'bg-amber-500', pill: 'text-amber-600', pillBg: 'bg-amber-50 border-amber-500/20' }
  if (sev === 'MEDIUM') return { bar: 'bg-yellow-400', pill: 'text-yellow-600', pillBg: 'bg-yellow-50 border-yellow-400/20' }
  return { bar: 'bg-[var(--nd-positive-text)]', pill: 'text-[var(--nd-positive-text)]', pillBg: 'bg-[var(--nd-positive-bg)] border-emerald-500/20' }
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
        <circle cx="21" cy="21" r={radius} className="fill-none" style={{ stroke: 'var(--nd-border)' }} strokeWidth={3} />
        <circle
          cx="21"
          cy="21"
          r={radius}
          className={cn('fill-none stroke-linecap-round', col)}
          strokeWidth={3}
          strokeDasharray={`${filled.toFixed(1)} ${circumference.toFixed(1)}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-mono" style={{ color: 'var(--nd-text-primary)' }}>
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
      <div className="rounded-2xl border p-6" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
        <div className="h-5 w-40 rounded mb-4" style={{ background: 'var(--nd-border)' }} />
        <div className="h-4 w-64 rounded mb-6" style={{ background: 'var(--nd-border)' }} />
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="h-16 rounded" style={{ background: 'var(--nd-border)' }} />
          <div className="h-16 rounded" style={{ background: 'var(--nd-border)' }} />
          <div className="h-16 rounded" style={{ background: 'var(--nd-border)' }} />
          <div className="h-16 rounded" style={{ background: 'var(--nd-border)' }} />
        </div>
        <div className="space-y-2">
          <div className="h-20 rounded" style={{ background: 'var(--nd-border)' }} />
          <div className="h-20 rounded" style={{ background: 'var(--nd-border)' }} />
        </div>
      </div>
    )
  }

  if (!recommendations.length) {
    return (
      <div className="rounded-2xl border p-8 text-center text-sm" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-muted)' }}>
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full border mb-3" style={{ background: 'var(--nd-positive-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-positive-text)' }}>
          <Lightbulb className="w-5 h-5" />
        </div>
        No recommendation cards available yet. Run prompt tracking to generate prioritized actions.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border p-6 space-y-6" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
      <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--nd-border)' }}>
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 via-indigo-500/10 to-emerald-500/10" />
        <div className="relative p-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl border" style={{ background: 'var(--nd-purple-subtle)', borderColor: 'var(--nd-border)', color: 'var(--nd-purple)' }}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--nd-text-primary)' }}>Action Plan</h2>
                <span
                  className={cn(
                    'inline-flex items-center gap-2 px-2 py-0.5 rounded-md border text-xs font-mono',
                    delta.variant === 'critical' && 'border-rose-200 bg-rose-50 text-rose-700',
                    delta.variant === 'high' && 'border-amber-200 bg-amber-50 text-amber-700',
                    delta.variant === 'medium' && 'border-yellow-200 bg-yellow-50 text-yellow-700',
                    delta.variant === 'low' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                    delta.variant === 'info' && 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  )}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{delta.label}</span>
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>
                {(data?.role_filter_applied || 'SEO Manager') +
                  ' · ' +
                  (data?.plan_limit_applied ?? recommendations.length) +
                  ' actions max · ' +
                  (summary?.top_module || 'Prompt intelligence')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="px-4 py-3 rounded-lg border" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--nd-text-primary)' }}>{summary?.total ?? recommendations.length}</div>
              <div className="text-xs font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--nd-text-secondary)' }}>Total</div>
            </div>
            <div className="px-4 py-3 rounded-lg border" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--nd-text-primary)' }}>
                {summary?.critical ?? recommendations.filter((r) => r.severity === 'CRITICAL').length}
              </div>
              <div className="text-xs font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--nd-text-secondary)' }}>Critical</div>
            </div>
            <div className="px-4 py-3 rounded-lg border" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--nd-text-primary)' }}>{highCount}</div>
              <div className="text-xs font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--nd-text-secondary)' }}>High</div>
            </div>
            <div className="px-4 py-3 rounded-lg border" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
              <div className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--nd-text-primary)' }}>{data?.plan_limit_applied ?? recommendations.length}</div>
              <div className="text-xs font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--nd-text-secondary)' }}>Plan</div>
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
              'h-8 px-3 text-xs font-mono rounded-md border',
              severityFilter === sev ? 'shadow-sm' : 'hover:bg-black/5'
            )}
            style={
              severityFilter === sev
                ? { background: 'var(--nd-purple)', color: '#ffffff', borderColor: 'var(--nd-purple)' }
                : { background: 'var(--nd-bg)', color: 'var(--nd-text-secondary)', borderColor: 'var(--nd-border)' }
            }
            onClick={() => setSeverityFilter(sev as any)}
          >
            {sev === 'ALL' ? 'All priorities' : sev.charAt(0) + sev.slice(1).toLowerCase()}
          </Button>
        ))}
        <div className="inline-flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2.5" style={{ color: 'var(--nd-text-muted)' }} />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by action, prompt, or module"
              className="h-8 pl-7 text-sm border"
              style={{ background: 'var(--nd-bg)', color: 'var(--nd-text-primary)', borderColor: 'var(--nd-border)' }}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs font-mono border hover:bg-black/5"
            style={{ color: 'var(--nd-text-secondary)', borderColor: 'var(--nd-border)' }}
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
          <div className="py-10 text-center text-sm font-mono" style={{ color: 'var(--nd-text-muted)' }}>
            <div className="text-3xl mb-2 text-emerald-500">✓</div>
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
              ? 'text-gray-500'
              : changeIsPositive
              ? 'text-emerald-600'
              : 'text-rose-600'

          const isDone = completedIds.has(rec.recommendation_id)
          const isDismissed = dismissedIds.has(rec.recommendation_id)
          const isPending = pendingIds.has(rec.recommendation_id)
          const expanded = expandedId === rec.recommendation_id
          const moduleLabel = formatModuleLabel(rec.module)
          const affectedTarget =
            rec.affected_url?.replace(/^https?:\/\//, '').split('/').slice(0, 2).join('/') || 'Not specified'
          const moduleIcon =
            rec.module.toLowerCase().includes('prompt') ? <ListChecks className="w-4 h-4" style={{ color: 'var(--nd-purple)' }} /> :
            rec.module.toLowerCase().includes('visibility') ? <Gauge className="w-4 h-4" style={{ color: 'var(--nd-teal)' }} /> :
            rec.module.toLowerCase().includes('content') ? <BarChart3 className="w-4 h-4" style={{ color: 'var(--nd-blue)' }} /> :
            rec.module.toLowerCase().includes('entity') ? <Target className="w-4 h-4" style={{ color: 'var(--nd-text-primary)' }} /> :
            <Activity className="w-4 h-4" style={{ color: 'var(--nd-text-muted)' }} />

          return (
            <div
              key={rec.recommendation_id}
              className={cn(
                'group rounded-xl border overflow-hidden transition-colors cursor-pointer',
                expanded && 'border-violet-500/40'
              )}
              style={{ background: 'var(--nd-card-bg)', borderColor: expanded ? 'var(--nd-purple)' : 'var(--nd-border)' }}
              onClick={() => handleToggleExpand(rec.recommendation_id)}
            >
              <div className="flex items-center gap-4 px-4 py-3">
                <div className={cn('w-1.5 h-10 rounded-full', sevColors.bar)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center justify-center w-7 h-7 rounded-md border" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                      {moduleIcon}
                    </div>
                    <div className="truncate text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>{rec.action_title}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--nd-text-secondary)' }}>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-sm border',
                        sevColors.pillBg,
                        sevColors.pill,
                        'uppercase tracking-[0.14em] text-xs font-bold'
                      )}
                    >
                      {rec.severity}
                    </span>
                    <span className="font-medium">{moduleLabel}</span>
                    <span className={cn('flex items-center gap-1 font-bold', changeColor)}>
                      {changeStr !== 'first run' && (
                        <span>{changeIsPositive ? '▲' : changeIsNegative ? '▼' : '•'}</span>
                      )}
                      <span>{changeStr}</span>
                    </span>
                    <span style={{ color: 'var(--nd-text-secondary)' }}>Target: {affectedTarget}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-sm font-mono font-bold" style={{ color: 'var(--nd-text-primary)' }}>
                        {formatScore(snapshot.prompt_visibility_score)}
                      </div>
                      <div className="text-xs font-mono uppercase tracking-[0.16em]" style={{ color: 'var(--nd-text-secondary)' }}>
                        Visibility
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="text-sm font-mono font-bold" style={{ color: 'var(--nd-text-primary)' }}>
                        {formatPercent(snapshot.ctr_percent)}
                      </div>
                      <div className="text-xs font-mono uppercase tracking-[0.16em]" style={{ color: 'var(--nd-text-secondary)' }}>
                        CTR
                      </div>
                    </div>
                  </div>
                  <PriorityRing score={rec.priority_score} severity={rec.severity} />
                </div>

                <div className="flex items-center justify-center w-6 h-6 text-xs" style={{ color: 'var(--nd-text-muted)' }}>
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
              </div>

              {expanded && (
                <div
                  className="px-4 pb-4 pt-2 border-t"
                  style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border p-3" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-xs uppercase tracking-[0.16em] mb-1 font-bold" style={{ color: 'var(--nd-text-secondary)' }}>What happened</div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-primary)' }}>
                        {rec.action_title}
                      </p>
                      <p className={cn('mt-2 text-xs font-mono font-bold', changeColor)}>
                        Visibility change: {changeStr}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-xs uppercase tracking-[0.16em] mb-1 font-bold" style={{ color: 'var(--nd-text-secondary)' }}>Why this matters</div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>
                        Priority is {rec.priority_score.toFixed(2)} with {rec.severity.toLowerCase()} severity.
                        Trigger: {(rec.trigger_event || 'standard').replace(/_/g, ' ')}.
                      </p>
                      <p className="mt-1 text-xs font-medium" style={{ color: 'var(--nd-text-secondary)' }}>Module: {moduleLabel}</p>
                    </div>
                    <div className="rounded-lg border p-3" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-xs uppercase tracking-[0.16em] mb-1 font-bold" style={{ color: 'var(--nd-text-secondary)' }}>What to do now</div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-primary)' }}>
                        {rec.action_detail}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <div className="rounded-md border px-2.5 py-2" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-sm font-mono font-bold" style={{ color: 'var(--nd-text-primary)' }}>{formatScore(snapshot.engagement_score)}</div>
                      <div className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--nd-text-secondary)' }}>Engagement</div>
                    </div>
                    <div className="rounded-md border px-2.5 py-2" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-sm font-mono font-bold" style={{ color: 'var(--nd-text-primary)' }}>{formatScore(snapshot.traffic_estimate)}</div>
                      <div className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--nd-text-secondary)' }}>Traffic</div>
                    </div>
                    <div className="rounded-md border px-2.5 py-2" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-sm font-mono font-bold" style={{ color: 'var(--nd-text-primary)' }}>{formatPercent(snapshot.citation_rate ? snapshot.citation_rate * 100 : snapshot.citation_rate)}</div>
                      <div className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--nd-text-secondary)' }}>Citation</div>
                    </div>
                    <div className="rounded-md border px-2.5 py-2" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-sm font-mono font-bold" style={{ color: 'var(--nd-text-primary)' }}>{formatScore(snapshot.avg_position)}</div>
                      <div className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--nd-text-secondary)' }}>Avg position</div>
                    </div>
                    <div className="rounded-md border px-2.5 py-2" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-sm font-mono font-bold" style={{ color: 'var(--nd-text-primary)' }}>{formatPercent(snapshot.share_of_voice ? snapshot.share_of_voice * 100 : snapshot.share_of_voice)}</div>
                      <div className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--nd-text-secondary)' }}>Share of voice</div>
                    </div>
                    <div className="rounded-md border px-2.5 py-2" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-sm font-mono font-bold" style={{ color: 'var(--nd-text-primary)' }}>{formatScore(snapshot.difficulty_score)}</div>
                      <div className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--nd-text-secondary)' }}>Difficulty</div>
                    </div>
                  </div>

                  {/* SOP-002 §7.1 data quality badge — real vs estimated */}
                  {snapshot.calculation_method && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <span style={{ color: 'var(--nd-text-secondary)' }}>data source:</span>
                      <span className={cn(
                        'font-bold',
                        snapshot.calculation_method === 'real_citation_data' ? 'text-emerald-600' :
                        snapshot.calculation_method === 'ranking' ? 'text-amber-600' :
                        'text-gray-500'
                      )}>
                        {snapshot.calculation_method.replace(/_/g, ' ')}
                      </span>
                      {snapshot.pvs_formula_version && (
                        <span className="ml-1" style={{ color: 'var(--nd-text-secondary)' }}>· {snapshot.pvs_formula_version}</span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-lg font-mono font-bold" style={{ color: 'var(--nd-purple)' }}>{rec.impact_score.toFixed(1)}</div>
                      <div className="text-xs font-mono uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--nd-text-secondary)' }}>
                        Impact ×0.50
                      </div>
                    </div>
                    <div className="rounded-lg border px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-lg font-mono font-bold" style={{ color: 'var(--nd-purple)' }}>
                        {(11 - rec.effort_score).toFixed(0)}
                      </div>
                      <div className="text-xs font-mono uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--nd-text-secondary)' }}>
                        Effort inv. ×0.30
                      </div>
                    </div>
                    <div className="rounded-lg border px-3 py-2.5" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                      <div className="text-lg font-mono font-bold" style={{ color: 'var(--nd-purple)' }}>{rec.urgency_score.toFixed(1)}</div>
                      <div className="text-xs font-mono uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--nd-text-secondary)' }}>
                        Urgency ×0.20
                      </div>
                    </div>
                    <div className="rounded-lg border px-3 py-2.5" style={{ background: 'var(--nd-purple-subtle)', borderColor: 'var(--nd-purple)' }}>
                      <div className="text-lg font-mono font-bold" style={{ color: 'var(--nd-purple)' }}>{rec.priority_score.toFixed(2)}</div>
                      <div className="text-xs font-mono uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--nd-purple)' }}>
                        Priority score
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-md border px-3 py-1.5 text-sm" style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}>
                    <span style={{ color: 'var(--nd-text-secondary)' }}>Main prompt:</span>
                    <span className="truncate font-semibold" style={{ color: 'var(--nd-text-primary)' }}>"{rec.prompt}"</span>
                  </div>

                  {rec.additional_prompts && rec.additional_prompts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rec.additional_prompts.slice(0, 4).map((p) => (
                        <span
                          key={p}
                          className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs"
                          style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)' }}
                        >
                          <span style={{ color: 'var(--nd-text-secondary)' }}>+ prompt</span>
                          <span className="truncate font-medium">{p}</span>
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
                        'h-8 px-3 text-xs font-mono font-bold',
                        isDone
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          : 'shadow-sm'
                      )}
                      style={!isDone ? { background: 'var(--nd-purple)', color: '#ffffff', borderColor: 'var(--nd-purple)' } : undefined}
                      onClick={() => handleToggleDone(rec.recommendation_id)}
                    >
                      {isPending ? '…' : isDone ? '✓ Completed' : 'Mark as done'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending || isDone || isDismissed}
                      className={cn(
                        'h-8 px-3 text-xs font-mono font-bold border hover:bg-black/5',
                        isDismissed
                          ? 'opacity-60'
                          : ''
                      )}
                      style={{ color: 'var(--nd-text-secondary)', borderColor: 'var(--nd-border)' }}
                      onClick={() => handleDismiss(rec.recommendation_id)}
                    >
                      {isDismissed ? 'Dismissed' : 'Dismiss'}
                    </Button>
                    {rec.affected_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-8 px-3 text-xs font-mono font-bold border hover:bg-black/5"
                        style={{ color: 'var(--nd-text-secondary)', borderColor: 'var(--nd-border)' }}
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
      <div className="text-xs font-mono flex items-center gap-2 font-medium" style={{ color: 'var(--nd-text-secondary)' }}>
        <Flame className="w-3.5 h-3.5 text-[var(--nd-positive-text)]" />
        <span>Start with critical/high cards, open each card, and follow "What to do now".</span>
      </div>
    </div>
  )
}