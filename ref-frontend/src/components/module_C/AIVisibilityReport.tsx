'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { useGetVisibilityReportQuery, useRunModuleCAnalysisMutation } from '@/store/api/module_C/moduleCApi'
import { useGetJobStatusQuery } from '@/store/api/jobApi'
import { AnalysisEmptyState } from '@/components/common/AnalysisEmptyState'
import type { AIVisibilityIssue, AIVisibilityRecommendation } from '@/store/api/module_C/moduleCApi'

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
        badge: 'bg-red-500/15 text-red-400 border-red-500/30',
        icon: <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />,
        border: 'border-l-red-500',
      }
    case 'Medium':
      return {
        badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
        icon: <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />,
        border: 'border-l-yellow-500',
      }
    default:
      return {
        badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        icon: <Lightbulb className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />,
        border: 'border-l-blue-500',
      }
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-primary">{icon}</span>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
    </div>
  )
}

function IssueCard({ issue }: { issue: AIVisibilityIssue }) {
  const styles = getSeverityStyles(issue.severity)
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border border-border bg-background border-l-4',
        styles.border
      )}
    >
      {styles.icon}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-medium text-foreground">{issue.title}</span>
          <Badge className={cn('text-xs border px-2 py-0', styles.badge)}>{issue.severity}</Badge>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {issue.field}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{issue.explanation}</p>
      </div>
    </div>
  )
}

function RecommendationCard({ rec, index }: { rec: AIVisibilityRecommendation; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">{rec.issue}</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Why It Matters
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">{rec.why_it_matters}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              How To Fix
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">{rec.how_to_fix}</p>
          </div>
          {rec.example_fix && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Example
              </p>
              <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto text-foreground whitespace-pre-wrap">
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
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null)

  const { data, isLoading, isFetching, refetch } = useGetVisibilityReportQuery(jobId || '', {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const [runAnalysis] = useRunModuleCAnalysisMutation()

  const { data: analysisJobData } = useGetJobStatusQuery(analysisJobId || '', {
    skip: !analysisJobId,
    pollingInterval: analysisJobId ? 2000 : 0,
  })

  useEffect(() => {
    if (analysisJobData?.status === 'COMPLETED' || analysisJobData?.status === 'FAILED') {
      setAnalysisJobId(null)
      if (analysisJobData?.status === 'COMPLETED') refetch()
    }
  }, [analysisJobData?.status, refetch])

  const handleRunAnalysis = async () => {
    if (!jobId) return
    try {
      const result = await runAnalysis({ jobId, url }).unwrap()
      if (result.data?.analysisJobId) setAnalysisJobId(result.data.analysisJobId)
    } catch (error) {
      console.error('Failed to start analysis:', error)
    }
  }

  const isAnalyzing = !!analysisJobId

  const report = data?.data?.data ?? null
  const reportUrl = data?.data?.url ?? ''
  const timestamp = data?.data?.timestamp ?? ''

  // ── Loading ──
  if (isLoading || isFetching) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading AI Visibility Report…</p>
      </div>
    )
  }

  // ── No job ──
  if (!jobId) {
    return (
      <AnalysisEmptyState
        icon={<Brain className="w-8 h-8 text-zinc-600" />}
        title="No Report Available"
        description="Please run a crawl and an AEO analysis first before viewing the AI Visibility Report."
      />
    )
  }

  // ── No report yet (AEO analysis hasn't run) ──
  if (!report || ('error' in report && report.error)) {
    return (
      <AnalysisEmptyState
        icon={<Brain className="w-8 h-8 text-zinc-600" />}
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
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">AI Visibility Report</h2>
            <Badge variant="outline" className="text-xs text-primary border-primary/40">
              AI Consultant
            </Badge>
          </div>
          {reportUrl && (
            <p className="text-xs text-muted-foreground truncate max-w-sm" title={reportUrl}>
              {reportUrl}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {highIssues > 0 && (
            <Badge className="bg-red-500/15 text-red-400 border border-red-500/30 text-xs">
              {highIssues} High
            </Badge>
          )}
          {mediumIssues > 0 && (
            <Badge className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 text-xs">
              {mediumIssues} Medium
            </Badge>
          )}
          {timestamp && (
            <span className="text-xs text-muted-foreground">
              {new Date(timestamp).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      {report.summary && (
        <div className="rounded-lg border border-border bg-muted/30 p-5">
          <SectionHeader icon={<BookOpen className="w-4 h-4" />} title="Overall AI Visibility Summary" />
          <p className="text-sm text-muted-foreground leading-relaxed">{report.summary}</p>
        </div>
      )}

      {/* ── Priority Fixes ── */}
      {report.priority_fixes && report.priority_fixes.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
          <SectionHeader icon={<Zap className="w-4 h-4" />} title="Top 3 Priority Fixes" />
          <ol className="space-y-2">
            {report.priority_fixes.map((fix, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground leading-relaxed">{fix}</span>
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
                  className="flex items-start gap-3 p-3 rounded-lg border border-green-500/20 bg-green-500/5"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground leading-relaxed">{signal}</p>
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
          <div className="rounded-lg border border-border bg-muted/30 p-5">
            <SectionHeader icon={<Brain className="w-4 h-4" />} title="AI Readability" />
            <p className="text-sm text-muted-foreground leading-relaxed">{report.ai_readability}</p>
          </div>
        )}

        {report.estimated_impact && (
          <div className="rounded-lg border border-border bg-muted/30 p-5">
            <SectionHeader icon={<TrendingUp className="w-4 h-4" />} title="Estimated Impact" />
            <p className="text-sm text-muted-foreground leading-relaxed">{report.estimated_impact}</p>
          </div>
        )}
      </div>
    </div>
  )
}
