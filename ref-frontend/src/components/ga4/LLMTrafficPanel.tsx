'use client'

import { useState, useMemo } from 'react'
import {
  BarChart3,
  RefreshCw,
  ChevronDown,
  AlertCircle,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Bot,
  Info,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  LineChart,
  Line,
  Legend,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  useGetGA4StatusQuery,
  useListGA4PropertiesQuery,
  useSelectGA4PropertyMutation,
  useGetLLMTrafficQuery,
  useSyncLLMTrafficMutation,
  GA4Property,
  LLMPlatformBreakdown,
} from '@/store/api/ga4Api'

// ── Platform colour map ───────────────────────────────────────────────────────
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

// ── GA4 not-connected prompt ───────────────────────────────────────────────────
function LLMConnectPrompt() {
  const handleConnect = () => {
    const returnUrl = window.location.pathname + window.location.search
    window.location.href = `${API_BASE_URL}/auth/google/analytics?returnUrl=${encodeURIComponent(returnUrl)}`
  }

  return (
    <div className="rounded-2xl border border-zinc-700/60 bg-[#0D0D10] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/60">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">LLM Traffic</h3>
          <p className="text-xs text-zinc-400">Connect Google Analytics to reveal hidden AI referral channels</p>
        </div>
      </div>

      <div className="px-5 py-10 flex flex-col items-center text-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Bot className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm mb-1">Connect your Google Analytics account</p>
          <p className="text-zinc-400 text-xs max-w-sm leading-relaxed">
            Reveal exactly how much real website traffic is arriving from AI platforms. ChatGPT referrals are invisible in standard GA4 — this makes that hidden channel fully visible.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-left w-full max-w-sm">
          {[
            'Traffic from ChatGPT, Gemini & Perplexity',
            'Session breakdown by AI platform',
            'Daily trend over your selected period',
            'LLM % of total organic traffic',
          ].map((f) => (
            <div key={f} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
              <span className="text-zinc-300 text-xs">{f}</span>
            </div>
          ))}
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

// ── Property selector dropdown ─────────────────────────────────────────────────
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
        <div className="absolute z-50 top-full mt-1 left-0 min-w-72 max-w-sm rounded-xl bg-zinc-900 border border-zinc-700 shadow-xl overflow-hidden">
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

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({
  label,
  value,
  sub,
  delta,
  tooltip,
  icon: Icon,
  color = 'emerald',
}: {
  label: string
  value: string
  sub?: string
  delta?: { value: number; label: string }
  tooltip?: string
  icon: React.ElementType
  color?: string
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
  }
  const iconClass = colorMap[color] ?? colorMap.emerald

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400 font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${iconClass}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-white leading-none">{value}</p>
        {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        {delta !== undefined && (
          <span
            className={`flex items-center gap-1 text-xs font-medium ${
              delta.value > 0
                ? 'text-emerald-400'
                : delta.value < 0
                ? 'text-rose-400'
                : 'text-zinc-500'
            }`}
          >
            {delta.value > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : delta.value < 0 ? (
              <TrendingDown className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
            {delta.value > 0 ? '+' : ''}
            {delta.value.toFixed(1)}%
          </span>
        )}
        {tooltip && (
          <span className="text-[11px] text-zinc-500">{tooltip}</span>
        )}
      </div>
    </div>
  )
}

// ── Platform bar chart ─────────────────────────────────────────────────────────
function PlatformBarChart({ breakdown }: { breakdown: LLMPlatformBreakdown[] }) {
  const data = breakdown.map((p) => ({
    platform: p.platform,
    sessions: p.sessions,
    fill: platformColor(p.platform),
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(breakdown.length * 52, 120)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
        <XAxis type="number" dataKey="sessions" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
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
            const pct = breakdown.find((b) => b.platform === entry.payload.platform)?.percentOfLLMTotal
            return [`${value.toLocaleString()} sessions (${pct ?? 0}% of LLM total)`, entry.payload.platform]
          }}
        />
        <Bar dataKey="sessions" radius={[0, 6, 6, 0]}>
          {data.map((d, i) => (
            <rect key={i} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Trend line chart ───────────────────────────────────────────────────────────
function TrendLineChart({
  trend,
  platforms,
}: {
  trend: { date: string; [platform: string]: string | number }[]
  platforms: string[]
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const toggle = (platform: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(platform) ? next.delete(platform) : next.add(platform)
      return next
    })
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {platforms.map((p) => (
          <button
            key={p}
            onClick={() => toggle(p)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
              hidden.has(p)
                ? 'border-zinc-700 bg-zinc-800/40 text-zinc-500'
                : 'border-zinc-700 bg-zinc-800 text-zinc-200'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: platformColor(p), opacity: hidden.has(p) ? 0.3 : 1 }}
            />
            {p}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={trend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#71717a', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => v.slice(5)} // MM-DD
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <RechartsTooltip
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12 }}
            formatter={(value: number, name: string) => [`${value.toLocaleString()} sessions`, name]}
          />
          {platforms.map((p) => (
            <Line
              key={p}
              type="monotone"
              dataKey={p}
              stroke={platformColor(p)}
              strokeWidth={hidden.has(p) ? 0 : 2}
              dot={false}
              activeDot={hidden.has(p) ? false : { r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Platform breakdown table ───────────────────────────────────────────────────
type SortCol = 'sessions' | 'users' | 'avgSessionDuration' | 'bounceRate' | 'percentOfLLMTotal'

function BreakdownTable({ breakdown }: { breakdown: LLMPlatformBreakdown[] }) {
  const [sortCol, setSortCol] = useState<SortCol>('sessions')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    return [...breakdown].sort((a, b) => {
      const av = a[sortCol]
      const bv = b[sortCol]
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [breakdown, sortCol, sortDir])

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('desc') }
  }

  const cols: { key: SortCol; label: string }[] = [
    { key: 'sessions', label: 'Sessions' },
    { key: 'users', label: 'Users' },
    { key: 'avgSessionDuration', label: 'Avg Duration' },
    { key: 'bounceRate', label: 'Bounce Rate' },
    { key: 'percentOfLLMTotal', label: '% of LLM Total' },
  ]

  const ColHeader = ({ col }: { col: SortCol; label: string }) => {
    const c = cols.find((c) => c.key === col)!
    const active = sortCol === col
    return (
      <th
        className="px-4 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:text-zinc-300 transition-colors"
        onClick={() => handleSort(col)}
      >
        {c.label}
        {active && (
          <span className="ml-1 text-zinc-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </th>
    )
  }

  const fmtDuration = (s: number) =>
    s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-max">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/50">
            <th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
              Platform
            </th>
            {cols.map((c) => (
              <ColHeader key={c.key} col={c.key} label={c.label} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {sorted.map((row) => (
            <tr key={row.platform} className="hover:bg-zinc-800/30 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: platformColor(row.platform) }}
                  />
                  <span className="text-sm text-white font-medium">{row.platform}</span>
                  <span className="text-[11px] text-zinc-500">({row.sourceDomain})</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-zinc-200">{row.sessions.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-zinc-200">{row.users.toLocaleString()}</td>
              <td className="px-4 py-3 text-sm text-zinc-200">{fmtDuration(row.avgSessionDuration)}</td>
              <td className="px-4 py-3 text-sm text-zinc-200">{row.bounceRate.toFixed(1)}%</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${row.percentOfLLMTotal}%`,
                        background: platformColor(row.platform),
                      }}
                    />
                  </div>
                  <span className="text-sm text-zinc-200">{row.percentOfLLMTotal.toFixed(1)}%</span>
                </div>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 text-sm">
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Skeleton loader ────────────────────────────────────────────────────────────
function LLMSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-zinc-800 bg-[#111113] p-5 h-32" />
        ))}
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-[#111113] h-48" />
      <div className="rounded-2xl border border-zinc-800 bg-[#111113] h-72" />
      <div className="rounded-2xl border border-zinc-800 bg-[#111113] h-40" />
    </div>
  )
}

// ── No LLM traffic info state ─────────────────────────────────────────────────
function NoLLMTrafficState({ onNavigate }: { onNavigate?: (section: string) => void }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#111113] px-6 py-14 flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
        <Bot className="w-7 h-7 text-blue-400" />
      </div>
      <div>
        <p className="text-white font-semibold mb-1">No AI platform traffic detected in this period</p>
        <p className="text-zinc-400 text-sm max-w-sm leading-relaxed">
          This may mean your content is not yet being cited by AI platforms.
          Review your AI Visibility score for guidance.
        </p>
      </div>
      {onNavigate && (
        <button
          onClick={() => onNavigate('ai-visibility-scorecards')}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2 cursor-pointer"
        >
          View AI Visibility →
        </button>
      )}
    </div>
  )
}

// ── Token expired banner ───────────────────────────────────────────────────────
function TokenExpiredBanner() {
  const handleReconnect = () => {
    const returnUrl = window.location.pathname + window.location.search
    window.location.href = `${API_BASE_URL}/auth/google/analytics?returnUrl=${encodeURIComponent(returnUrl)}`
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
      <p className="text-sm text-amber-300 flex-1">
        Your Google Analytics connection has expired. Please reconnect to continue seeing traffic data.
      </p>
      <button
        onClick={handleReconnect}
        className="text-xs text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer shrink-0"
      >
        Reconnect
      </button>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
interface LLMTrafficPanelProps {
  onNavigate?: (section: string) => void
}

export function LLMTrafficPanel({ onNavigate }: LLMTrafficPanelProps) {
  const [dateRangeIdx, setDateRangeIdx] = useState(1) // default 30d
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [tokenExpired, setTokenExpired] = useState(false)

  const { startDate, endDate, label: rangeLabel } = { ...DATE_RANGES[dateRangeIdx], label: DATE_RANGES[dateRangeIdx].label }

  const { data: ga4Status, isLoading: statusLoading } = useGetGA4StatusQuery()
  const { data: properties = [], isLoading: propsLoading } = useListGA4PropertiesQuery(undefined, {
    skip: !ga4Status?.connected,
  })
  const [selectProperty] = useSelectGA4PropertyMutation()

  // Resolve property: user pick → saved selection → first in list
  const resolvedPropertyId =
    selectedPropertyId ??
    ga4Status?.selectedPropertyId ??
    (properties.length > 0 ? properties[0].id : null)

  const {
    data: llmData,
    isLoading: llmLoading,
    isFetching,
    error: llmError,
  } = useGetLLMTrafficQuery(
    { propertyId: resolvedPropertyId!, startDate, endDate },
    { skip: !ga4Status?.connected || !resolvedPropertyId },
  )

  const [syncLLM, { isLoading: syncing }] = useSyncLLMTrafficMutation()

  const handlePropertySelect = (id: string) => {
    setSelectedPropertyId(id)
    selectProperty({ propertyId: id })
  }

  const handleSync = async () => {
    if (!resolvedPropertyId) return
    try {
      await syncLLM({ propertyId: resolvedPropertyId, startDate, endDate }).unwrap()
    } catch {
      // no-op; errors shown via llmError
    }
  }

  // Detect expired token from API error
  const isTokenExpired =
    tokenExpired ||
    (llmError && 'status' in llmError && (llmError.status === 401 || llmError.status === 403))

  // ── Loading states ─────────────────────────────────────────────────────────
  if (statusLoading || propsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        <span className="ml-2 text-zinc-400 text-sm">Fetching your traffic data from Google Analytics...</span>
      </div>
    )
  }

  // ── GA4 not connected ──────────────────────────────────────────────────────
  if (!ga4Status?.connected) {
    return <LLMConnectPrompt />
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-800 bg-[#111113]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800/60 relative">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">LLM Traffic</h3>
              <p className="text-xs text-zinc-400">AI-referred sessions from ChatGPT, Gemini, Perplexity & more</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Property selector */}
            {properties.length > 0 && (
              <PropertySelector
                properties={properties}
                selectedId={resolvedPropertyId}
                onSelect={handlePropertySelect}
              />
            )}

            {/* Date range toggle */}
            <div className="flex items-center rounded-xl border border-zinc-700/60 bg-zinc-800/60 overflow-hidden">
              {DATE_RANGES.map((r, i) => (
                <button
                  key={r.label}
                  onClick={() => setDateRangeIdx(i)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    dateRangeIdx === i
                      ? 'bg-emerald-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Sync button */}
            <button
              onClick={handleSync}
              disabled={syncing || isFetching || !resolvedPropertyId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-700/60 bg-zinc-800/60 text-xs text-zinc-300 hover:bg-zinc-700/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing || isFetching ? 'animate-spin' : ''}`} />
              Sync Now
            </button>
          </div>
        </div>

        {/* Last synced */}
        {llmData && (
          <div className="px-5 py-2.5 flex items-center gap-2 border-b border-zinc-800/40 bg-zinc-900/30">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[11px] text-zinc-500">
              {llmData.fromCache
                ? `Data last synced ${Math.round((Date.now() - new Date(llmData.lastSyncedAt).getTime()) / 60_000)} min ago. Click 'Sync Now' for fresh data.`
                : `Synced just now · ${new Date(llmData.lastSyncedAt).toLocaleTimeString()}`}
            </span>
          </div>
        )}
      </div>

      {/* ── Token expired banner ──────────────────────────────────────────── */}
      {isTokenExpired && <TokenExpiredBanner />}

      {/* ── No property selected ──────────────────────────────────────────── */}
      {!resolvedPropertyId && !llmLoading && (
        <div className="rounded-2xl border border-zinc-800 bg-[#111113] px-6 py-10 flex flex-col items-center text-center gap-3">
          <AlertCircle className="w-8 h-8 text-zinc-500" />
          <p className="text-sm text-zinc-400">Select a GA4 property above to load LLM traffic data.</p>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {(llmLoading || (isFetching && !llmData)) && resolvedPropertyId && <LLMSkeleton />}

      {/* ── Data ─────────────────────────────────────────────────────────── */}
      {llmData && !llmLoading && (
        <>
          {/* No LLM traffic state */}
          {llmData.totalLLMSessions === 0 ? (
            <NoLLMTrafficState onNavigate={onNavigate} />
          ) : (
            <>
              {/* ── KPI Cards ─────────────────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Total LLM Sessions */}
                <KPICard
                  label="Total LLM Sessions"
                  value={llmData.totalLLMSessions.toLocaleString()}
                  sub={`in the last ${rangeLabel}`}
                  delta={
                    llmData.previousPeriod.totalLLMSessions > 0
                      ? {
                          value:
                            ((llmData.totalLLMSessions - llmData.previousPeriod.totalLLMSessions) /
                              llmData.previousPeriod.totalLLMSessions) *
                            100,
                          label: 'vs prior period',
                        }
                      : undefined
                  }
                  tooltip="vs prior period"
                  icon={TrendingUp}
                  color="emerald"
                />

                {/* LLM % of Total */}
                <KPICard
                  label="LLM % of Total Traffic"
                  value={`${llmData.llmPercentOfTotal.toFixed(2)}%`}
                  sub={`${llmData.totalLLMSessions.toLocaleString()} of ${llmData.totalSiteSessions.toLocaleString()} total sessions`}
                  delta={
                    llmData.previousPeriod.llmPercentOfTotal > 0
                      ? {
                          value:
                            llmData.llmPercentOfTotal - llmData.previousPeriod.llmPercentOfTotal,
                          label: 'vs prior period',
                        }
                      : undefined
                  }
                  tooltip="LLM sessions / total site sessions"
                  icon={BarChart3}
                  color="blue"
                />
              </div>

              {/* ── Sessions by Platform (horizontal bar) ─────────────────── */}
              <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
                  <h4 className="text-sm font-semibold text-white">Sessions by Platform</h4>
                  <div className="flex flex-wrap gap-2">
                    {llmData.breakdown.map((p) => (
                      <span
                        key={p.platform}
                        className="flex items-center gap-1.5 text-[11px] text-zinc-400"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: platformColor(p.platform) }}
                        />
                        {p.platform}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="px-4 pt-4 pb-5">
                  <PlatformBarChart breakdown={llmData.breakdown} />
                </div>
              </div>

              {/* ── LLM Traffic Trend (line chart) ────────────────────────── */}
              {llmData.trend.length > 0 && (() => {
                // Pivot trend rows into {date, ChatGPT: n, Gemini: n, …}
                const platformsInTrend = [...new Set(llmData.trend.map((t) => t.platform))]
                const dateMap: Record<string, Record<string, number>> = {}
                for (const row of llmData.trend) {
                  if (!dateMap[row.date]) dateMap[row.date] = {}
                  dateMap[row.date][row.platform] = (dateMap[row.date][row.platform] ?? 0) + row.sessions
                }
                const trendPivoted = Object.entries(dateMap)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, vals]) => ({ date, ...vals }))

                return (
                  <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-800/60">
                      <h4 className="text-sm font-semibold text-white">LLM Traffic Trend</h4>
                      <p className="text-xs text-zinc-500 mt-0.5">Daily sessions per platform — click legend to toggle</p>
                    </div>
                    <div className="px-4 pt-4 pb-5">
                      <TrendLineChart trend={trendPivoted} platforms={platformsInTrend} />
                    </div>
                  </div>
                )
              })()}

              {/* ── Platform Breakdown Table ───────────────────────────────── */}
              <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800/60">
                  <h4 className="text-sm font-semibold text-white">Platform Breakdown</h4>
                  <p className="text-xs text-zinc-500 mt-0.5">Click column headers to sort</p>
                </div>
                <div className="p-4">
                  <BreakdownTable breakdown={llmData.breakdown} />
                </div>
              </div>

              {/* ── Insight callout ────────────────────────────────────────── */}
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 px-5 py-4 flex gap-3">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-200 font-medium mb-1">About LLM Traffic data</p>
                  <p className="text-xs text-blue-300/70 leading-relaxed">
                    AI platforms like ChatGPT do not send HTTP referer headers, so their traffic
                    is normally invisible in GA4 — appearing as direct or unattributed traffic.
                    This panel identifies sessions where the GA4 session source dimension matches
                    known AI platform domains (e.g. chatgpt.com). Traffic arriving inside native
                    apps or via API will still be unattributed.
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
