'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Globe,
  Bot,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  TrendingUp,
  TrendingDown,
  Info,
  AlertTriangle,
  ExternalLink,
  ArrowUpDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useGetGA4StatusQuery,
  useListGA4PropertiesQuery,
  useSelectGA4PropertyMutation,
  useGetTopLandingPagesQuery,
  useGetCitationSparklineQuery,
  LLMTopLandingPage,
  GA4Property,
} from '@/store/api/ga4Api'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

// ── Platform colours ──────────────────────────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: '#3B82F6',
  Gemini: '#22C55E',
  Perplexity: '#14B8A6',
  Claude: '#F97316',
  Copilot: '#A855F7',
}
const platformColor = (name: string) => PLATFORM_COLORS[name] ?? '#6B7280'

// ── Date-range presets ────────────────────────────────────────────────────────
const DATE_RANGES = [
  { label: '7d', startDate: '7daysAgo', endDate: 'today' },
  { label: '30d', startDate: '30daysAgo', endDate: 'today' },
  { label: '90d', startDate: '90daysAgo', endDate: 'today' },
]

// ── LLM platform filter pills ─────────────────────────────────────────────────
const PLATFORM_FILTERS = ['ALL', 'CHATGPT', 'GEMINI', 'PERPLEXITY', 'CLAUDE'] as const
type PlatformFilter = (typeof PLATFORM_FILTERS)[number]

// ── Sort fields ───────────────────────────────────────────────────────────────
type SortField = 'llmSessions' | 'citationCount' | 'bounceRate' | 'citationTrafficRatio'
type SortDir = 'asc' | 'desc'

// ── Not-connected prompt ──────────────────────────────────────────────────────
function ConnectPrompt() {
  const handleConnect = () => {
    const returnUrl = window.location.pathname + window.location.search
    window.location.href = `${API_BASE_URL}/auth/google/analytics?returnUrl=${encodeURIComponent(returnUrl)}`
  }
  return (
    <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/60">
        <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Globe className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Top Landing Pages</h3>
          <p className="text-xs text-zinc-400">Connect Google Analytics to reveal AI-sourced landing page traffic</p>
        </div>
      </div>
      <div className="px-5 py-10 flex flex-col items-center text-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Bot className="w-8 h-8 text-amber-400" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm mb-1">Connect your Google Analytics account</p>
          <p className="text-zinc-400 text-xs max-w-sm leading-relaxed">
            Discover which pages receive LLM-sourced visitors and cross-reference with AI citation data to find hidden quick wins.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left w-full max-w-sm">
          {[
            'Pages visited from ChatGPT, Gemini & Perplexity',
            'Citation count per landing page',
            'Citation-to-traffic gap analysis',
            'Opportunity Gap™ flag for quick wins',
          ].map((f) => (
            <div key={f} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
              <span className="text-zinc-300 text-xs">{f}</span>
            </div>
          ))}
        </div>
        <Button
          onClick={handleConnect}
          className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl px-6 h-10 text-sm font-medium mt-2 cursor-pointer"
        >
          Connect Google Analytics
        </Button>
      </div>
    </div>
  )
}

// ── Citation sparkline (SVG) ──────────────────────────────────────────────────
function CitationSparkline({
  projectId,
  url,
  startDate,
  endDate,
}: {
  projectId: string
  url: string
  startDate: string
  endDate: string
}) {
  const { data, isLoading } = useGetCitationSparklineQuery(
    { projectId, url, startDate, endDate },
    { skip: !projectId || !url },
  )

  if (isLoading) {
    return <div className="h-10 bg-zinc-800/40 rounded animate-pulse" />
  }

  const points = data?.dataPoints ?? []
  if (points.length === 0) {
    return <p className="text-[11px] text-zinc-600 italic">No citation history in this period</p>
  }

  const maxVal = Math.max(...points.map((p) => p.citations), 1)
  const W = 160
  const H = 40
  const xStep = W / Math.max(points.length - 1, 1)
  const coords = points.map((p, i) => ({
    x: i * xStep,
    y: H - (p.citations / maxVal) * (H - 4) - 2,
  }))

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const last = coords[coords.length - 1]

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" />
      {last && <circle cx={last.x} cy={last.y} r={3} fill="#f59e0b" />}
    </svg>
  )
}

// ── Gap Flag Badge ────────────────────────────────────────────────────────────
function GapFlagBadge({
  flag,
  citationCount,
  sessions,
}: {
  flag: LLMTopLandingPage['gapFlag']
  citationCount: number
  sessions: number
}) {
  if (!flag) return null

  if (flag === 'OPPORTUNITY_GAP') {
    return (
      <div className="relative group/badge">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 cursor-help">
          <AlertTriangle className="w-2.5 h-2.5" />
          OPPORTUNITY GAP
        </span>
        {/* Tooltip */}
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-xs text-zinc-300 shadow-xl z-50 hidden group-hover/badge:block leading-relaxed">
          This page is cited <span className="text-white font-semibold">{citationCount}</span> times in AI
          answers but only received <span className="text-white font-semibold">{sessions}</span> LLM
          visits. Consider improving page load speed, relevance of content to the query, and clarity of
          CTA.
        </div>
      </div>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
      <TrendingUp className="w-2.5 h-2.5" />
      PERFORMING
    </span>
  )
}

// ── KPI Summary Card ──────────────────────────────────────────────────────────
function KPICard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className={`rounded-2xl border ${color} bg-[#0D0D10] p-4 flex items-start gap-3`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${color.replace('border-', 'bg-').replace('/30', '/10')}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold text-white leading-tight truncate">{value}</p>
        {sub && <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

// ── Expanded Row Panel ────────────────────────────────────────────────────────
function ExpandedRowPanel({
  page,
  projectId,
  startDate,
  endDate,
  onNavigate,
}: {
  page: LLMTopLandingPage
  projectId: string
  startDate: string
  endDate: string
  onNavigate?: (section: string) => void
}) {
  const platformEntries = Object.entries(page.platformBreakdown).sort(([, a], [, b]) => b - a)
  const totalSessions = platformEntries.reduce((s, [, v]) => s + v, 0)

  const handleViewScorecard = () => {
    if (typeof window !== 'undefined') {
      const current = new URL(window.location.href)
      current.searchParams.set('tab', 'ai-intelligence')
      current.searchParams.set('url', page.url)
      window.location.href = current.toString()
    } else if (onNavigate) {
      onNavigate('ai-intelligence')
    }
  }

  return (
    <div className="bg-zinc-900/60 border-t border-zinc-800/60 px-4 py-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* URL info */}
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Full URL</p>
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs break-all"
          >
            {page.url}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          <div className="flex items-center gap-4 mt-2">
            <div>
              <p className="text-[10px] text-zinc-500">LLM Sessions</p>
              <p className="text-sm font-bold text-white">{page.llmSessions.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">Users</p>
              <p className="text-sm font-bold text-white">{page.users.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">Bounce Rate</p>
              <p className={`text-sm font-bold ${page.bounceRate > 75 ? 'text-amber-400' : 'text-white'}`}>
                {page.bounceRate.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Platform breakdown mini-bars */}
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Traffic by Platform</p>
          {platformEntries.length === 0 ? (
            <p className="text-xs text-zinc-600">No breakdown available</p>
          ) : (
            <div className="space-y-1.5">
              {platformEntries.map(([platform, sessions]) => (
                <div key={platform} className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 w-20 shrink-0">{platform}</span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${totalSessions > 0 ? (sessions / totalSessions) * 100 : 0}%`,
                        backgroundColor: platformColor(platform),
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-zinc-400 w-8 text-right shrink-0">{sessions}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Citation info + scorecard CTA */}
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">AI Citation Data</p>
          {page.citationCount === 0 ? (
            <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-800/40 rounded-xl p-3">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
              This page receives LLM traffic but is not tracked in your citation monitoring. Add it to
              prompt tracking for full visibility.
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Total Citations</span>
                <span className="text-xs font-semibold text-white">{page.citationCount}</span>
              </div>
              {page.primaryModel && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Top Citing Model</span>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${platformColor(page.primaryModel)}22`,
                      color: platformColor(page.primaryModel),
                      borderColor: `${platformColor(page.primaryModel)}44`,
                      border: '1px solid',
                    }}
                  >
                    {page.primaryModel}
                  </span>
                </div>
              )}
              {page.citationTrafficRatio !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Sessions / Citation</span>
                  <span className="text-xs font-semibold text-white">{page.citationTrafficRatio.toFixed(2)}</span>
                </div>
              )}
              {/* Citation sparkline */}
              <div className="pt-2">
                <p className="text-[10px] text-zinc-500 mb-1">Citation Trend</p>
                <CitationSparkline
                  projectId={projectId}
                  url={page.url}
                  startDate={startDate}
                  endDate={endDate}
                />
              </div>
            </div>
          )}
          <button
            onClick={handleViewScorecard}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer"
          >
            View AI Visibility Scorecard for this page
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
interface TopLandingPagesPanelProps {
  projectId: string
  sessionUrl?: string
  onNavigate?: (section: string) => void
}

export function TopLandingPagesPanel({
  projectId,
  sessionUrl,
  onNavigate,
}: TopLandingPagesPanelProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ga4_selected_property') || ''
    }
    return ''
  })
  const [dateRangeIdx, setDateRangeIdx] = useState(1) // 30d default
  const [activePlatform, setActivePlatform] = useState<PlatformFilter>('ALL')
  const [sortField, setSortField] = useState<SortField>('llmSessions')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const dateRange = DATE_RANGES[dateRangeIdx]

  // ── GA4 status + property list ───────────────────────────────────────────
  const { data: statusData, isLoading: isLoadingStatus } = useGetGA4StatusQuery()
  const ga4Connected = statusData?.connected === true

  const { data: propertiesData, isLoading: isLoadingProps } = useListGA4PropertiesQuery(undefined, {
    skip: !ga4Connected,
  })
  const properties: GA4Property[] = propertiesData ?? []

  const [selectProperty] = useSelectGA4PropertyMutation()

  // Auto-select saved property or first available
  const activePropertyId = useMemo(() => {
    if (selectedPropertyId && properties.find((p) => p.id === selectedPropertyId)) {
      return selectedPropertyId
    }
    if (statusData?.selectedPropertyId && properties.find((p) => p.id === statusData.selectedPropertyId)) {
      return statusData.selectedPropertyId
    }
    return properties[0]?.id ?? ''
  }, [selectedPropertyId, properties, statusData])

  const handlePropertyChange = useCallback(
    (id: string) => {
      setSelectedPropertyId(id)
      if (typeof window !== 'undefined') localStorage.setItem('ga4_selected_property', id)
      selectProperty({ propertyId: id })
    },
    [selectProperty],
  )

  // ── Top Landing Pages query ──────────────────────────────────────────────
  const {
    data,
    isLoading: isLoadingData,
    isFetching,
    error,
  } = useGetTopLandingPagesQuery(
    {
      propertyId: activePropertyId,
      projectId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      sessionUrl,
      // platform NOT passed — filtering is client-side to avoid re-fetch on tab switch
    },
    { skip: !ga4Connected || !activePropertyId || !projectId },
  )

  const isLoading = isLoadingStatus || isLoadingProps || isLoadingData || isFetching

  // ── Client-side platform filter + Sorting ────────────────────────────────
  const sortedPages = useMemo(() => {
    if (!data?.pages) return []
    const filtered =
      activePlatform === 'ALL'
        ? data.pages
        : data.pages.filter((p) =>
            Object.keys(p.platformBreakdown).some(
              (k) => k.toUpperCase() === activePlatform,
            ),
          )
    return [...filtered].sort((a, b) => {
      let av: number
      let bv: number
      if (sortField === 'citationTrafficRatio') {
        av = a.citationTrafficRatio ?? Number.MAX_VALUE
        bv = b.citationTrafficRatio ?? Number.MAX_VALUE
      } else {
        av = a[sortField] as number
        bv = b[sortField] as number
      }
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [data?.pages, activePlatform, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-zinc-600" />
    return sortDir === 'desc' ? (
      <ChevronDown className="w-3 h-3 text-indigo-400" />
    ) : (
      <ChevronUp className="w-3 h-3 text-indigo-400" />
    )
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isLoadingStatus && !ga4Connected) {
    return <ConnectPrompt />
  }

  // ── Property selection needed ─────────────────────────────────────────────
  const showPropertyPicker = ga4Connected && properties.length > 0

  // ── Truncate URL for display ──────────────────────────────────────────────
  const displayUrl = (url: string, maxLen = 50) =>
    url.length > maxLen ? url.slice(0, maxLen) + '…' : url

  return (
    <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10] overflow-hidden space-y-0">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-zinc-800/60">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Top Landing Pages</h3>
            <p className="text-xs text-zinc-400">Pages receiving LLM-sourced visitors, cross-referenced with AI citation data</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Property picker */}
          {showPropertyPicker && (
            <select
              value={activePropertyId}
              onChange={(e) => handlePropertyChange(e.target.value)}
              className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl px-3 py-1.5 cursor-pointer appearance-none focus:outline-none"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          )}

          {/* Date range pills */}
          <div className="flex items-center bg-zinc-800/60 rounded-xl p-0.5 border border-zinc-700/40">
            {DATE_RANGES.map((dr, i) => (
              <button
                key={dr.label}
                onClick={() => setDateRangeIdx(i)}
                className={`px-3 py-1 text-xs font-medium rounded-xl transition-colors cursor-pointer ${
                  dateRangeIdx === i
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {dr.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Platform filter pills ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-5 py-3 border-b border-zinc-800/40 overflow-x-auto">
        {PLATFORM_FILTERS.map((pf) => (
          <button
            key={pf}
            onClick={() => setActivePlatform(pf)}
            className={`px-3 py-1 text-[11px] font-semibold rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
              activePlatform === pf
                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
            }`}
          >
            {pf}
          </button>
        ))}
      </div>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {isLoading && (
        <div className="px-5 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-zinc-800/40 rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-zinc-800/40 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* ── No data loaded yet ───────────────────────────────────────────── */}
      {!isLoading && !activePropertyId && ga4Connected && (
        <div className="px-5 py-16 flex flex-col items-center text-center gap-3">
          <Info className="w-8 h-8 text-zinc-600" />
          <p className="text-sm text-zinc-400">Select a GA4 property above to load landing page data.</p>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {!isLoading && error && (
        <div className="px-5 py-8 flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8 text-rose-400" />
          <p className="text-sm text-zinc-400">Failed to load landing page data. Please try again.</p>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {!isLoading && data && !error && (
        <>
          {/* ── KPI Summary Cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-5 py-4 border-b border-zinc-800/40">
            <KPICard
              label="Total LLM Landing Pages"
              value={data.totalLLMPages.toLocaleString()}
              icon={<Globe className="w-4 h-4 text-amber-400" />}
              color="border-amber-500/20"
            />
            <KPICard
              label="Top Page"
              value={data.topPage ? data.topPage.llmSessions.toLocaleString() + ' sessions' : '—'}
              sub={data.topPage ? displayUrl(data.topPage.url, 40) : 'No data yet'}
              icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
              color="border-emerald-500/20"
            />
            <KPICard
              label="Avg Bounce Rate (LLM Visitors)"
              value={data.avgBounceRate > 0 ? `${data.avgBounceRate.toFixed(1)}%` : '—'}
              icon={<TrendingDown className="w-4 h-4 text-blue-400" />}
              color="border-blue-500/20"
            />
          </div>

          {/* ── Empty state ─────────────────────────────────────────────────── */}
          {sortedPages.length === 0 && (
            <div className="px-5 py-16 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/40 flex items-center justify-center">
                <Bot className="w-7 h-7 text-zinc-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">No landing page data available yet.</p>
                <p className="text-xs text-zinc-600 mt-1">
                  This requires at least 7 days of GA4 data after connection.
                </p>
              </div>
            </div>
          )}

          {/* ── Table ───────────────────────────────────────────────────────── */}
          {sortedPages.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                    <th className="px-4 py-3 text-left text-[10px] font-medium text-zinc-500 uppercase tracking-wider w-64">
                      URL
                    </th>
                    <th
                      className="px-4 py-3 text-right text-[10px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 select-none"
                      onClick={() => handleSort('llmSessions')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        LLM Sessions
                        <SortIcon field="llmSessions" />
                      </span>
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                      Users
                    </th>
                    <th
                      className="px-4 py-3 text-right text-[10px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 select-none"
                      onClick={() => handleSort('bounceRate')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        Bounce Rate
                        <SortIcon field="bounceRate" />
                      </span>
                    </th>
                    <th
                      className="px-4 py-3 text-right text-[10px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 select-none"
                      onClick={() => handleSort('citationCount')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        Citations
                        <SortIcon field="citationCount" />
                      </span>
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                      Primary Model
                    </th>
                    <th
                      className="px-4 py-3 text-right text-[10px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 select-none"
                      onClick={() => handleSort('citationTrafficRatio')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        Sess/Citation
                        <SortIcon field="citationTrafficRatio" />
                      </span>
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                      Gap Flag
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {sortedPages.map((page) => {
                    const isExpanded = expandedRow === page.path
                    return (
                      <>
                        <tr
                          key={page.path}
                          className="hover:bg-zinc-800/20 transition-colors cursor-pointer"
                          onClick={() => setExpandedRow(isExpanded ? null : page.path)}
                        >
                          {/* URL */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              )}
                              <span
                                className="text-xs text-blue-400 truncate hover:text-blue-300"
                                title={page.url}
                              >
                                {displayUrl(page.path, 45)}
                              </span>
                            </div>
                          </td>

                          {/* LLM Sessions */}
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs font-semibold text-white">
                              {page.llmSessions.toLocaleString()}
                            </span>
                          </td>

                          {/* Users */}
                          <td className="px-4 py-3 text-right text-xs text-zinc-400">
                            {page.users.toLocaleString()}
                          </td>

                          {/* Bounce Rate */}
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-xs font-medium inline-flex items-center gap-1 ${
                                page.bounceRate > 75 ? 'text-amber-400' : 'text-zinc-300'
                              }`}
                            >
                              {page.bounceRate > 75 && (
                                <span title="Bounce rate above 75%. LLM visitors may be landing on a page that does not match their expectations from the AI answer.">
                                  <AlertTriangle className="w-3 h-3" />
                                </span>
                              )}
                              {page.bounceRate.toFixed(1)}%
                            </span>
                          </td>

                          {/* Citation Count */}
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center gap-1 text-xs text-zinc-300">
                              {page.citationCount === 0 && (
                                <span
                                  title="This page receives LLM traffic but is not tracked in your citation monitoring. Add it to prompt tracking for full visibility."
                                >
                                  <Info className="w-3 h-3 text-blue-400" />
                                </span>
                              )}
                              {page.citationCount}
                            </span>
                          </td>

                          {/* Primary Model */}
                          <td className="px-4 py-3 text-center">
                            {page.primaryModel ? (
                              <span
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: `${platformColor(page.primaryModel)}22`,
                                  color: platformColor(page.primaryModel),
                                  border: `1px solid ${platformColor(page.primaryModel)}44`,
                                }}
                              >
                                {page.primaryModel}
                              </span>
                            ) : (
                              <span className="text-[10px] text-zinc-600">—</span>
                            )}
                          </td>

                          {/* Citation/Traffic Ratio */}
                          <td className="px-4 py-3 text-right text-xs text-zinc-400">
                            {page.citationTrafficRatio !== null
                              ? page.citationTrafficRatio.toFixed(2)
                              : '—'}
                          </td>

                          {/* Gap Flag */}
                          <td className="px-4 py-3 text-center">
                            <GapFlagBadge
                              flag={page.gapFlag}
                              citationCount={page.citationCount}
                              sessions={page.llmSessions}
                            />
                          </td>
                        </tr>

                        {/* ── Expanded Row ─────────────────────────────────── */}
                        {isExpanded && (
                          <tr key={`${page.path}-expanded`}>
                            <td colSpan={8} className="p-0">
                              <ExpandedRowPanel
                                page={page}
                                projectId={projectId}
                                startDate={dateRange.startDate}
                                endDate={dateRange.endDate}
                                onNavigate={onNavigate}
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Footer note ──────────────────────────────────────────────────── */}
          {sortedPages.length > 0 && (
            <div className="px-5 py-3 border-t border-zinc-800/40 flex items-center justify-between">
              <p className="text-[11px] text-zinc-600">
                Showing top {sortedPages.length} pages ranked by LLM sessions.
                {data.totalLLMPages > 50 && ` ${data.totalLLMPages - 50} more pages available.`}
              </p>
              <p className="text-[11px] text-zinc-600">
                OPPORTUNITY GAP: citations &gt; 20 &amp; sessions &lt; 50 &nbsp;·&nbsp;
                PERFORMING: citations &gt; 20 &amp; sessions ≥ 50
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
