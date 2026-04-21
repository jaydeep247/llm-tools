'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  TrendingUp,
  AlertCircle,
  Loader2,
  ArrowLeftRight,
  Zap,
  AlertTriangle,
  Plus,
  X,
  Info,
  ChevronDown,
  CalendarDays,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useGetGA4StatusQuery,
  useListGA4PropertiesQuery,
  useSelectGA4PropertyMutation,
  useGetCorrelationQuery,
  useAddContentEventMutation,
  CorrelationAnnotation,
  CorrelationClassification,
  AddContentEventPayload,
  GA4Property,
} from '@/store/api/ga4Api'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

// ── Correlation badge config ──────────────────────────────────────────────────
const BADGE_CONFIG: Record<
  CorrelationClassification,
  { bg: string; text: string; border: string; dot: string }
> = {
  'STRONG POSITIVE': {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  MODERATE: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  WEAK: {
    bg: 'bg-(--nd-bg)',
    text: 'text-(--nd-text-muted)',
    border: 'border-(--nd-border)',
    dot: 'bg-(--nd-text-muted)',
  },
  INVERSE: {
    bg: 'bg-red-50',
    text: 'text-red-600',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  content_published: 'Content Published',
  schema_added: 'Schema Added',
  score_change: 'Score Change',
}

const EVENT_TYPE_COLOR: Record<string, string> = {
  content_published: '#F59E0B',
  schema_added: '#22C55E',
  score_change: '#A855F7',
}

// ── GA4 connect prompt ────────────────────────────────────────────────────────
function GA4ConnectPrompt() {
  const handleConnect = () => {
    const returnUrl = window.location.pathname + window.location.search
    window.location.href = `${API_BASE_URL}/auth/google/analytics?returnUrl=${encodeURIComponent(returnUrl)}`
  }
  return (
    <div className="rounded-2xl border border-(--nd-border) bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-(--nd-border)">
        <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
          <ArrowLeftRight className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-(--nd-text-primary)">Visibility ↔ Traffic Correlation</h3>
          <p className="text-xs text-(--nd-text-muted)">Connect Google Analytics 4 to unlock statistical correlation</p>
        </div>
      </div>
      <div className="px-5 py-8 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-amber-600" />
        </div>
        <div>
          <p className="text-(--nd-text-primary) font-semibold text-sm mb-1">Google Analytics 4 not connected</p>
          <p className="text-(--nd-text-muted) text-xs max-w-xs">
            Connect GA4 to see the statistical correlation between your AI citation visibility and
            website traffic from LLMs.
          </p>
        </div>
        <Button
          onClick={handleConnect}
          className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm px-6 py-2 rounded-xl"
        >
          Connect Google Analytics
        </Button>
      </div>
    </div>
  )
}

// ── Add Event Modal ───────────────────────────────────────────────────────────
interface AddEventModalProps {
  onClose: () => void
  onSave: (payload: AddContentEventPayload) => Promise<void>
  isSaving: boolean
}

function AddEventModal({ onClose, onSave, isSaving }: AddEventModalProps) {
  const [date, setDate] = useState('')
  const [type, setType] = useState<AddContentEventPayload['event_type']>('content_published')
  const [label, setLabel] = useState('')

  const handleSubmit = async () => {
    if (!date || !label.trim()) return
    await onSave({ event_date: date, event_type: type, event_label: label.trim() })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white border border-(--nd-border) rounded-2xl w-full max-w-sm mx-4 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-(--nd-text-primary) font-semibold text-sm">Add Correlation Event</h3>
          <button onClick={onClose} className="text-(--nd-text-muted) hover:text-(--nd-text-primary) transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-(--nd-text-muted) mb-1.5">Event Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-(--nd-bg) border-(--nd-border) text-(--nd-text-primary) text-sm rounded-xl h-9"
            />
          </div>

          <div>
            <label className="block text-xs text-(--nd-text-muted) mb-1.5">Event Type</label>
            <div className="relative">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AddContentEventPayload['event_type'])}
                className="w-full appearance-none bg-(--nd-bg) border border-(--nd-border) text-(--nd-text-primary) text-sm rounded-xl px-3 h-9 pr-8 focus:outline-none focus:border-(--nd-purple)"
              >
                <option value="content_published">Content Published</option>
                <option value="schema_added">Schema Added</option>
                <option value="score_change">Score Change</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--nd-text-muted) pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-(--nd-text-muted) mb-1.5">Label</label>
            <Input
              type="text"
              placeholder="e.g. Published AI SEO Guide"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={200}
              className="bg-(--nd-bg) border-(--nd-border) text-(--nd-text-primary) text-sm rounded-xl h-9 placeholder:text-(--nd-text-muted)"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-(--nd-border) text-(--nd-text-secondary) hover:text-(--nd-text-primary) bg-transparent text-sm h-9 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!date || !label.trim() || isSaving}
            className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm h-9 rounded-xl disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Event'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function CorrelationTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const citations = payload.find((p: any) => p.dataKey === 'citations')?.value ?? 0
  const sessions = payload.find((p: any) => p.dataKey === 'llm_sessions')?.value ?? 0
  return (
    <div className="bg-white border border-(--nd-border) rounded-xl px-4 py-3 text-xs shadow-xl">
      <p className="text-(--nd-text-muted) mb-2 font-medium">Week of {label}</p>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
        <span className="text-(--nd-text-secondary)">Citations: </span>
        <span className="text-(--nd-text-primary) font-semibold ml-auto">{citations}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-(--nd-purple) shrink-0" />
        <span className="text-(--nd-text-secondary)">LLM Sessions: </span>
        <span className="text-(--nd-text-primary) font-semibold ml-auto">{sessions}</span>
      </div>
    </div>
  )
}

// ── Property selector (reused pattern) ───────────────────────────────────────
interface PropertySelectorProps {
  properties: GA4Property[]
  selectedId: string
  onSelect: (id: string) => void
}

function PropertySelector({ properties, selectedId, onSelect }: PropertySelectorProps) {
  if (properties.length <= 1) return null
  return (
    <div className="relative">
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="appearance-none bg-(--nd-bg) border border-(--nd-border) text-(--nd-text-primary) text-xs rounded-xl px-3 h-8 pr-7 focus:outline-none focus:border-(--nd-purple)"
      >
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-(--nd-text-muted) pointer-events-none" />
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────
interface CorrelationPanelProps {
  projectId: string
}

export function CorrelationPanel({ projectId }: CorrelationPanelProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ga4_selected_property') ?? ''
    }
    return ''
  })
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [activeAnnotation, setActiveAnnotation] = useState<CorrelationAnnotation | null>(null)

  const { data: ga4Status, isLoading: statusLoading } = useGetGA4StatusQuery()
  const ga4Connected = ga4Status?.connected === true

  const { data: properties = [] } = useListGA4PropertiesQuery(undefined, {
    skip: !ga4Connected,
  })
  const [selectProperty] = useSelectGA4PropertyMutation()

  const effectivePropertyId = useMemo(() => {
    if (selectedPropertyId && properties.find((p) => p.id === selectedPropertyId)) {
      return selectedPropertyId
    }
    if (ga4Status?.selectedPropertyId && properties.find((p) => p.id === ga4Status.selectedPropertyId)) {
      return ga4Status.selectedPropertyId
    }
    return properties[0]?.id ?? ''
  }, [selectedPropertyId, properties, ga4Status])

  const handlePropertyChange = (id: string) => {
    setSelectedPropertyId(id)
    if (typeof window !== 'undefined') localStorage.setItem('ga4_selected_property', id)
    selectProperty({ propertyId: id })
  }

  const {
    data: corrData,
    isLoading: corrLoading,
    isFetching: corrFetching,
    refetch,
  } = useGetCorrelationQuery(
    { propertyId: effectivePropertyId, projectId, weeks: 16 },
    { skip: !ga4Connected || !effectivePropertyId || !projectId },
  )

  const [addContentEvent, { isLoading: isSavingEvent }] = useAddContentEventMutation()

  const handleAddEvent = useCallback(
    async (payload: AddContentEventPayload) => {
      await addContentEvent(payload).unwrap()
      setShowAddEvent(false)
      refetch()
    },
    [addContentEvent, refetch],
  )

  // ── Annotation lookup for chart reference lines ───────────────────────────
  const annotationByWeek = useMemo(() => {
    const map: Record<string, CorrelationAnnotation[]> = {}
    if (!corrData?.annotations) return map
    for (const ann of corrData.annotations) {
      // Map annotation date to nearest week-start in the timeseries
      const ann_date = new Date(ann.date + 'T00:00:00Z')
      const day = ann_date.getUTCDay() || 7
      const monday = new Date(ann_date)
      monday.setUTCDate(ann_date.getUTCDate() - (day - 1))
      const weekKey = monday.toISOString().slice(0, 10)
      if (!map[weekKey]) map[weekKey] = []
      map[weekKey].push(ann)
    }
    return map
  }, [corrData?.annotations])

  // ── Normalise timeseries for dual-axis rendering ──────────────────────────
  // We normalise both series to 0–100 so they overlay naturally.
  // The tooltip still shows raw values.
  const chartData = useMemo(() => {
    if (!corrData?.timeseries?.length) return []
    const maxCit = Math.max(...corrData.timeseries.map((p) => p.citations), 1)
    const maxSes = Math.max(...corrData.timeseries.map((p) => p.llm_sessions), 1)
    return corrData.timeseries.map((p) => ({
      week: p.week.slice(5), // MM-DD
      fullWeek: p.week,
      citations: p.citations,
      llm_sessions: p.llm_sessions,
      // Normalised 0–100 for chart rendering
      cit_norm: parseFloat(((p.citations / maxCit) * 100).toFixed(1)),
      ses_norm: parseFloat(((p.llm_sessions / maxSes) * 100).toFixed(1)),
    }))
  }, [corrData?.timeseries])

  const annotationWeeks = useMemo(
    () => Object.keys(annotationByWeek).map((w) => w.slice(5)),
    [annotationByWeek],
  )

  // ── Render states ─────────────────────────────────────────────────────────
  if (statusLoading) {
    return (
      <div className="rounded-2xl border border-(--nd-border) bg-white p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-(--nd-text-muted) animate-spin" />
      </div>
    )
  }

  if (!ga4Connected) return <GA4ConnectPrompt />

  const isLoading = corrLoading || corrFetching

  const badge = corrData?.correlation
    ? BADGE_CONFIG[corrData.correlation.classification]
    : null

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="rounded-2xl border border-(--nd-border) bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--nd-border)">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <ArrowLeftRight className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-(--nd-text-primary)">Visibility ↔ Traffic Correlation</h3>
              <p className="text-xs text-(--nd-text-muted)">
                Statistical proof that AI citations drive LLM traffic
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PropertySelector
              properties={properties}
              selectedId={effectivePropertyId}
              onSelect={handlePropertyChange}
            />
            <button
              onClick={() => setShowAddEvent(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-(--nd-text-muted) hover:text-(--nd-text-primary) bg-(--nd-bg) hover:bg-(--nd-border) border border-(--nd-border) rounded-xl px-3 py-1.5 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Event
            </button>
          </div>
        </div>

        {/* ── Loading skeleton ── */}
        {isLoading && (
          <div className="p-8 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
            <p className="text-(--nd-text-muted) text-xs">Computing correlation analysis…</p>
          </div>
        )}

        {/* ── Insufficient data: progress bar ── */}
        {!isLoading && corrData?.status === 'insufficient_data' && (
          <div className="p-8">
            <div className="max-w-md mx-auto text-center space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
                <CalendarDays className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-(--nd-text-primary) font-semibold text-sm mb-1">Building your correlation dataset</p>
                <p className="text-(--nd-text-muted) text-xs leading-relaxed">
                  Correlation analysis unlocks with{' '}
                  <span className="text-(--nd-text-primary) font-medium">{corrData.min_weeks_required} weeks</span> of
                  data. Currently:{' '}
                  <span className="text-amber-600 font-semibold">
                    {corrData.weeks_collected}/{corrData.min_weeks_required} weeks
                  </span>{' '}
                  collected.
                </p>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-(--nd-border) rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(
                      100,
                      (corrData.weeks_collected / corrData.min_weeks_required) * 100,
                    )}%`,
                  }}
                />
              </div>
              <p className="text-(--nd-text-muted) text-xs">
                Keep running scans weekly to build your correlation dataset
              </p>
            </div>

            {/* Still show partial timeseries if available */}
            {corrData.timeseries.length > 0 && (() => {
              const maxCit = Math.max(...corrData.timeseries.map((p) => p.citations), 1)
              const maxSes = Math.max(...corrData.timeseries.map((p) => p.llm_sessions), 1)
              const partialData = corrData.timeseries.map((p) => ({
                week: p.week.slice(5),
                cit_norm: parseFloat(((p.citations / maxCit) * 100).toFixed(1)),
                ses_norm: parseFloat(((p.llm_sessions / maxSes) * 100).toFixed(1)),
              }))
              return (
              <div className="mt-6 opacity-40 pointer-events-none">
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={partialData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8E9EF" />
                      <XAxis dataKey="week" tick={{ fill: '#737890', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#E8E9EF' }} />
                      <YAxis domain={[0, 110]} tickFormatter={(v) => `${v}%`} tick={{ fill: '#737890', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Line type="monotone" dataKey="cit_norm" name="Citations" stroke="#F59E0B" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="ses_norm" name="LLM Sessions" stroke="#5347CE" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              )
            })()}

            {/* Show saved events even while still building the dataset */}
            {corrData.annotations.length > 0 && (
              <div className="mt-6 text-left">
                <p className="text-xs text-(--nd-text-muted) font-medium mb-2">Saved Events</p>
                <div className="space-y-2">
                  {corrData.annotations.map((ann, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-(--nd-border) bg-(--nd-bg) px-4 py-2.5"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: EVENT_TYPE_COLOR[ann.type] ?? '#F59E0B' }}
                      />
                      <span className="text-xs text-(--nd-text-muted)">{ann.date}</span>
                      <span className="text-xs text-(--nd-text-muted)">
                        {EVENT_TYPE_LABEL[ann.type] ?? ann.type}
                      </span>
                      <span className="text-xs text-(--nd-text-secondary) ml-auto truncate max-w-[200px]">
                        {ann.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── No citation data: zero-variance guard ── */}
        {!isLoading && corrData?.status === 'no_citation_data' && (
          <div className="p-8">
            <div className="max-w-md mx-auto text-center space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-(--nd-bg) border border-(--nd-border) flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-(--nd-text-muted)" />
              </div>
              <div>
                <p className="text-(--nd-text-primary) font-semibold text-sm mb-1">No citation data yet</p>
                <p className="text-(--nd-text-muted) text-xs leading-relaxed">
                  You have <span className="text-(--nd-text-primary) font-medium">{corrData.weeks_collected} weeks</span> of LLM
                  traffic data but no AI citation snapshots recorded yet. Run weekly scans so citations
                  can be tracked — correlation analysis will unlock once both signals have data.
                </p>
              </div>
            </div>

            {/* Still show the LLM sessions line so they can see traffic exists */}
            {corrData.timeseries.length > 0 && (() => {
              const maxSes = Math.max(...corrData.timeseries.map((p) => p.llm_sessions), 1)
              const partialData = corrData.timeseries.map((p) => ({
                week: p.week.slice(5),
                ses_norm: parseFloat(((p.llm_sessions / maxSes) * 100).toFixed(1)),
              }))
              return (
                <div className="mt-6 opacity-50 pointer-events-none">
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={partialData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8E9EF" />
                        <XAxis dataKey="week" tick={{ fill: '#737890', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#E8E9EF' }} />
                        <YAxis domain={[0, 110]} tickFormatter={(v) => `${v}%`} tick={{ fill: '#737890', fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Line type="monotone" dataKey="ses_norm" name="LLM Sessions" stroke="#5347CE" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-center text-[10px] text-(--nd-text-muted) mt-2">LLM Sessions (no citation data to correlate yet)</p>
                </div>
              )
            })()}

            {/* Saved events */}
            {corrData.annotations.length > 0 && (
              <div className="mt-6 text-left">
                <p className="text-xs text-(--nd-text-muted) font-medium mb-2">Saved Events</p>
                <div className="space-y-2">
                  {corrData.annotations.map((ann, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-(--nd-border) bg-(--nd-bg) px-4 py-2.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: EVENT_TYPE_COLOR[ann.type] ?? '#F59E0B' }} />
                      <span className="text-xs text-(--nd-text-muted)">{ann.date}</span>
                      <span className="text-xs text-(--nd-text-muted)">{EVENT_TYPE_LABEL[ann.type] ?? ann.type}</span>
                      <span className="text-xs text-(--nd-text-secondary) ml-auto truncate max-w-[200px]">{ann.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Full correlation view ── */}
        {!isLoading && corrData?.status === 'success' && corrData.correlation && (
          <div className="p-5 space-y-5">
            {/* ── Score cards row ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Correlation badge */}
              <div
                className={`rounded-xl border p-4 flex flex-col gap-2 ${badge!.bg} ${badge!.border}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-(--nd-text-muted) font-medium">Pearson r</span>
                  <div className="group relative">
                    <Info className="w-3.5 h-3.5 text-(--nd-text-muted) cursor-help" />
                    <div className="absolute right-0 top-5 w-64 bg-white border border-(--nd-border) rounded-lg px-3 py-2 text-xs text-(--nd-text-secondary) opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 leading-relaxed">
                      Pearson correlation coefficient between citation count and LLM traffic
                    </div>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <span className={`text-3xl font-bold tabular-nums ${badge!.text}`}>
                    {corrData.correlation.r.toFixed(3)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${badge!.dot}`} />
                  <span className={`text-xs font-semibold ${badge!.text}`}>
                    {corrData.correlation.classification}
                  </span>
                </div>
              </div>

              {/* Lag insight */}
              <div className="rounded-xl border border-(--nd-border) bg-(--nd-bg) p-4 flex flex-col gap-2">
                <span className="text-xs text-(--nd-text-muted) font-medium">Lag Effect</span>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold text-(--nd-text-primary) tabular-nums">
                    {corrData.correlation.primary_lag}
                  </span>
                  <span className="text-(--nd-text-muted) text-sm mb-1">
                    {corrData.correlation.primary_lag === 1 ? 'week' : 'weeks'}
                  </span>
                </div>
                <p className="text-xs text-(--nd-text-muted) leading-relaxed">
                  {corrData.correlation.primary_lag === 0
                    ? 'Citations and traffic move together in the same week'
                    : `Citations predict LLM traffic with a ${corrData.correlation.primary_lag}-week delay`}
                </p>
              </div>

              {/* Data points */}
              <div className="rounded-xl border border-(--nd-border) bg-(--nd-bg) p-4 flex flex-col gap-2">
                <span className="text-xs text-(--nd-text-muted) font-medium">Data Points</span>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold text-(--nd-text-primary) tabular-nums">
                    {corrData.correlation.data_points}
                  </span>
                  <span className="text-(--nd-text-muted) text-sm mb-1">weeks</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {corrData.correlation.lag_details.map(({ lag, r }) => (
                    <span
                      key={lag}
                      className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                        lag === corrData.correlation!.primary_lag
                          ? 'bg-amber-50 border-amber-200 text-amber-600'
                          : 'bg-(--nd-bg) border-(--nd-border) text-(--nd-text-muted)'
                      }`}
                    >
                      lag{lag}: {r.toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Weak correlation warning ── */}
            {corrData.correlation.r < 0.4 && corrData.correlation.r >= 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-(--nd-text-secondary) leading-relaxed">
                  <span className="text-(--nd-text-primary) font-semibold">Low correlation detected.</span> Your
                  cited pages may not be converting visibility into clicks. Review Top Landing Pages
                  to identify opportunity gaps.
                </p>
              </div>
            )}

            {/* ── Inverse warning ── */}
            {corrData.correlation.r < 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-(--nd-text-secondary) leading-relaxed">
                  <span className="text-red-600 font-semibold">Inverse correlation detected.</span>{' '}
                  Traffic appears to decrease as citations increase — this may indicate audience
                  mismatch, seasonality, or a data anomaly worth investigating.
                </p>
              </div>
            )}

            {/* ── Auto insight box ── */}
            {corrData.auto_insight && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-amber-700 font-semibold mb-1">AI Insight</p>
                    <p className="text-sm text-(--nd-text-secondary) leading-relaxed">{corrData.auto_insight}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Dual-axis chart ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-(--nd-text-muted) font-medium">
                  Weekly Citations vs LLM Sessions (normalised)
                </p>
                <div className="flex items-center gap-4 text-[10px] text-(--nd-text-muted)">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-0.5 bg-amber-500 inline-block rounded" />
                    Citations
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-0.5 bg-(--nd-purple) inline-block rounded" />
                    LLM Sessions
                  </span>
                  {corrData.annotations.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-0.5 h-3 bg-amber-500/60 inline-block" />
                      Events
                    </span>
                  )}
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E9EF" />
                    <XAxis
                      dataKey="week"
                      tick={{ fill: '#737890', fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: '#E8E9EF' }}
                    />
                    <YAxis
                      domain={[0, 110]}
                      tick={{ fill: '#737890', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <RechartsTooltip content={<CorrelationTooltip />} />

                    {/* Annotation reference lines */}
                    {annotationWeeks.map((w) => (
                      <ReferenceLine
                        key={w}
                        x={w}
                        stroke="#F59E0B"
                        strokeDasharray="4 3"
                        strokeOpacity={0.5}
                        strokeWidth={1.5}
                        label={{
                          position: 'insideTopRight',
                          value: '●',
                          fill: '#F59E0B',
                          fontSize: 8,
                        }}
                        onClick={() => {
                          const fullWeek = corrData.timeseries.find((p) => p.week.slice(5) === w)?.week
                          if (fullWeek && annotationByWeek[fullWeek]?.[0]) {
                            setActiveAnnotation(annotationByWeek[fullWeek][0])
                          }
                        }}
                      />
                    ))}

                    <Line
                      type="monotone"
                      dataKey="cit_norm"
                      name="Citations"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#F59E0B' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="ses_norm"
                      name="LLM Sessions"
                      stroke="#5347CE"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#5347CE' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Annotation list ── */}
            {corrData.annotations.length > 0 && (
              <div>
                <p className="text-xs text-(--nd-text-muted) font-medium mb-2">Correlation Events</p>
                <div className="space-y-2">
                  {corrData.annotations.map((ann, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-(--nd-border) bg-(--nd-bg) px-4 py-2.5"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: EVENT_TYPE_COLOR[ann.type] ?? '#F59E0B' }}
                      />
                      <span className="text-xs text-(--nd-text-muted)">{ann.date}</span>
                      <span className="text-xs text-(--nd-text-muted)">
                        {EVENT_TYPE_LABEL[ann.type] ?? ann.type}
                      </span>
                      <span className="text-xs text-(--nd-text-secondary) ml-auto truncate max-w-[200px]">
                        {ann.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Active annotation popover ── */}
      {activeAnnotation && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white border border-(--nd-border) rounded-2xl w-full max-w-xs mx-4 p-5 shadow-2xl">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: EVENT_TYPE_COLOR[activeAnnotation.type] ?? '#F59E0B' }}
                />
                <span className="text-(--nd-text-primary) text-sm font-semibold">{activeAnnotation.label}</span>
              </div>
              <button
                onClick={() => setActiveAnnotation(null)}
                className="text-(--nd-text-muted) hover:text-(--nd-text-primary) transition-colors ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-(--nd-text-muted)">
              <span className="text-(--nd-text-secondary)">{EVENT_TYPE_LABEL[activeAnnotation.type]}</span>
              {' · '}
              {activeAnnotation.date}
            </p>
          </div>
        </div>
      )}

      {/* ── Add Event Modal ── */}
      {showAddEvent && (
        <AddEventModal
          onClose={() => setShowAddEvent(false)}
          onSave={handleAddEvent}
          isSaving={isSavingEvent}
        />
      )}
    </div>
  )
}
