'use client'

import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Search,
  Download,
  Zap,
  Shield,
  FileText,
  Heading1,
  Globe,
  BarChart3,
  Share2,
  Smartphone,
  Lightbulb,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGetJobRecommendationsQuery } from '@/store/api/jobApi'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Recommendation {
  priority: number
  category: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  issue: string
  fix: string
  impact: string
  fields_affected: string[]
}

interface PageRecommendation {
  url: string
  health_score: number | null
  summary: {
    total: number
    critical: number
    warning: number
    info: number
    by_category: Record<string, number>
  } | null
  recommendations: Recommendation[]
}

interface Aggregate {
  total_pages: number
  avg_health_score: number
  critical: number
  warning: number
  info: number
  by_category: Record<string, number>
}

interface RecommendationsPanelProps {
  jobId: string
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Indexability':      <Shield className="w-3.5 h-3.5" />,
  'Titles & Meta':     <FileText className="w-3.5 h-3.5" />,
  'Heading Structure': <Heading1 className="w-3.5 h-3.5" />,
  'Content Quality':   <FileText className="w-3.5 h-3.5" />,
  'Structured Data':   <Globe className="w-3.5 h-3.5" />,
  'Page Speed':        <Zap className="w-3.5 h-3.5" />,
  'Open Graph':        <Share2 className="w-3.5 h-3.5" />,
  'Security & Mobile': <Smartphone className="w-3.5 h-3.5" />,
}

const PRIORITY_LABEL: Record<number, string> = {
  1: 'Fix First',
  2: 'Fix First',
  3: 'Fix First',
  4: 'High Value',
  5: 'High Value',
  6: 'Medium',
  7: 'Medium',
  8: 'Medium',
}

const ALL_CATEGORIES = [
  'Indexability',
  'Titles & Meta',
  'Heading Structure',
  'Content Quality',
  'Structured Data',
  'Page Speed',
  'Open Graph',
  'Security & Mobile',
]

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: Recommendation['severity'] }) {
  if (severity === 'critical') return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
  if (severity === 'warning')  return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
  return <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
}

function SeverityBadge({ severity }: { severity: Recommendation['severity'] }) {
  const map = {
    critical: 'bg-rose-500/15 text-rose-400 border border-rose-500/20',
    warning:  'bg-amber-500/15 text-amber-400 border border-amber-500/20',
    info:     'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[severity]}`}>
      {severity}
    </span>
  )
}

function HealthRing({ score }: { score: number }) {
  const color = score >= 80 ? 'stroke-emerald-400' : score >= 60 ? 'stroke-amber-400' : 'stroke-rose-400'
  const textColor = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-rose-400'
  const r = 20
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#27272a" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" className={color} transform="rotate(-90 28 28)" />
      </svg>
      <span className={`absolute text-sm font-bold ${textColor}`}>{score}</span>
    </div>
  )
}

function AggregateHeader({ agg }: { agg: Aggregate }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div className="rounded-xl border border-zinc-800 bg-[#111113] p-4 flex items-center gap-3">
        <HealthRing score={agg.avg_health_score} />
        <div>
          <div className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Avg Health</div>
          <div className="text-lg font-bold text-white">{agg.avg_health_score}/100</div>
          <div className="text-xs text-zinc-500">{agg.total_pages} pages</div>
        </div>
      </div>

      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-400" />
          <span className="text-2xl font-bold text-rose-400">{agg.critical}</span>
        </div>
        <div className="text-xs text-rose-400 font-medium mt-1">Critical Issues</div>
        <div className="text-xs text-zinc-500">Fix these first</div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <span className="text-2xl font-bold text-amber-400">{agg.warning}</span>
        </div>
        <div className="text-xs text-amber-400 font-medium mt-1">Warnings</div>
        <div className="text-xs text-zinc-500">High-value fixes</div>
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex flex-col justify-center">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-400" />
          <span className="text-2xl font-bold text-blue-400">{agg.info}</span>
        </div>
        <div className="text-xs text-blue-400 font-medium mt-1">Suggestions</div>
        <div className="text-xs text-zinc-500">Nice-to-have</div>
      </div>
    </div>
  )
}

function CategoryBreakdown({ byCategory }: { byCategory: Record<string, number> }) {
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return null
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Issues by Category</h3>
      <div className="flex flex-wrap gap-2">
        {sorted.map(([cat, count]) => (
          <div key={cat} className="flex items-center gap-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm">
            <span className="text-zinc-400">{CATEGORY_ICONS[cat] ?? <BarChart3 className="w-3.5 h-3.5" />}</span>
            <span className="text-zinc-300 font-medium">{cat}</span>
            <span className="ml-1 bg-zinc-700 text-zinc-300 rounded-full px-2 py-0.5 text-xs font-bold">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-zinc-700/50 rounded-lg bg-zinc-800/40 overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-zinc-800/60 transition-colors cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <SeverityIcon severity={rec.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-100">{rec.title}</span>
            <SeverityBadge severity={rec.severity} />
            <span className="text-xs text-zinc-600 hidden sm:inline">
              P{rec.priority} · {PRIORITY_LABEL[rec.priority] ?? 'Improvement'}
            </span>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{rec.issue}</div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
          : <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="border-t border-zinc-700/50 bg-zinc-900/60 px-4 py-4 space-y-3 text-sm">
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Issue</div>
            <p className="text-zinc-300">{rec.issue}</p>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">How to Fix</div>
            <p className="text-zinc-300">{rec.fix}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-1">Expected Impact</div>
            <p className="text-zinc-300">{rec.impact}</p>
          </div>
          {rec.fields_affected.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-1">Fields</div>
              <div className="flex flex-wrap gap-1">
                {rec.fields_affected.map((f) => (
                  <code key={f} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 rounded px-1.5 py-0.5">{f}</code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PageRow({ page }: { page: PageRecommendation }) {
  const [expanded, setExpanded] = useState(false)
  const score = page.health_score ?? 100
  const total = page.summary?.total ?? 0
  const critical = page.summary?.critical ?? 0
  const warning = page.summary?.warning ?? 0

  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-rose-400'
  const scoreBg   = score >= 80 ? 'bg-emerald-500/10' : score >= 60 ? 'bg-amber-500/10' : 'bg-rose-500/10'

  if (total === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-[#111113] px-4 py-3 flex items-center gap-3">
        <div className={`rounded-full px-2 py-0.5 text-xs font-bold ${scoreBg} ${scoreColor}`}>{score}</div>
        <span className="text-sm text-zinc-400 truncate flex-1">{page.url}</span>
        <span className="text-xs text-emerald-400 font-medium">✓ No issues</span>
      </div>
    )
  }

  return (
    <div className="border border-zinc-800 rounded-lg bg-[#111113] overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/40 transition-colors cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className={`shrink-0 rounded-full w-9 h-9 flex items-center justify-center text-xs font-bold ${scoreBg} ${scoreColor}`}>
          {score}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-200 font-medium truncate">{page.url}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {critical > 0 && <span className="text-xs text-rose-400 font-medium">{critical} critical</span>}
            {warning > 0  && <span className="text-xs text-amber-400 font-medium">{warning} warnings</span>}
            <span className="text-xs text-zinc-600">{total} total</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href={page.url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer">
            <ExternalLink className="w-4 h-4" />
          </a>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-zinc-500" />
            : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-800 bg-zinc-900/40 px-4 py-4 space-y-2">
          {page.recommendations.map((rec, i) => (
            <RecommendationCard key={i} rec={rec} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
export function Recommendations({ jobId }: RecommendationsPanelProps) {
  const { data, isLoading, isError, refetch } = useGetJobRecommendationsQuery(jobId, {
    skip: !jobId,
    refetchOnMountOrArgChange: true,
  })

  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'score-asc' | 'score-desc' | 'issues-desc'>('score-asc')

  const filteredPages = useMemo(() => {
    if (!data?.pages) return []

    let pages = data.pages.filter((p) => {
      if (search && !p.url.toLowerCase().includes(search.toLowerCase())) return false

      // Filter by severity
      if (severityFilter !== 'all') {
        const hasSeverity = p.recommendations.some((r) => r.severity === severityFilter)
        if (!hasSeverity) return false
      }

      // Filter by category
      if (categoryFilter !== 'all') {
        const hasCat = p.recommendations.some((r) => r.category === categoryFilter)
        if (!hasCat) return false
      }

      return true
    })

    // Sort
    if (sortBy === 'score-asc') pages = [...pages].sort((a, b) => (a.health_score ?? 100) - (b.health_score ?? 100))
    if (sortBy === 'score-desc') pages = [...pages].sort((a, b) => (b.health_score ?? 100) - (a.health_score ?? 100))
    if (sortBy === 'issues-desc') pages = [...pages].sort((a, b) => (b.summary?.total ?? 0) - (a.summary?.total ?? 0))

    return pages
  }, [data, search, severityFilter, categoryFilter, sortBy])

  const exportCsv = () => {
    if (!data?.pages) return
    const rows: string[] = [
      'URL,Health Score,Priority,Category,Severity,Title,Fix,Impact',
    ]
    for (const page of data.pages) {
      for (const rec of page.recommendations) {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
        rows.push(
          [
            esc(page.url),
            page.health_score ?? '',
            rec.priority,
            esc(rec.category),
            rec.severity,
            esc(rec.title),
            esc(rec.fix),
            esc(rec.impact),
          ].join(','),
        )
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recommendations-${jobId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!jobId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Lightbulb className="w-8 h-8 text-zinc-600" />
        <p className="text-zinc-400">No crawl job found for this session.</p>
        <p className="text-xs text-zinc-600">Start a crawl to generate recommendations.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-indigo-400" />
        <span className="text-zinc-400">Loading recommendations…</span>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-8 h-8 text-rose-500" />
        <p className="text-zinc-400">Failed to load recommendations.</p>
        <Button variant="outline" size="sm" onClick={refetch}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            SEO Recommendations
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Priority-ordered fixes — implement top items first for maximum ranking impact
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl">
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl">
            <Download className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Aggregate stats */}
      <AggregateHeader agg={data.aggregate} />

      {/* Category breakdown */}
      <CategoryBreakdown byCategory={data.aggregate.by_category} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <Input
            placeholder="Filter by URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm bg-zinc-900 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 rounded-xl"
          />
        </div>

        <select
          className="h-9 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as 'all' | 'critical' | 'warning' | 'info')}
        >
          <option value="all">All severities</option>
          <option value="critical">Critical only</option>
          <option value="warning">Warnings only</option>
          <option value="info">Info only</option>
        </select>

        <select
          className="h-9 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">All categories</option>
          {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          className="h-9 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'score-asc' | 'score-desc' | 'issues-desc')}
        >
          <option value="score-asc">Worst score first</option>
          <option value="score-desc">Best score first</option>
          <option value="issues-desc">Most issues first</option>
        </select>

        <span className="text-sm text-zinc-600 ml-auto">
          {filteredPages.length} of {data.pages.length} pages
        </span>
      </div>

      {/* Page list */}
      <div className="space-y-2">
        {data.aggregate.total_pages === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Lightbulb className="w-10 h-10 text-zinc-700" />
            <p className="text-zinc-400 font-medium">No recommendation data yet</p>
            <p className="text-zinc-600 text-sm text-center max-w-sm">
              Recommendations are generated during the crawl. Re-run the crawl to populate this view.
            </p>
          </div>
        ) : filteredPages.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 text-zinc-700" />
            <p className="text-zinc-500">No pages match your filters</p>
          </div>
        ) : (
          filteredPages.map((page) => <PageRow key={page.url} page={page} />)
        )}
      </div>
    </div>
  )
}

export default Recommendations
