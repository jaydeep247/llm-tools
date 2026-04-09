'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  MousePointer,
  RefreshCw,
  ChevronDown,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Target,
  BarChart3,
  Settings,
  X,
  Check,
  Bot,
  Info,
  Clock,
  AlertCircle,
  ArrowUpDown,
  ChevronUp,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  useGetGA4StatusQuery,
  useListGA4PropertiesQuery,
  useSelectGA4PropertyMutation,
  useGetConversionEventsQuery,
  useSaveConversionEventsMutation,
  useListGA4EventsQuery,
  useGetLLMConversionsQuery,
  useSyncLLMConversionsMutation,
  GA4Property,
  TrackedConversionEvent,
  ConversionPlatformBreakdown,
  ConversionTopPage,
  LLMConversionsResponse,
} from '@/store/api/ga4Api'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

// ── Platform colour map (same as LLMTrafficPanel) ─────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: '#3B82F6',
  Gemini: '#22C55E',
  Perplexity: '#14B8A6',
  Claude: '#F97316',
  Copilot: '#A855F7',
  'You.com': '#EC4899',
  Poe: '#F59E0B',
}
const platformColor = (name: string) => PLATFORM_COLORS[name] ?? '#6B7280'

// ── Date range config ─────────────────────────────────────────────────────────
const DATE_RANGES = [
  { label: '7d', startDate: '7daysAgo', endDate: 'today' },
  { label: '30d', startDate: '30daysAgo', endDate: 'today' },
  { label: '90d', startDate: '90daysAgo', endDate: 'today' },
]

// ── GA4 not-connected prompt ──────────────────────────────────────────────────
function ConnectPrompt() {
  const handleConnect = () => {
    const returnUrl = window.location.pathname + window.location.search
    window.location.href = `${API_BASE_URL}/auth/google/analytics?returnUrl=${encodeURIComponent(returnUrl)}`
  }

  return (
    <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/60">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <MousePointer className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Events & Conversions</h3>
          <p className="text-xs text-zinc-400">Connect Google Analytics to track AI-driven business outcomes</p>
        </div>
      </div>
      <div className="px-5 py-10 flex flex-col items-center text-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Bot className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm mb-1">Connect your Google Analytics account</p>
          <p className="text-zinc-400 text-xs max-w-sm leading-relaxed">
            Prove whether LLM-sourced traffic leads to real business outcomes — form submissions, sign-ups, purchases, and revenue.
          </p>
        </div>
        <Button
          onClick={handleConnect}
          className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 h-10 text-sm font-medium cursor-pointer"
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Connect Google Analytics
        </Button>
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
        <span className="truncate max-w-60">{selected ? selected.displayName : 'Select GA4 property…'}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-zinc-400 ml-1" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-72 max-w-sm rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl overflow-hidden">
          {properties.map((prop) => (
            <button
              key={prop.id}
              className="w-full flex flex-col items-start px-4 py-3 hover:bg-zinc-800 transition-colors cursor-pointer border-b border-zinc-800/60 last:border-0"
              onClick={() => { onSelect(prop.id); setOpen(false) }}
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

// ── Configure Events Modal ────────────────────────────────────────────────────
function ConfigureEventsModal({
  propertyId,
  existingEvents,
  onClose,
  onSaved,
}: {
  propertyId: string
  existingEvents: TrackedConversionEvent[]
  onClose: () => void
  onSaved: () => void
}) {
  const { data: ga4Events, isLoading: isLoadingEvents } = useListGA4EventsQuery(
    { propertyId },
    { skip: !propertyId },
  )

  const [saveConversionEvents, { isLoading: isSaving }] = useSaveConversionEventsMutation()

  // Build initial selection from existing events
  const [selected, setSelected] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>()
    existingEvents.forEach((e) => m.set(e.ga4_event_name, e.display_label))
    return m
  })
  const [labels, setLabels] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>()
    existingEvents.forEach((e) => m.set(e.ga4_event_name, e.display_label))
    return m
  })
  const [error, setError] = useState<string | null>(null)

  const toggleEvent = (name: string) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(name)) { next.delete(name) } else { next.set(name, name) }
      return next
    })
  }

  const handleLabelChange = (name: string, label: string) => {
    setLabels((prev) => new Map(prev).set(name, label))
  }

  const handleSave = async () => {
    if (selected.size === 0) {
      setError('Select at least one conversion event.')
      return
    }
    const events = Array.from(selected.keys()).map((name) => ({
      ga4_event_name: name,
      display_label: labels.get(name) || name,
    }))
    try {
      await saveConversionEvents({ events }).unwrap()
      onSaved()
      onClose()
    } catch {
      setError('Failed to save events. Please try again.')
    }
  }

  const allEvents = ga4Events ?? []

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111113] border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Settings className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Configure Conversion Events</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-zinc-400 mb-4">
            Select events from your GA4 property to track as conversions from AI traffic. You can set a display label for each.
          </p>

          {isLoadingEvents ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              <span className="ml-2 text-sm text-zinc-400">Loading GA4 events…</span>
            </div>
          ) : allEvents.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              No events found in this property for the last 30 days.
            </div>
          ) : (
            <div className="space-y-1">
              {allEvents.map((eventName) => {
                const isChecked = selected.has(eventName)
                return (
                  <div
                    key={eventName}
                    className={`rounded-xl border transition-colors ${
                      isChecked
                        ? 'border-violet-500/40 bg-violet-500/5'
                        : 'border-zinc-800 bg-zinc-900/40'
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer"
                      onClick={() => toggleEvent(eventName)}
                    >
                      <div
                        className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-violet-500 border-violet-500'
                            : 'border-zinc-600 bg-zinc-800'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-sm font-mono text-zinc-200 flex-1">{eventName}</span>
                    </div>
                    {isChecked && (
                      <div className="px-3.5 pb-2.5">
                        <input
                          type="text"
                          placeholder="Display label (optional)"
                          value={labels.get(eventName) ?? eventName}
                          onChange={(e) => handleLabelChange(eventName, e.target.value)}
                          className="w-full text-xs bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800">
          <span className="text-xs text-zinc-500">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-400 hover:text-white rounded-lg cursor-pointer">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSaving || selected.size === 0}
              onClick={handleSave}
              className="bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Save Events
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({
  label,
  value,
  sub,
  highlight,
  tooltip,
  icon: Icon,
  iconColor = 'violet',
}: {
  label: string
  value: string
  sub?: string
  highlight?: 'green' | 'amber' | null
  tooltip?: string
  icon: React.ElementType
  iconColor?: string
}) {
  const iconColorMap: Record<string, string> = {
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  }
  const ic = iconColorMap[iconColor] ?? iconColorMap.violet

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400 font-medium">{label}</span>
        {tooltip ? (
          <div className="group relative">
            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center cursor-help ${ic}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="pointer-events-none absolute right-0 top-full mt-1.5 z-10 w-56 rounded-xl bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
              {tooltip}
            </div>
          </div>
        ) : (
          <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${ic}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <p className="text-3xl font-bold text-white leading-none">{value}</p>
      {sub && (
        <p
          className={`text-xs mt-0.5 ${
            highlight === 'green'
              ? 'text-emerald-400'
              : highlight === 'amber'
              ? 'text-amber-400'
              : 'text-zinc-500'
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

// ── Conversions by Platform bar chart ─────────────────────────────────────────
function PlatformConversionsChart({ breakdown }: { breakdown: ConversionPlatformBreakdown[] }) {
  const data = breakdown.map((p) => ({
    platform: p.platform,
    conversions: p.conversions,
    conversion_rate: p.conversion_rate,
    fill: platformColor(p.platform),
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(breakdown.length * 56, 140)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
        <XAxis
          type="number"
          dataKey="conversions"
          tick={{ fill: '#71717a', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="platform"
          tick={{ fill: '#a1a1aa', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <RechartsTooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12 }}
          formatter={(value: number, _name: string, entry: any) => {
            const rate = entry.payload.conversion_rate
            return [
              `${value.toLocaleString()} conversions (${rate}% rate)`,
              entry.payload.platform,
            ]
          }}
        />
        <Bar dataKey="conversions" radius={[0, 6, 6, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Benchmark Comparison Block ────────────────────────────────────────────────
function BenchmarkBlock({
  llmRate,
  siteRate,
}: {
  llmRate: number
  siteRate: number
}) {
  const isHigher = llmRate > siteRate
  const diff = Math.abs(llmRate - siteRate).toFixed(1)

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Conversion Rate Benchmark</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-xl border p-4 ${isHigher ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-zinc-700/60 bg-zinc-900/40'}`}>
          <p className="text-[11px] text-zinc-400 mb-1">LLM Traffic Rate</p>
          <p className={`text-2xl font-bold ${isHigher ? 'text-emerald-400' : 'text-amber-400'}`}>
            {llmRate.toFixed(2)}%
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Visitors from AI platforms</p>
        </div>
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/40 p-4">
          <p className="text-[11px] text-zinc-400 mb-1">Site Average</p>
          <p className="text-2xl font-bold text-zinc-300">{siteRate.toFixed(2)}%</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">All traffic sessions</p>
        </div>
      </div>

      {llmRate > 0 && siteRate > 0 && (
        <div
          className={`mt-3 rounded-xl px-4 py-3 text-xs font-medium flex items-center gap-2 ${
            isHigher
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
          }`}
        >
          {isHigher ? (
            <>
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              LLM visitors convert {diff}% higher than site average — high-intent channel.
            </>
          ) : (
            <>
              <TrendingDown className="w-3.5 h-3.5 shrink-0" />
              LLM conversion rate is {diff}% below site average — review top landing pages.
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Top Converting Pages Table ────────────────────────────────────────────────
type PageSortCol = 'llm_sessions' | 'conversions' | 'conversion_rate'

function TopPagesTable({ pages }: { pages: ConversionTopPage[] }) {
  const [sortCol, setSortCol] = useState<PageSortCol>('conversion_rate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    return [...pages].sort((a, b) => {
      const av = a[sortCol]
      const bv = b[sortCol]
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [pages, sortCol, sortDir])

  const handleSort = (col: PageSortCol) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: PageSortCol }) =>
    sortCol === col ? (
      sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ArrowUpDown className="w-3 h-3 inline ml-0.5 opacity-30" />
    )

  const hasRevenue = pages.some((p) => p.revenue !== null && p.revenue > 0)

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/50">
            <th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
              Page URL
            </th>
            <th
              className="px-4 py-3 text-right text-[11px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 select-none"
              onClick={() => handleSort('llm_sessions')}
            >
              LLM Sessions <SortIcon col="llm_sessions" />
            </th>
            <th
              className="px-4 py-3 text-right text-[11px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 select-none"
              onClick={() => handleSort('conversions')}
            >
              Conversions <SortIcon col="conversions" />
            </th>
            <th
              className="px-4 py-3 text-right text-[11px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300 select-none"
              onClick={() => handleSort('conversion_rate')}
            >
              Conv. Rate <SortIcon col="conversion_rate" />
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
              Primary Event
            </th>
            {hasRevenue && (
              <th className="px-4 py-3 text-right text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                Revenue
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {sorted.map((page, idx) => (
            <tr key={idx} className="hover:bg-zinc-800/30 transition-colors">
              <td className="px-4 py-3">
                <span
                  className="text-xs text-zinc-300 font-mono max-w-xs truncate block"
                  title={page.page_url}
                >
                  {page.page_url.length > 55 ? page.page_url.slice(0, 55) + '…' : page.page_url}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-xs text-zinc-300">{page.llm_sessions.toLocaleString()}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-xs font-semibold text-white">{page.conversions.toLocaleString()}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`inline-flex items-center justify-center text-xs font-bold px-2 py-0.5 rounded-lg ${
                    page.conversion_rate >= 10
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : page.conversion_rate >= 3
                      ? 'bg-blue-500/15 text-blue-300'
                      : 'bg-zinc-700/40 text-zinc-400'
                  }`}
                >
                  {page.conversion_rate.toFixed(1)}%
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2 py-0.5 rounded-lg">
                  {page.primary_event}
                </span>
              </td>
              {hasRevenue && (
                <td className="px-4 py-3 text-right">
                  <span className="text-xs text-zinc-300">
                    {page.revenue != null && page.revenue > 0
                      ? `$${page.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '—'}
                  </span>
                </td>
              )}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={hasRevenue ? 6 : 5} className="px-4 py-10 text-center text-zinc-500 text-sm">
                No converting pages found in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── No Events Configured CTA ──────────────────────────────────────────────────
function NoEventsCTA({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
        <Target className="w-8 h-8 text-violet-400" />
      </div>
      <div>
        <p className="text-white font-semibold text-base mb-2">
          Configure your conversion events
        </p>
        <p className="text-zinc-400 text-sm max-w-sm leading-relaxed">
          Track which business outcomes AI traffic drives — form submissions, sign-ups, purchases, and more.
        </p>
      </div>
      <Button
        onClick={onConfigure}
        className="bg-violet-600 hover:bg-violet-500 text-white rounded-xl px-6 h-10 text-sm font-medium cursor-pointer"
      >
        <Settings className="w-4 h-4 mr-2" />
        Configure Events
      </Button>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export function EventsConversionsPanel() {
  const { data: ga4Status, isLoading: isLoadingStatus } = useGetGA4StatusQuery()
  const ga4Connected = ga4Status?.connected === true

  const { data: properties = [], isLoading: isLoadingProperties } = useListGA4PropertiesQuery(undefined, {
    skip: !ga4Connected,
  })
  const [selectProperty] = useSelectGA4PropertyMutation()

  // Persist property selection in localStorage
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ga4_selected_property') ?? ga4Status?.selectedPropertyId ?? null
    }
    return ga4Status?.selectedPropertyId ?? null
  })

  const handlePropertySelect = useCallback(
    (id: string) => {
      setSelectedPropertyId(id)
      localStorage.setItem('ga4_selected_property', id)
      selectProperty({ propertyId: id })
    },
    [selectProperty],
  )

  // Sync selectedPropertyId once status loads
  const effectivePropertyId =
    selectedPropertyId ??
    ga4Status?.selectedPropertyId ??
    (properties.length > 0 ? properties[0].id : null)

  const [dateRange, setDateRange] = useState(DATE_RANGES[1]) // 30d default
  const [showConfigModal, setShowConfigModal] = useState(false)

  const { data: conversionEvents = [], isLoading: isLoadingEvents, refetch: refetchEvents } =
    useGetConversionEventsQuery(undefined, { skip: !ga4Connected })

  const hasEvents = conversionEvents.length > 0

  const {
    data: conversionsData,
    isLoading: isLoadingData,
    isFetching,
  } = useGetLLMConversionsQuery(
    {
      propertyId: effectivePropertyId!,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    { skip: !ga4Connected || !effectivePropertyId || !hasEvents },
  )

  const [syncConversions, { isLoading: isSyncing }] = useSyncLLMConversionsMutation()

  const handleSync = useCallback(async () => {
    if (!effectivePropertyId) return
    await syncConversions({
      propertyId: effectivePropertyId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    })
  }, [effectivePropertyId, dateRange, syncConversions])

  const handleModalSaved = () => {
    refetchEvents()
  }

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoadingStatus) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  // ── Not connected ────────────────────────────────────────────────────────
  if (!ga4Connected) return <ConnectPrompt />

  const data = conversionsData

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <MousePointer className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Events & Conversions</h3>
              <p className="text-xs text-zinc-400">LLM-attributed business outcomes from AI traffic</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Property selector */}
            {properties.length > 0 && (
              <PropertySelector
                properties={properties}
                selectedId={effectivePropertyId}
                onSelect={handlePropertySelect}
              />
            )}
            {/* Date range pills */}
            <div className="flex items-center gap-1 bg-zinc-800/60 rounded-xl p-1 border border-zinc-700/60">
              {DATE_RANGES.map((dr) => (
                <button
                  key={dr.label}
                  onClick={() => setDateRange(dr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    dateRange.label === dr.label
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {dr.label}
                </button>
              ))}
            </div>
            {/* Configure button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfigModal(true)}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-xl gap-1.5 text-xs cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              Configure Events
            </Button>
            {/* Sync Now */}
            {hasEvents && effectivePropertyId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSync}
                disabled={isSyncing || isFetching}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-xl gap-1.5 text-xs cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync Now
              </Button>
            )}
          </div>
        </div>

        {/* Tracked events badge strip */}
        {hasEvents && (
          <div className="px-5 py-2.5 bg-zinc-900/40 border-b border-zinc-800/40 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-zinc-500">Tracking:</span>
            {conversionEvents.map((e) => (
              <span
                key={e.id}
                className="text-[11px] bg-violet-500/10 border border-violet-500/20 text-violet-300 px-2 py-0.5 rounded-lg"
              >
                {e.display_label}
              </span>
            ))}
          </div>
        )}

        {/* Last synced */}
        {data?.last_synced_at && (
          <div className="px-5 py-2 flex items-center gap-1.5 text-[11px] text-zinc-500 bg-zinc-900/40">
            <Clock className="w-3 h-3" />
            Last synced {new Date(data.last_synced_at).toLocaleString()}
            {data.from_cache && (
              <span className="ml-1 bg-zinc-700/50 text-zinc-400 px-1.5 py-0.5 rounded-md text-[10px]">
                cached
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── No events configured ─────────────────────────────────────────────── */}
      {!hasEvents && !isLoadingEvents && (
        <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10]">
          <NoEventsCTA onConfigure={() => setShowConfigModal(true)} />
        </div>
      )}

      {/* ── No property selected ─────────────────────────────────────────────── */}
      {hasEvents && !effectivePropertyId && (
        <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10] p-8 text-center">
          <p className="text-zinc-400 text-sm">Select a GA4 property above to load conversion data.</p>
        </div>
      )}

      {/* ── Loading data ─────────────────────────────────────────────────────── */}
      {hasEvents && effectivePropertyId && (isLoadingData || isFetching) && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          <span className="ml-2 text-zinc-400 text-sm">Loading conversion data…</span>
        </div>
      )}

      {/* ── Data loaded ──────────────────────────────────────────────────────── */}
      {data && data.status === 'success' && (
        <>
          {/* ── KPI Cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard
              label="Total Conversions"
              value={data.total_conversions.toLocaleString()}
              sub="from AI platform traffic"
              icon={Target}
              iconColor="violet"
            />
            <KPICard
              label="LLM Conversion Rate"
              value={`${data.conversion_rate.toFixed(2)}%`}
              sub={
                data.site_conversion_rate > 0
                  ? `Site avg: ${data.site_conversion_rate.toFixed(2)}% · ${
                      data.conversion_rate > data.site_conversion_rate
                        ? `+${(data.conversion_rate - data.site_conversion_rate).toFixed(2)}% vs avg`
                        : `${(data.conversion_rate - data.site_conversion_rate).toFixed(2)}% vs avg`
                    }`
                  : 'LLM visitor conversion rate'
              }
              highlight={
                data.site_conversion_rate > 0
                  ? data.conversion_rate >= data.site_conversion_rate
                    ? 'green'
                    : 'amber'
                  : null
              }
              icon={TrendingUp}
              iconColor={data.conversion_rate >= data.site_conversion_rate ? 'emerald' : 'amber'}
            />
            <KPICard
              label="Revenue from AI Traffic"
              value={
                data.revenue !== null
                  ? `$${data.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'
              }
              sub={data.revenue === null ? 'GA4 ecommerce not enabled' : 'GA4 last-click attribution'}
              tooltip="Based on GA4 last-click attribution. Revenue is only available when GA4 ecommerce tracking is enabled."
              icon={DollarSign}
              iconColor="emerald"
            />
          </div>

          {/* ── Benchmark + Bar chart row ───────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Benchmark */}
            <BenchmarkBlock
              llmRate={data.conversion_rate}
              siteRate={data.site_conversion_rate}
            />

            {/* Platform breakdown chart */}
            {data.platform_breakdown.length > 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Conversions by AI Platform</h3>
                <PlatformConversionsChart breakdown={data.platform_breakdown} />
              </div>
            )}
          </div>

          {/* ── Top Converting Pages ────────────────────────────────────────── */}
          <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800/60 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Top Converting Pages</h3>
              <span className="text-xs text-zinc-500">{data.top_pages.length} pages</span>
            </div>
            <div className="p-4">
              <TopPagesTable pages={data.top_pages} />
            </div>
          </div>

          {/* ── Empty conversions state ─────────────────────────────────────── */}
          {data.total_conversions === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-[#0D0D10] p-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-zinc-800/60 flex items-center justify-center mx-auto mb-4">
                <Minus className="w-6 h-6 text-zinc-500" />
              </div>
              <p className="text-zinc-300 font-medium text-sm mb-1">
                No conversion events recorded from AI traffic in this period
              </p>
              <p className="text-zinc-500 text-xs">
                Try a longer date range or verify your tracked events match GA4 event names exactly.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Configure Events Modal ────────────────────────────────────────────── */}
      {showConfigModal && effectivePropertyId && (
        <ConfigureEventsModal
          propertyId={effectivePropertyId}
          existingEvents={conversionEvents}
          onClose={() => setShowConfigModal(false)}
          onSaved={handleModalSaved}
        />
      )}

      {/* ── No property / modal guard ─────────────────────────────────────────── */}
      {showConfigModal && !effectivePropertyId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111113] border border-zinc-700 rounded-2xl p-6 max-w-sm w-full text-center">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-white font-semibold mb-2">Select a GA4 property first</p>
            <p className="text-zinc-400 text-xs mb-4">
              A property must be selected to load available events from your GA4 account.
            </p>
            <Button
              onClick={() => setShowConfigModal(false)}
              className="bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl px-4 cursor-pointer"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
