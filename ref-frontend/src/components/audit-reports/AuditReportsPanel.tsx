'use client'

import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Info,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Settings,
  Shield,
  X,
} from 'lucide-react'
import { useGetAuditReportQuery, useGetAuditReportHistoryQuery } from '@/store/api/auditReportsApi'
import type { AuditIssue, AuditCategory, AuditSeverity, AuditReport } from '@/store/api/auditReportsApi'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  jobId: string | undefined
  onNavigate?: (section: string) => void
}

type SeverityFilter = 'all' | AuditSeverity
type TabType = AuditCategory

// ─── Static Config ────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  AuditSeverity,
  {
    label: string
    color: string
    bgColor: string
    borderColor: string
    leftBorder: string
    dotColor: string
    barColor: string
    icon: React.ElementType
  }
> = {
  critical: {
    label: 'Critical',
    color: '#b91c1c',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
    leftBorder: '#ef4444',
    dotColor: '#ef4444',
    barColor: '#ef4444',
    icon: AlertTriangle,
  },
  warning: {
    label: 'Warning',
    color: '#92400e',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    leftBorder: '#f59e0b',
    dotColor: '#f59e0b',
    barColor: '#f59e0b',
    icon: AlertTriangle,
  },
  info: {
    label: 'Info',
    color: '#1e40af',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    leftBorder: '#3b82f6',
    dotColor: '#3b82f6',
    barColor: '#3b82f6',
    icon: Info,
  },
}

const CATEGORY_CONFIG: Record<TabType, { label: string; icon: React.ElementType; description: string }> = {
  technical: {
    label: 'Technical',
    icon: Settings,
    description:
      'Crawlability, indexability, performance, and on-page HTML signals that affect how search engines access your site.',
  },
  content: {
    label: 'Content',
    icon: FileText,
    description:
      'Content depth, readability, duplication, and social metadata that determine ranking potential and AI citation eligibility.',
  },
  structured_data: {
    label: 'Structured Data',
    icon: Shield,
    description:
      'Schema markup, rich result eligibility, and AI discoverability signals via structured data and llms.txt.',
  },
}

const ISSUE_META: Record<string, { impact: string; effort: 'Quick Fix' | 'Medium Effort' | 'Complex' }> = {
  broken_pages_4xx: { impact: 'Damages UX & Rankings', effort: 'Quick Fix' },
  broken_pages_5xx: { impact: 'Damages UX & Rankings', effort: 'Complex' },
  missing_title: { impact: 'Directly Affects Rankings', effort: 'Quick Fix' },
  missing_meta_description: { impact: 'Reduces Click-Through Rate', effort: 'Quick Fix' },
  duplicate_titles: { impact: 'Dilutes Ranking Signals', effort: 'Medium Effort' },
  missing_canonical: { impact: 'Causes Index Confusion', effort: 'Quick Fix' },
  redirect_pages: { impact: 'Leaks Link Equity', effort: 'Medium Effort' },
  noindex_pages: { impact: 'Review Required', effort: 'Quick Fix' },
  slow_pages: { impact: 'Hurts Core Web Vitals', effort: 'Complex' },
  large_pages: { impact: 'Slows Load Time', effort: 'Medium Effort' },
  missing_viewport: { impact: 'Breaks Mobile Experience', effort: 'Quick Fix' },
  mixed_content: { impact: 'Security Warnings Shown', effort: 'Medium Effort' },
  missing_h1: { impact: 'Weakens Topic Relevance', effort: 'Quick Fix' },
  thin_content: { impact: 'Low Ranking Potential', effort: 'Medium Effort' },
  duplicate_content: { impact: 'Dilutes Link Equity', effort: 'Medium Effort' },
  low_readability: { impact: 'Reduces AI Citation Odds', effort: 'Complex' },
  grammar_errors: { impact: 'Undermines E-E-A-T Trust', effort: 'Medium Effort' },
  missing_og_tags: { impact: 'Poor Social Previews', effort: 'Quick Fix' },
  missing_schema: { impact: 'Misses Rich Results', effort: 'Medium Effort' },
  missing_faq_schema: { impact: 'Misses FAQ Rich Results', effort: 'Quick Fix' },
  schema_validation_errors: { impact: 'Blocks Rich Results', effort: 'Medium Effort' },
  missing_llms_txt: { impact: 'Reduces AI Discoverability', effort: 'Quick Fix' },
}

const EFFORT_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  'Quick Fix': { color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  'Medium Effort': { color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  Complex: { color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
}

const FIX_NAV_MAP: Record<string, string> = {
  broken_pages_4xx: 'broken-links',
  broken_pages_5xx: 'broken-links',
  redirect_pages: 'technical-audit',
  missing_title: 'crawled-data',
  missing_meta_description: 'crawled-data',
  duplicate_titles: 'crawled-data',
  missing_canonical: 'crawled-data',
  noindex_pages: 'crawled-data',
  slow_pages: 'page-metrics',
  large_pages: 'page-metrics',
  missing_viewport: 'crawled-data',
  mixed_content: 'crawled-data',
  missing_h1: 'crawled-data',
  thin_content: 'content-audit',
  duplicate_content: 'content-audit',
  low_readability: 'text-quality',
  grammar_errors: 'text-quality',
  missing_og_tags: 'crawled-data',
  missing_schema: 'structured-data',
  missing_faq_schema: 'structured-data',
  schema_validation_errors: 'structured-data',
  missing_llms_txt: 'structured-data',
}

const NAV_LABELS: Record<string, string> = {
  'broken-links': 'Broken Links',
  'technical-audit': 'Technical Audit',
  'crawled-data': 'Crawled Data',
  'page-metrics': 'Page Metrics',
  'content-audit': 'Content Audit',
  'text-quality': 'Text Quality',
  'structured-data': 'Structured Data',
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function computeHealthScore(issues: AuditIssue[], category: AuditCategory): number {
  const cat = issues.filter((i) => i.category === category && i.affected_count > 0)
  const critical = cat.filter((i) => i.severity === 'critical').length
  const warning = cat.filter((i) => i.severity === 'warning').length
  const info = cat.filter((i) => i.severity === 'info').length
  const deduction = Math.min(60, critical * 20) + Math.min(30, warning * 7) + Math.min(10, info * 3)
  return Math.max(0, 100 - deduction)
}

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  if (score >= 40) return '#f97316'
  return '#ef4444'
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 55) return 'Fair'
  if (score >= 35) return 'Poor'
  return 'Critical'
}

function scoreLabelColor(score: number): string {
  if (score >= 75) return '#059669'
  if (score >= 55) return '#d97706'
  return '#dc2626'
}

// Escape a single CSV cell value
function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}`
}

function generateAuditCSV(
  report: AuditReport,
  issues: AuditIssue[],
  reportTitle: string,
  filename: string,
) {
  const lines: string[] = []
  const c = csvCell

  // ── Report metadata block ────────────────────────────────────────────────
  lines.push(`${c('AUDIT REPORT')},${c(reportTitle)}`)
  lines.push(`${c('Generated')},${c(new Date(report.generated_at).toLocaleString())}`)
  lines.push(`${c('Crawl Date')},${c(new Date(report.crawl_date).toLocaleDateString())}`)
  lines.push('')

  // ── Summary block ────────────────────────────────────────────────────────
  lines.push(c('SUMMARY'))
  lines.push(`${c('Total Issues')},${c(report.summary.total)}`)
  lines.push(`${c('Critical')},${c(report.summary.critical)}`)
  lines.push(`${c('Warnings')},${c(report.summary.warning)}`)
  lines.push(`${c('Info')},${c(report.summary.info)}`)
  lines.push(`${c('Resolved Since Last Crawl')},${c(report.summary.resolved_since_last)}`)
  lines.push('')

  // ── Issues table ─────────────────────────────────────────────────────────
  const SEVERITY_ORDER: Record<AuditSeverity, number> = { critical: 0, warning: 1, info: 2 }
  const sorted = [...issues]
    .filter((i) => i.affected_count > 0)
    .sort((a, b) => {
      const diff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      return diff !== 0 ? diff : b.affected_count - a.affected_count
    })

  const columns = [
    'Priority',
    'Category',
    'Severity',
    'Issue',
    'Total Affected Pages',
    'Impact',
    'Effort',
    'Description',
    'Example URLs (up to 5)',
    'Recommended Fix',
    'Status',
  ]
  lines.push(columns.map(c).join(','))

  sorted.forEach((issue, idx) => {
    const meta = ISSUE_META[issue.id]
    const category = issue.category
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    const severity = issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)
    const urlsCell = issue.example_urls.join(' | ')
    const row = [
      String(idx + 1),
      category,
      severity,
      issue.title,
      String(issue.affected_count),
      meta?.impact ?? '',
      meta?.effort ?? '',
      issue.description,
      urlsCell,
      issue.fix,
      'Open',
    ]
    lines.push(row.map(c).join(','))
  })

  // UTF-8 BOM so Excel opens with correct encoding
  const csv = lines.join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Health Gauge (SVG ring) ──────────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const size = 56
  const center = size / 2
  const radius = 22
  const sw = 5
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (score / 100) * circumference
  const color = scoreColor(score)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--nd-border)" strokeWidth={sw} />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold leading-none" style={{ color: 'var(--nd-text-primary)' }}>{score}</span>
      </div>
    </div>
  )
}

// ─── Health Score Card ────────────────────────────────────────────────────────

function HealthScoreCard({
  category,
  issues,
  isActive,
  onClick,
}: {
  category: AuditCategory
  issues: AuditIssue[]
  isActive: boolean
  onClick: () => void
}) {
  const cfg = CATEGORY_CONFIG[category]
  const Icon = cfg.icon
  const score = computeHealthScore(issues, category)
  const label = scoreLabel(score)
  const labelColor = scoreLabelColor(score)
  const catIssues = issues.filter((i) => i.category === category && i.affected_count > 0)
  const criticalCount = catIssues.filter((i) => i.severity === 'critical').length
  const warningCount = catIssues.filter((i) => i.severity === 'warning').length

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer"
      style={{
        borderColor: isActive ? 'var(--nd-purple)' : 'var(--nd-border)',
        background: isActive ? 'var(--nd-purple-subtle)' : 'var(--nd-card-bg)',
      }}
    >
      <div className="flex items-center gap-3">
        <HealthGauge score={score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Icon className="h-3 w-3 shrink-0" style={{ color: 'var(--nd-text-muted)' }} />
            <span className="text-[11px] font-medium truncate" style={{ color: 'var(--nd-text-secondary)' }}>{cfg.label}</span>
          </div>
          <span className="text-sm font-bold" style={{ color: label ? labelColor : 'var(--nd-text-primary)' }}>{label}</span>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {criticalCount > 0 && <span className="text-[10px]" style={{ color: '#b91c1c' }}>{criticalCount} critical</span>}
            {warningCount > 0 && (
              <span className="text-[10px]" style={{ color: '#92400e' }}>
                {warningCount} warning{warningCount > 1 ? 's' : ''}
              </span>
            )}
            {catIssues.length === 0 && <span className="text-[10px]" style={{ color: '#059669' }}>No issues</span>}
          </div>
        </div>
      </div>
    </button>
  )
}

// ─── Distribution Bar ─────────────────────────────────────────────────────────

function DistributionBar({ issues }: { issues: AuditIssue[] }) {
  const critical = issues.filter((i) => i.severity === 'critical').length
  const warning = issues.filter((i) => i.severity === 'warning').length
  const info = issues.filter((i) => i.severity === 'info').length
  const total = critical + warning + info

  if (total === 0) return null

  return (
    <div className="rounded-xl border px-4 py-3 space-y-2.5" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
      <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: 'var(--nd-text-muted)' }}>Issue Breakdown</p>
      <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--nd-bg)' }}>
        {critical > 0 && (
          <div className="h-full" style={{ width: `${(critical / total) * 100}%`, background: SEVERITY_CONFIG.critical.barColor }} />
        )}
        {warning > 0 && (
          <div className="h-full" style={{ width: `${(warning / total) * 100}%`, background: SEVERITY_CONFIG.warning.barColor }} />
        )}
        {info > 0 && (
          <div className="h-full" style={{ width: `${(info / total) * 100}%`, background: SEVERITY_CONFIG.info.barColor }} />
        )}
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        {critical > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SEVERITY_CONFIG.critical.dotColor }} />
            <span className="text-[11px]" style={{ color: SEVERITY_CONFIG.critical.color }}>{critical} critical</span>
          </div>
        )}
        {warning > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SEVERITY_CONFIG.warning.dotColor }} />
            <span className="text-[11px]" style={{ color: SEVERITY_CONFIG.warning.color }}>
              {warning} warning{warning > 1 ? 's' : ''}
            </span>
          </div>
        )}
        {info > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SEVERITY_CONFIG.info.dotColor }} />
            <span className="text-[11px]" style={{ color: SEVERITY_CONFIG.info.color }}>{info} info</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── URL List Modal ───────────────────────────────────────────────────────────

function UrlListModal({ issue, onClose }: { issue: AuditIssue; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  const filtered = useMemo(
    () =>
      !search
        ? issue.example_urls
        : issue.example_urls.filter((u) => u.toLowerCase().includes(search.toLowerCase())),
    [issue.example_urls, search],
  )

  function copyAll() {
    navigator.clipboard.writeText(issue.example_urls.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 rounded-2xl overflow-hidden shadow-2xl" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-card-bg)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--nd-border)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--nd-text-primary)' }}>{issue.title}</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--nd-text-muted)' }}>{issue.affected_count} pages affected</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyAll}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer"
              style={{ borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)', background: 'var(--nd-bg)' }}
            >
              <Copy className="h-3 w-3" />
              {copied ? 'Copied!' : 'Copy all'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors cursor-pointer"
              style={{ color: 'var(--nd-text-muted)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="px-5 pt-3 pb-2" style={{ borderBottom: '1px solid var(--nd-border)' }}>
          <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--nd-text-muted)' }} />
            <input
              type="text"
              placeholder="Filter URLs\u2026"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: 'var(--nd-text-primary)' }}
            />
          </div>
        </div>
        <div className="p-5 max-h-80 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--nd-text-muted)' }}>No URLs match your filter.</p>
          ) : (
            filtered.map((url) => (
              <div
                key={url}
                className="flex items-center gap-2 group px-2 py-1.5 rounded-lg transition-colors"
                style={{ background: 'var(--nd-bg)' }}
              >
                <span className="flex-1 text-[11px] font-mono truncate" style={{ color: 'var(--nd-text-secondary)' }}>{url}</span>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--nd-blue)' }}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))
          )}
          {issue.affected_count > issue.example_urls.length && (
            <p className="text-xs pt-2 text-center" style={{ borderTop: '1px solid var(--nd-border)', color: 'var(--nd-text-muted)' }}>
              Showing {issue.example_urls.length} of {issue.affected_count} total pages
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Issue Card ───────────────────────────────────────────────────────────────

function IssueCard({
  issue,
  onNavigate,
}: {
  issue: AuditIssue
  onNavigate?: (section: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const cfg = SEVERITY_CONFIG[issue.severity]
  const Icon = cfg.icon
  const meta = ISSUE_META[issue.id]
  const navTarget = FIX_NAV_MAP[issue.id]
  const effortCfg = meta ? EFFORT_CONFIG[meta.effort] : null

  return (
    <>
      {showUrlModal && <UrlListModal issue={issue} onClose={() => setShowUrlModal(false)} />}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
        <div className="flex items-start border-l-[3px]" style={{ borderLeftColor: cfg.leftBorder }}>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-1 flex items-start gap-3 px-4 py-3.5 text-left cursor-pointer hover:bg-black/5 transition-colors"
          >
            <Icon className="shrink-0 h-4 w-4 mt-0.5" style={{ color: cfg.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold leading-tight" style={{ color: 'var(--nd-text-primary)' }}>{issue.title}</span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{ background: cfg.bgColor, color: cfg.color, borderColor: cfg.borderColor }}
                >
                  {cfg.label}
                </span>
              </div>
              {meta && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[11px]" style={{ color: 'var(--nd-text-muted)' }}>&#8599; {meta.impact}</span>
                  {effortCfg && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-md border font-medium"
                      style={{ color: effortCfg.color, background: effortCfg.bg, borderColor: effortCfg.border }}
                    >
                      {meta.effort}
                    </span>
                  )}
                </div>
              )}
            </div>
          </button>
          <button
            onClick={() => setShowUrlModal(true)}
            className="shrink-0 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border mt-3.5 mr-2 hover:opacity-80 transition-opacity cursor-pointer"
            style={{ background: cfg.bgColor, color: cfg.color, borderColor: cfg.borderColor }}
          >
            {issue.affected_count.toLocaleString()} page{issue.affected_count !== 1 ? 's' : ''}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 px-2 py-3.5 cursor-pointer hover:bg-black/5 transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" style={{ color: 'var(--nd-text-muted)' }} />
            ) : (
              <ChevronDown className="h-4 w-4" style={{ color: 'var(--nd-text-muted)' }} />
            )}
          </button>
        </div>

        {expanded && (
          <div className="px-5 pb-4 pt-3 space-y-4" style={{ borderTop: '1px solid var(--nd-border)' }}>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--nd-text-secondary)' }}>{issue.description}</p>

            {issue.example_urls.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: 'var(--nd-text-muted)' }}>
                  Affected Pages (sample)
                </p>
                <div className="rounded-lg divide-y overflow-hidden" style={{ border: '1px solid var(--nd-border)', background: 'var(--nd-bg)' }}>
                  {issue.example_urls.slice(0, 5).map((url) => (
                    <div
                      key={url}
                      className="flex items-center gap-2 px-3 py-2 group transition-colors hover:bg-black/5"
                    >
                      <span className="flex-1 text-[11px] font-mono truncate" style={{ color: 'var(--nd-text-secondary)' }}>{url}</span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--nd-blue)' }}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
                {issue.affected_count > 5 && (
                  <button
                    onClick={() => setShowUrlModal(true)}
                    className="text-[11px] transition-colors cursor-pointer"
                    style={{ color: 'var(--nd-purple)' }}
                  >
                    View all {issue.affected_count.toLocaleString()} affected pages &#8594;
                  </button>
                )}
              </div>
            )}

            <div className="rounded-lg border p-3.5 space-y-1.5" style={{ background: 'var(--nd-positive-bg)', borderColor: '#bbf7d0' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#065f46' }}>
                Recommended Fix
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--nd-text-primary)' }}>{issue.fix}</p>
            </div>

            {navTarget && onNavigate && (
              <button
                onClick={() => onNavigate(navTarget)}
                className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg transition-all cursor-pointer"
                style={{ background: 'var(--nd-purple-subtle)', border: '1px solid var(--nd-purple)', color: 'var(--nd-purple)' }}
              >
                Inspect in {NAV_LABELS[navTarget] ?? navTarget}
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuditReportsPanel({ jobId, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('technical')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')

  const { data, isLoading, isFetching, refetch, error } = useGetAuditReportQuery(jobId!, {
    skip: !jobId,
  })
  const { data: history } = useGetAuditReportHistoryQuery(jobId!, { skip: !jobId })

  const report = data?.report
  const hasPriorReport = data?.has_prior_report ?? false

  const visibleIssues = useMemo(() => {
    if (!report?.issues) return []
    return report.issues.filter((i) => {
      if (i.category !== activeTab) return false
      if (severityFilter !== 'all' && i.severity !== severityFilter) return false
      return i.affected_count > 0
    })
  }, [report, activeTab, severityFilter])

  const tabIssues = useMemo(() => {
    if (!report?.issues) return []
    return report.issues.filter((i) => i.category === activeTab && i.affected_count > 0)
  }, [report, activeTab])

  const tabCounts = useMemo(() => {
    if (!report?.issues) return { technical: 0, content: 0, structured_data: 0 }
    return {
      technical: report.issues.filter((i) => i.category === 'technical' && i.affected_count > 0).length,
      content: report.issues.filter((i) => i.category === 'content' && i.affected_count > 0).length,
      structured_data: report.issues.filter(
        (i) => i.category === 'structured_data' && i.affected_count > 0,
      ).length,
    }
  }, [report])

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
          <div className="h-5 w-40 rounded-md mb-3" style={{ background: 'var(--nd-border)' }} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl" style={{ background: 'var(--nd-border)' }} />
            ))}
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl" style={{ background: 'var(--nd-border)' }} />
        ))}
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
        <p className="text-sm" style={{ color: 'var(--nd-text-muted)' }}>No audit data available yet. Run a crawl to generate an audit report.</p>
        <p className="text-xs mt-1" style={{ color: 'var(--nd-purple)', cursor: 'pointer' }}>Go to Crawler</p>
      </div>
    )
  }

  if (!jobId) {
    return (
      <div className="flex items-center justify-center py-24 text-sm" style={{ color: 'var(--nd-text-muted)' }}>
        No job data available.
      </div>
    )
  }

  const { summary } = report

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>Audit Report</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--nd-text-muted)' }}>
            Generated {new Date(report.generated_at).toLocaleString()} \u00b7 Crawl date{' '}
            {new Date(report.crawl_date).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {history && history.length > 1 && (
            <select
              className="text-xs rounded-lg px-3 py-1.5 cursor-pointer focus:outline-none"
              style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)', color: 'var(--nd-text-secondary)' }}
              defaultValue={report.generated_at}
            >
              {history.map((h) => (
                <option key={h.generated_at} value={h.generated_at}>
                  {new Date(h.crawl_date).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)', color: 'var(--nd-text-secondary)' }}
          >
            <Printer className="h-3.5 w-3.5" />
            Print / PDF
          </button>
          <button
            onClick={() =>
              generateAuditCSV(
                report,
                report.issues.filter((i) => i.category === activeTab),
                CATEGORY_CONFIG[activeTab].label,
                `audit-${activeTab}-${report.crawl_date.slice(0, 10)}`,
              )
            }
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ background: 'var(--nd-bg)', border: '1px solid var(--nd-border)', color: 'var(--nd-text-secondary)' }}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            style={{ color: 'var(--nd-text-muted)' }}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!hasPriorReport && (
        <div className="rounded-xl border px-4 py-3 flex items-start gap-3" style={{ borderColor: '#bfdbfe', background: '#eff6ff' }}>
          <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#2563eb' }} />
          <p className="text-xs leading-relaxed" style={{ color: '#1e40af' }}>
            <span className="font-semibold">This is your baseline report.</span> Future reports will
            highlight which issues were resolved and which are newly introduced since this crawl.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(CATEGORY_CONFIG) as TabType[]).map((cat) => (
          <HealthScoreCard
            key={cat}
            category={cat}
            issues={report.issues}
            isActive={activeTab === cat}
            onClick={() => {
              setActiveTab(cat)
              setSeverityFilter('all')
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--nd-text-muted)' }}>Total Issues</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--nd-text-primary)' }}>{summary.total.toLocaleString()}</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--nd-text-muted)' }}>across all categories</p>
        </div>
        <div className="rounded-xl border px-4 py-3" style={{ borderColor: '#fecaca', background: '#fef2f2' }}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: '#b91c1c' }}>Critical</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#b91c1c' }}>{summary.critical.toLocaleString()}</p>
          <p className="text-[11px] mt-0.5" style={{ color: '#dc2626' }}>Fix immediately</p>
        </div>
        <div className="rounded-xl border px-4 py-3" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: '#92400e' }}>Warnings</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#92400e' }}>{summary.warning.toLocaleString()}</p>
          <p className="text-[11px] mt-0.5" style={{ color: '#d97706' }}>Should be addressed</p>
        </div>
        <div
          className="rounded-xl border px-4 py-3"
          style={summary.resolved_since_last > 0
            ? { borderColor: '#a7f3d0', background: '#ecfdf5' }
            : { borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}
        >
          <p className="text-[11px] uppercase tracking-wider"
            style={{ color: summary.resolved_since_last > 0 ? '#065f46' : 'var(--nd-text-muted)' }}
          >Resolved</p>
          <p className="text-2xl font-bold mt-1"
            style={{ color: summary.resolved_since_last > 0 ? '#065f46' : 'var(--nd-text-primary)' }}
          >{summary.resolved_since_last}</p>
          <p className="text-[11px] mt-0.5"
            style={{ color: summary.resolved_since_last > 0 ? '#059669' : 'var(--nd-text-muted)' }}
          >{hasPriorReport ? 'since last report' : 'baseline report'}</p>
        </div>
      </div>

      {summary.total === 0 && (
        <div className="rounded-xl border px-4 py-3 flex items-center gap-3" style={{ borderColor: '#a7f3d0', background: '#ecfdf5' }}>
          <CheckCircle className="h-5 w-5 shrink-0" style={{ color: '#059669' }} />
          <p className="text-sm font-medium" style={{ color: '#065f46' }}>
            No issues found across all audit categories. Your site is in excellent health.
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--nd-border)' }}>
        {(Object.keys(CATEGORY_CONFIG) as TabType[]).map((tab) => {
          const cfg = CATEGORY_CONFIG[tab]
          const Icon = cfg.icon
          const count = tabCounts[tab]
          const isActive = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab)
                setSeverityFilter('all')
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap -mb-px ${
                isActive
                  ? 'border-(--nd-purple) text-(--nd-purple)'
                  : 'border-transparent hover:border-(--nd-border-hover)'
              }`}
              style={isActive ? { color: 'var(--nd-purple)', borderBottomColor: 'var(--nd-purple)' } : { color: 'var(--nd-text-muted)', borderBottomColor: 'transparent' }}
            >
              <Icon className="h-4 w-4" />
              {cfg.label}
              {count > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={isActive ? { background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)' } : { background: 'var(--nd-bg)', color: 'var(--nd-text-muted)' }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--nd-text-muted)' }}>{CATEGORY_CONFIG[activeTab].description}</p>

      <DistributionBar issues={tabIssues} />

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--nd-text-muted)' }} />
        {(['all', 'critical', 'warning', 'info'] as SeverityFilter[]).map((filter) => {
          const isActive = severityFilter === filter
          const cfg = filter !== 'all' ? SEVERITY_CONFIG[filter] : null
          const activeStyle = cfg
            ? { background: cfg.bgColor, color: cfg.color, borderColor: cfg.borderColor }
            : { background: 'var(--nd-purple-subtle)', color: 'var(--nd-purple)', borderColor: 'var(--nd-purple)' }
          const inactiveStyle = { background: 'transparent', color: 'var(--nd-text-muted)', borderColor: 'var(--nd-border)' }
          return (
            <button
              key={filter}
              onClick={() => setSeverityFilter(filter)}
              className="text-xs font-medium px-3 py-1 rounded-full border transition-colors cursor-pointer"
              style={isActive ? activeStyle : inactiveStyle}
            >
              {filter === 'all' ? 'All Issues' : cfg?.label ?? filter}
            </button>
          )
        })}
      </div>

      <div className="space-y-2.5">
        {visibleIssues.length === 0 ? (
          <div className="rounded-2xl border py-16 text-center" style={{ borderColor: 'var(--nd-border)', background: 'var(--nd-card-bg)' }}>
            <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-80" style={{ color: '#059669' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--nd-text-secondary)' }}>
              {severityFilter === 'all'
                ? `No ${CATEGORY_CONFIG[activeTab].label.toLowerCase()} issues found.`
                : `No ${severityFilter} issues in this category.`}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--nd-text-muted)' }}>
              {severityFilter !== 'all'
                ? 'Try switching the filter above.'
                : 'Great work \u2014 this audit category is clean.'}
            </p>
          </div>
        ) : (
          visibleIssues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} onNavigate={onNavigate} />
          ))
        )}
      </div>

      {visibleIssues.length > 0 && (
        <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--nd-border)' }}>
          <button
            onClick={() =>
              generateAuditCSV(
                report,
                report.issues.filter((i) => i.category === activeTab),
                CATEGORY_CONFIG[activeTab].label,
                `audit-${activeTab}-${report.crawl_date.slice(0, 10)}`,
              )
            }
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg border transition-colors cursor-pointer"
            style={{ borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)', background: 'var(--nd-card-bg)' }}
          >
            <Download className="h-3.5 w-3.5" />
            Export {CATEGORY_CONFIG[activeTab].label} CSV
          </button>
          <button
            onClick={() =>
              generateAuditCSV(
                report,
                report.issues,
                'Full Audit Report',
                `full-audit-${report.crawl_date.slice(0, 10)}`,
              )
            }
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg border transition-colors cursor-pointer"
            style={{ borderColor: 'var(--nd-border)', color: 'var(--nd-text-secondary)', background: 'var(--nd-card-bg)' }}
          >
            <Download className="h-3.5 w-3.5" />
            Full Report CSV
          </button>
        </div>
      )}
    </div>
  )
}
