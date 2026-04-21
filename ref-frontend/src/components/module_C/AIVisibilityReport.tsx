'use client'

import { useState } from 'react'
import {
  Loader2,
  Brain,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Zap,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Target,
  Sparkles,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetVisibilityReportQuery } from '@/store/api/module_C/moduleCApi'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import type { AIVisibilityIssue, AIVisibilityRecommendation } from '@/store/api/module_C/moduleCApi'
import { useModuleCAnalysis } from '@/hooks/useModuleCAnalysis'
import ModuleCProgressLoader from './ModuleCProgressLoader'

// ─── Props ────────────────────────────────────────────────────────────────────

interface AIVisibilityReportProps {
  jobId?: string | null
  url?: string
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

function getSeverityStyles(severity: string) {
  switch (severity) {
    case 'High':
      return {
        badge: 'bg-red-50 text-red-700 border border-red-200',
        icon: <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />,
        border: 'border-l-red-500',
      }
    case 'Medium':
      return {
        badge: 'bg-amber-50 text-amber-700 border border-amber-200',
        icon: <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />,
        border: 'border-l-amber-500',
      }
    default:
      return {
        badge: 'bg-blue-50 text-blue-700 border border-blue-200',
        icon: <Lightbulb className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />,
        border: 'border-l-blue-400',
      }
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span style={{ color: 'var(--nd-purple)' }}>{icon}</span>
      <h3 className="text-base font-semibold" style={{ color: 'var(--nd-text-primary)' }}>{title}</h3>
    </div>
  )
}

function IssueCard({ issue }: { issue: AIVisibilityIssue }) {
  const styles = getSeverityStyles(issue.severity)
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border border-l-4',
        styles.border
      )}
      style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}
    >
      {styles.icon}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-bold" style={{ color: 'var(--nd-text-primary)' }}>{issue.title}</span>
          <span className={cn('text-xs border px-2 py-0.5 rounded-full font-bold uppercase tracking-wide', styles.badge)}>{issue.severity}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide" style={{ background: 'var(--nd-bg)', color: 'var(--nd-text-secondary)', border: '1px solid var(--nd-border)' }}>
            {issue.field}
          </span>
        </div>
        <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--nd-text-primary)' }}>{issue.explanation}</p>
      </div>
    </div>
  )
}

function RecommendationCard({ rec, index }: { rec: AIVisibilityRecommendation; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--nd-nav-hover-bg)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5" style={{ background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' }}>
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-snug" style={{ color: 'var(--nd-text-primary)' }}>{rec.issue}</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--nd-text-secondary)' }} />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--nd-text-secondary)' }} />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-bg)' }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--nd-text-secondary)' }}>
              Why It Matters
            </p>
            <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--nd-text-primary)' }}>{rec.why_it_matters}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--nd-text-secondary)' }}>
              How To Fix
            </p>
            <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--nd-text-primary)' }}>{rec.how_to_fix}</p>
          </div>
          {rec.example_fix && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--nd-text-secondary)' }}>
                Example
              </p>
              <pre className="text-sm font-bold rounded-md p-3 overflow-x-auto whitespace-pre-wrap" style={{ background: 'var(--nd-bg)', color: 'var(--nd-text-primary)', border: '1px solid var(--nd-border)' }}>
                {rec.example_fix}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Empty / Loading states ───────────────────────────────────────────────────

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIVisibilityReport({ jobId, url = '' }: AIVisibilityReportProps) {
  const { data, isLoading, isFetching, refetch } = useGetVisibilityReportQuery({ jobId: jobId || '', url }, {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const { isAnalyzing, progress, phaseLabel, runAnalysis } = useModuleCAnalysis({
    jobId,
    url,
    onCompleted: refetch,
  })

  const handleRunAnalysis = async () => {
    try {
      await runAnalysis()
    } catch (error) {
      console.error('Failed to start analysis:', error)
    }
  }

  const report = data?.data?.data ?? null
  const reportUrl = data?.data?.url ?? ''
  const timestamp = data?.data?.timestamp ?? ''

  if (isAnalyzing) {
    return (
      <ModuleCProgressLoader
        progress={progress}
        phaseLabel={phaseLabel}
        title="Building AI Visibility Report"
      />
    )
  }

  // ── Loading ──
  if (isLoading || isFetching) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--nd-purple)' }} />
        <p className="text-sm font-bold" style={{ color: 'var(--nd-text-secondary)' }}>Loading AI Visibility Report…</p>
      </div>
    )
  }

  // ── No job ──
  if (!jobId) {
    return (
      <AnalysisEmptyState
        icon={<Brain className="w-8 h-8" style={{ color: 'var(--nd-text-secondary)' }} />}
        title="No Report Available"
        description="Please run a crawl and an AEO analysis first before viewing the AI Visibility Report."
      />
    )
  }

  // ── No report yet (AEO analysis hasn't run) ──
  if (!report || ('error' in report && report.error)) {
    return (
      <AnalysisEmptyState
        icon={<Brain className="w-8 h-8" style={{ color: 'var(--nd-text-secondary)' }} />}
        title="No AI Visibility Report"
        description="No AI Visibility Report found for this job. Run an AEO analysis to generate the report."
        onRunAnalysis={handleRunAnalysis}
        isAnalyzing={isAnalyzing}
        disabled={!url}
      />
    )
  }

  const highIssues = report.issues?.filter((i) => i.severity === 'High').length ?? 0
  const mediumIssues = report.issues?.filter((i) => i.severity === 'Medium').length ?? 0

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5" style={{ color: 'var(--nd-purple)' }} />
            <h2 className="text-lg font-semibold" style={{ color: 'var(--nd-text-primary)' }}>AI Visibility Report</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)', border: '1px solid rgba(83,71,206,0.2)' }}>
              AI Consultant
            </span>
          </div>
          {reportUrl && (
            <p className="text-xs truncate max-w-sm" style={{ color: 'var(--nd-text-muted)' }} title={reportUrl}>
              {reportUrl}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {highIssues > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
              {highIssues} High
            </span>
          )}
          {mediumIssues > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {mediumIssues} Medium
            </span>
          )}
          {timestamp && (
            <span className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>
              {new Date(timestamp).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      {report.summary && (
        <div className="rounded-lg p-5" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
          <SectionHeader icon={<BookOpen className="w-4 h-4" />} title="Overall AI Visibility Summary" />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-primary)' }}>{report.summary}</p>
        </div>
      )}

      {/* ── Priority Fixes ── */}
      {report.priority_fixes && report.priority_fixes.length > 0 && (
        <div className="rounded-lg p-5" style={{ border: '1px solid rgba(83,71,206,0.2)', background: 'var(--nd-purple-subtle)' }}>
          <SectionHeader icon={<Zap className="w-4 h-4" />} title="Top 3 Priority Fixes" />
          <ol className="space-y-2">
            {report.priority_fixes.map((fix, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5" style={{ background: 'var(--nd-purple)', color: '#fff' }}>
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-primary)' }}>{fix}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Issues + Recommendations (2-col on large) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Issues */}
        {report.issues && report.issues.length > 0 && (
          <div>
            <SectionHeader
              icon={<AlertTriangle className="w-4 h-4" />}
              title={`Key Issues (${report.issues.length})`}
            />
            <div className="space-y-3">
              {report.issues.map((issue, i) => (
                <IssueCard key={i} issue={issue} />
              ))}
            </div>
          </div>
        )}

        {/* Positive Signals */}
        {report.positive_signals && report.positive_signals.length > 0 && (
          <div>
            <SectionHeader
              icon={<ShieldCheck className="w-4 h-4" />}
              title="What's Working Well"
            />
            <div className="space-y-2">
              {report.positive_signals.map((signal, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg"
                  style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed text-emerald-900">{signal}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Recommendations ── */}
      {report.recommendations && report.recommendations.length > 0 && (
        <div>
          <SectionHeader
            icon={<Sparkles className="w-4 h-4" />}
            title={`Detailed Recommendations (${report.recommendations.length})`}
          />
          <div className="space-y-3">
            {report.recommendations.map((rec, i) => (
              <RecommendationCard key={i} rec={rec} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── AI Readability + Estimated Impact (2-col) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {report.ai_readability && (
          <div className="rounded-lg p-5" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
            <SectionHeader icon={<Brain className="w-4 h-4" />} title="AI Readability" />
            <p className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-primary)' }}>{report.ai_readability}</p>
          </div>
        )}

        {report.estimated_impact && (
          <div className="rounded-lg p-5" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
            <SectionHeader icon={<TrendingUp className="w-4 h-4" />} title="Estimated Impact" />
            <p className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-primary)' }}>{report.estimated_impact}</p>
          </div>
        )}
      </div>
    </div>
  )
}
