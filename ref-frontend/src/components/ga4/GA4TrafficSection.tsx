'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  BarChart3,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  ChevronUp,
  Loader2,
  TrendingUp,
  Unplug,
  Copy,
  Check,
  Info,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useGetGA4StatusQuery,
  useListGA4PropertiesQuery,
  useGetGA4TrafficQuery,
  useSelectGA4PropertyMutation,
  useDisconnectGA4Mutation,
  GA4Property,
  GA4PageTraffic,
} from '@/store/api/ga4Api'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

// ── Connect prompt ────────────────────────────────────────────────────────────
function GA4ConnectPrompt() {
  const handleConnect = () => {
    const returnUrl = window.location.pathname + window.location.search
    window.location.href = `${API_BASE_URL}/auth/google/analytics?returnUrl=${encodeURIComponent(returnUrl)}`
  }

  return (
    <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/60">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">GA4 Traffic Analysis</h3>
          <p className="text-xs text-zinc-400">Connect your Google Analytics 4 to view real traffic data</p>
        </div>
      </div>

      <div className="px-5 py-6 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-amber-400" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm mb-1">Google Analytics 4 not connected</p>
          <p className="text-zinc-400 text-xs max-w-xs">
            Connect your GA4 account to see real 30-day sessions data for every page in your Performance Metrics.
          </p>
        </div>

        <div className="w-full max-w-xs space-y-2 text-left">
          {[
            '30-day sessions per page URL',
            'Real traffic data from your GA4 property',
            'Auto-populated in Performance Metrics table',
            'Read-only access — we never modify your data',
          ].map((f) => (
            <div key={f} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-zinc-300 text-xs">{f}</span>
            </div>
          ))}
        </div>

        <Button
          onClick={handleConnect}
          className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 h-10 text-sm font-medium mt-2 cursor-pointer"
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Connect Google Analytics 4
        </Button>
      </div>
    </div>
  )
}

// ── Setup instructions (shown after first connect) ────────────────────────────
function GA4SetupInstructions({ selectedPropertyName }: { selectedPropertyName?: string }) {
  const [copiedStep, setCopiedStep] = useState<number | null>(null)

  const copyText = (text: string, step: number) => {
    navigator.clipboard.writeText(text)
    setCopiedStep(step)
    setTimeout(() => setCopiedStep(null), 2000)
  }

  const steps = [
    {
      title: 'Open Google Analytics Console',
      description: 'Go to analytics.google.com and sign in with the same Google account you connected here.',
      action: { label: 'Open GA4 Console', url: 'https://analytics.google.com/' },
    },
    {
      title: 'Navigate to Admin → Property Settings',
      description: 'Click the gear icon (Admin) in the bottom-left corner, then select your property.',
    },
    {
      title: 'Verify your website\'s data stream',
      description: 'Go to Admin → Data Streams and make sure your website URL has an active "Web" data stream with measurement ID (e.g., G-XXXXXXXXXX). If not, click "Add stream" → "Web" and enter your website URL.',
    },
    {
      title: 'Install the GA4 tag on your website',
      description: 'In data stream details, copy the Measurement ID. Add the Google tag to your website\'s <head> section. You can use Google Tag Manager or add the gtag.js snippet directly.',
      copyable: '<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag(\'js\', new Date());\n  gtag(\'config\', \'G-XXXXXXXXXX\');\n</script>',
    },
    {
      title: 'Wait for data to flow',
      description: 'After installing the tag, GA4 starts collecting data. You\'ll see real-time data within minutes, but the 30-day traffic report needs time to accumulate pageview data.',
    },
  ]

  return (
    <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/60">
        <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
          <Info className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">GA4 Setup Guide</h3>
          <p className="text-xs text-zinc-400">
            {selectedPropertyName
              ? `Ensure "${selectedPropertyName}" is collecting data for your website`
              : 'How to set up GA4 to collect data for your website'}
          </p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <div className="shrink-0 mt-0.5">
              <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                <span className="text-xs font-bold text-zinc-300">{i + 1}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white mb-1">{step.title}</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{step.description}</p>
              {step.action && (
                <a
                  href={step.action.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {step.action.label}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {step.copyable && (
                <div className="mt-2 relative">
                  <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-[11px] text-zinc-300 overflow-x-auto whitespace-pre font-mono">
                    {step.copyable}
                  </pre>
                  <button
                    onClick={() => copyText(step.copyable!, i)}
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
                    title="Copy snippet"
                  >
                    {copiedStep === i ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-300 leading-relaxed">
            <strong>Important:</strong> The GA4 property you select here must have a data stream for the same website
            you&apos;re analyzing. If the website doesn&apos;t have the GA4 tag installed, the traffic data will show 0 sessions.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Property selector ─────────────────────────────────────────────────────────
function PropertySelector({
  properties,
  selectedId,
  onSelect,
}: {
  properties: GA4Property[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = properties.find((p) => p.id === selectedId)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-sm text-zinc-200 hover:bg-zinc-700/60 transition-colors cursor-pointer"
      >
        <BarChart3 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="truncate max-w-60">
          {selected ? selected.displayName : 'Select GA4 property…'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-zinc-400 ml-1" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-70 max-w-sm rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl overflow-hidden">
          {properties.map((prop) => (
            <button
              key={prop.id}
              className="w-full flex flex-col items-start px-4 py-3 hover:bg-zinc-800 transition-colors cursor-pointer border-b border-zinc-800/60 last:border-0"
              onClick={() => {
                onSelect(prop.id)
                setOpen(false)
              }}
            >
              <span className="text-sm text-white font-medium">{prop.displayName}</span>
              <span className="text-[11px] text-zinc-400">{prop.accountName} · {prop.id}</span>
            </button>
          ))}
          {properties.length === 0 && (
            <div className="px-4 py-3 text-xs text-zinc-500">No properties found</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

// ── Per-page traffic table ────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 20

const TABLE_COLS: { key: keyof GA4PageTraffic | 'fullUrl'; label: string }[] = [
  { key: 'pageTitle',           label: 'Page Title' },
  { key: 'fullUrl',             label: 'Full URL' },
  { key: 'sessions',            label: 'Sessions' },
  { key: 'views',               label: 'Views' },
  { key: 'activeUsers',         label: 'Active Users' },
  { key: 'viewsPerActiveUser',  label: 'Views / Active User' },
  { key: 'avgEngagementTime',   label: 'Avg Engagement Time' },
  { key: 'eventCount',          label: 'Event Count' },
  { key: 'keyEvents',           label: 'Key Events' },
]

type SortKey = keyof GA4PageTraffic

function TrafficTable({
  pages,
  sessionUrl,
}: {
  pages: GA4PageTraffic[]
  sessionUrl?: string
}) {
  const [search, setSearch]       = useState('')
  const [currentPage, setPage]    = useState(1)
  const [sortKey, setSortKey]     = useState<SortKey>('views')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q
      ? pages.filter((p) => p.pagePath.toLowerCase().includes(q) || p.pageTitle.toLowerCase().includes(q))
      : pages
  }, [pages, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number')
        return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE)
  const paginated  = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return sorted.slice(start, start + ITEMS_PER_PAGE)
  }, [sorted, currentPage])

  const sortableKeys: Set<SortKey> = new Set(['pageTitle', 'pagePath', 'sessions', 'views', 'activeUsers', 'viewsPerActiveUser', 'avgEngagementTime', 'eventCount', 'keyEvents'])

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search by page title or URL path…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 text-sm rounded-xl"
          />
        </div>
        <span className="text-xs text-zinc-500 shrink-0">{filtered.length} pages</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-[#111113] overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-w-full custom-scrollbar" style={{ maxHeight: '60vh' }}>
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-10">
              <tr>
                {TABLE_COLS.map((col) => {
                  const isSortable = col.key !== 'fullUrl' && sortableKeys.has(col.key as SortKey)
                  const isActive   = sortKey === col.key
                  return (
                    <th
                      key={col.key}
                      onClick={isSortable ? () => handleSort(col.key as SortKey) : undefined}
                      className={`px-3 py-2 text-center text-xs font-semibold text-zinc-200 whitespace-nowrap ${
                        isSortable ? 'cursor-pointer hover:bg-zinc-800/50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        {col.label}
                        {isSortable && isActive && (
                          sortDir === 'asc'
                            ? <ChevronUp className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLS.length} className="px-4 py-12 text-center text-zinc-400">
                    No pages match your search.
                  </td>
                </tr>
              ) : (
                paginated.map((page, i) => {
                  const fullUrl = sessionUrl
                    ? `${sessionUrl.replace(/\/$/, '')}${page.pagePath}`
                    : page.pagePath
                  return (
                    <tr key={i} className="hover:bg-zinc-800/50 transition-colors">
                      {/* Page Title */}
                      <td className="px-3 py-2 text-zinc-200 whitespace-normal">
                        <span className="text-zinc-100 font-medium">
                          {page.pageTitle || '(not set)'}
                        </span>
                      </td>
                      {/* Full URL */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 group"
                        >
                          <span>{fullUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </td>
                      {/* Sessions */}
                      <td className="px-3 py-2 text-center text-zinc-200 tabular-nums">
                        {page.sessions.toLocaleString()}
                      </td>
                      {/* Views */}
                      <td className="px-3 py-2 text-center text-zinc-200 font-medium tabular-nums">
                        {page.views.toLocaleString()}
                      </td>
                      {/* Active Users */}
                      <td className="px-3 py-2 text-center text-zinc-200 tabular-nums">
                        {page.activeUsers.toLocaleString()}
                      </td>
                      {/* Views / Active User */}
                      <td className="px-3 py-2 text-center text-zinc-200 tabular-nums">
                        {page.viewsPerActiveUser.toFixed(2)}
                      </td>
                      {/* Avg Engagement Time */}
                      <td className="px-3 py-2 text-center text-zinc-200 tabular-nums">
                        {fmtDuration(page.avgEngagementTime)}
                      </td>
                      {/* Event Count */}
                      <td className="px-3 py-2 text-center text-zinc-200 tabular-nums">
                        {page.eventCount.toLocaleString()}
                      </td>
                      {/* Key Events */}
                      <td className="px-3 py-2 text-center text-zinc-200 tabular-nums">
                        {page.keyEvents.toLocaleString()}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 rounded-xl"
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5)              pageNum = i + 1
                else if (currentPage <= 3)        pageNum = i + 1
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                else                              pageNum = currentPage - 2 + i
                return (
                  <Button
                    key={pageNum} variant="outline" size="sm"
                    onClick={() => setPage(pageNum)}
                    className={`rounded-xl ${
                      currentPage === pageNum
                        ? 'bg-white text-black border-white'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 rounded-xl"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main GA4 Traffic Section ──────────────────────────────────────────────────
interface GA4TrafficSectionProps {
  sessionUrl?: string
  jobId?: string | null
}

export function GA4TrafficSection({ sessionUrl, jobId }: GA4TrafficSectionProps) {
  const { data: statusData, isLoading: statusLoading } = useGetGA4StatusQuery()
  const isConnected = statusData?.connected === true

  const { data: properties = [], isLoading: propsLoading } = useListGA4PropertiesQuery(undefined, {
    skip: !isConnected,
  })

  const [selectProperty] = useSelectGA4PropertyMutation()
  const [disconnectGA4, { isLoading: isDisconnecting }] = useDisconnectGA4Mutation()

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [showSetupGuide, setShowSetupGuide] = useState(false)

  // Initialize from server-stored selection
  useEffect(() => {
    if (statusData?.selectedPropertyId) {
      setSelectedPropertyId(statusData.selectedPropertyId)
    }
  }, [statusData?.selectedPropertyId])

  const handleSelectProperty = async (id: string) => {
    setSelectedPropertyId(id)
    try {
      await selectProperty({ propertyId: id }).unwrap()
    } catch {
      // Silently fail — local state is still set
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectGA4().unwrap()
      setSelectedPropertyId(null)
    } catch {
      // Error handled by RTK Query
    }
  }

  const {
    data: trafficData,
    isLoading: trafficLoading,
    isFetching: trafficFetching,
    refetch: refetchTraffic,
    error: trafficError,
  } = useGetGA4TrafficQuery(
    {
      propertyId: selectedPropertyId ?? '',
      startDate: '30daysAgo',
      endDate: 'today',
    },
    { skip: !isConnected || !selectedPropertyId },
  )

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId)
  const isDataLoading = trafficLoading || trafficFetching || propsLoading

  // Loading state
  if (statusLoading) {
    return (
      <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10] p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
      </div>
    )
  }

  // Not connected
  if (!isConnected) {
    return <GA4ConnectPrompt />
  }

  return (
    <div className="space-y-4">
      {/* Main panel */}
      <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800/60 rounded-t-2xl overflow-visible relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">GA4 Traffic — 30 Days</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-emerald-400">Connected</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Property selector */}
            {properties.length > 0 && (
              <PropertySelector
                properties={properties}
                selectedId={selectedPropertyId}
                onSelect={handleSelectProperty}
              />
            )}
            {properties.length === 0 && !propsLoading && (
              <span className="text-xs text-zinc-500">No GA4 properties found</span>
            )}

            {/* Setup guide toggle */}
            <button
              onClick={() => setShowSetupGuide((v) => !v)}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                showSetupGuide
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-zinc-800/40 border-zinc-700/60 text-zinc-400 hover:text-white'
              }`}
              title="GA4 Setup Instructions"
            >
              <Info className="w-3.5 h-3.5" />
            </button>

            {/* Refresh */}
            <button
              onClick={() => refetchTraffic()}
              disabled={isDataLoading || !selectedPropertyId}
              className="p-2 rounded-xl bg-zinc-800/40 border border-zinc-700/60 text-zinc-400 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDataLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Disconnect */}
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="p-2 rounded-xl bg-zinc-800/40 border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
              title="Disconnect GA4"
            >
              <Unplug className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Prompt to select a property */}
        {!selectedPropertyId && (
          <div className="px-5 py-6 text-center text-sm text-zinc-400">
            Select a GA4 property above to load 30-day traffic data.
          </div>
        )}

        {/* Loading */}
        {selectedPropertyId && isDataLoading && (
          <div className="px-5 py-8 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
            <span className="text-sm text-zinc-400">Loading traffic data…</span>
          </div>
        )}

        {/* Error */}
        {trafficError && !isDataLoading && (
          <div className="px-5 py-6 flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Failed to load traffic data. Check your GA4 property and try again.</span>
          </div>
        )}

        {/* Summary */}
        {trafficData && !isDataLoading && (
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-base font-bold text-white leading-none tabular-nums">{trafficData.totalSessions.toLocaleString()}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Sessions</p>
                </div>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 flex items-center gap-3">
                <BarChart3 className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-base font-bold text-white leading-none tabular-nums">{trafficData.totalViews.toLocaleString()}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Views</p>
                </div>
              </div>
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3.5 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-base font-bold text-white leading-none tabular-nums">{trafficData.totalActiveUsers.toLocaleString()}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Active Users</p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-base font-bold text-white leading-none tabular-nums">{trafficData.totalEventCount.toLocaleString()}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Event Count</p>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-base font-bold text-white leading-none tabular-nums">{trafficData.totalKeyEvents.toLocaleString()}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Key Events</p>
                </div>
              </div>
            </div>

            {trafficData.pages.length === 0 && (
              <div className="py-6 text-center">
                <AlertCircle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                <p className="text-sm text-zinc-300 mb-1">No traffic data found</p>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  This usually means the GA4 tag is not installed on the website, or the selected property
                  doesn&apos;t track this website. Click the setup guide button above for instructions.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Setup guide */}
      {showSetupGuide && (
        <GA4SetupInstructions selectedPropertyName={selectedProperty?.displayName} />
      )}

      {/* Traffic table */}
      {trafficData && trafficData.pages.length > 0 && !isDataLoading && (
        <div>
          <h4 className="text-sm font-semibold text-white mb-3 px-1">
            Pages and Screens
            <span className="ml-2 text-xs font-normal text-zinc-400">
              ({trafficData.pages.length} pages · {trafficData.dateRange.startDate} – {trafficData.dateRange.endDate})
            </span>
          </h4>
          <TrafficTable pages={trafficData.pages} sessionUrl={sessionUrl} />
        </div>
      )}
    </div>
  )
}
