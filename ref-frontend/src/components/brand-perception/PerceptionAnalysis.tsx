'use client'

import { Fragment, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { 
  MoreVertical, 
  Plus, 
  ChevronRight,
  ChevronDown,
  Glasses,
  X,
  Pencil
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetPerceptionAnalysisQuery, useRunPerceptionAnalysisMutation } from '@/store/api/module_E/moduleEApi'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type PerceptionRow = {
  id: number
  property: string
  prompt: string
  chatgpt: { status: string; score: number; response?: string; citations?: Array<{ source?: string }> }
  gemini: { status: string; score: number; response?: string; citations?: Array<{ source?: string }> }
  claude: { status: string; score: number; response?: string; citations?: Array<{ source?: string }> }
  added: string
}

type ModelKey = 'chatgpt' | 'gemini' | 'claude'
type TimeRangeKey = '6w' | '3m' | '6m' | '1y'

const TIME_RANGE_OPTIONS: Array<{ value: TimeRangeKey; label: string; days: number }> = [
  { value: '6w', label: 'Last 6 Weeks', days: 42 },
  { value: '3m', label: 'Last 3 Months', days: 90 },
  { value: '6m', label: 'Last 6 Months', days: 180 },
  { value: '1y', label: 'Last Year', days: 365 },
]

function toModelKey(model: string): ModelKey | null {
  const m = model.toLowerCase()
  if (m.includes('gpt') || m.includes('chatgpt')) return 'chatgpt'
  if (m.includes('gemini')) return 'gemini'
  if (m.includes('claude')) return 'claude'
  return null
}

function formatTrendLabel(value: string | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

function normalizeModelResponse(text: string) {
  // Keep markdown, but normalize whitespace for better readability.
  // Common model outputs sometimes come as a single huge paragraph.
  const t = (text || '').replace(/\r\n/g, '\n')
  return t
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function ResponseContent({ text }: { text: string }) {
  const normalized = useMemo(() => normalizeModelResponse(text), [text])
  return (
    <div className="rounded-md bg-(--nd-bg) border border-(--nd-border) p-3 sm:p-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-sky-500 hover:text-sky-400 underline underline-offset-2 wrap-break-word"
            >
              {children}
            </a>
          ),
          p: ({ children }) => <p className="text-sm text-(--nd-text-secondary) leading-relaxed mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-3 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-3 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="text-sm text-(--nd-text-secondary) leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="text-(--nd-text-primary) font-semibold">{children}</strong>,
          em: ({ children }) => <em className="text-(--nd-text-secondary) italic">{children}</em>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded bg-(--nd-bg) border border-(--nd-border) text-[12px] text-(--nd-text-secondary)">
              {children}
            </code>
          ),
        }}
      >
        {normalized || 'No response text available.'}
      </ReactMarkdown>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string, bg: string, border: string }> = {
    'Exceptional': { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    'Great': { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    'Good': { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    'Unavailable': { color: 'text-zinc-500', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20' },
  }

  const { color, bg, border } = config[status] || config['Good']

  return (
    <div className={cn("flex flex-col items-center gap-1.5 py-2 px-3 rounded-xl border transition-all hover:bg-(--nd-bg)", bg, border)}>
      <div className={cn("w-2 h-2 rounded-full", color.replace('text', 'bg'))} />
      <span className={cn("text-[11px] font-bold uppercase tracking-wider", color)}>{status}</span>
    </div>
  )
}

function ChatGPTLogo(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5153-4.9066 6.0462 6.0462 0 0 0-4.4471-2.9143 6.0507 6.0507 0 0 0-5.3881 1.6361 6.0462 6.0462 0 0 0-4.6619-2.0906 6.0522 6.0522 0 0 0-5.1023 2.7728 5.9847 5.9847 0 0 0-1.6361 5.3881 6.0462 6.0462 0 0 0 2.9143 4.4471 6.0507 6.0507 0 0 0 1.6361 5.3881 6.0462 6.0462 0 0 0 4.4471 2.9143 6.0507 6.0507 0 0 0 5.3881-1.6361 6.0462 6.0462 0 0 0 4.6619 2.0906 6.0522 6.0522 0 0 0 5.1023-2.7728 5.9847 5.9847 0 0 0 1.6361-5.3881 6.0462 6.0462 0 0 0-2.9143-4.4471zM11.9646 12.0163L11.9646 11.9646L12.0163 11.9646L11.9646 12.0163z" />
    </svg>
  )
}

function GeminiLogo(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2L14.85 9.15L22 12L14.85 14.85L12 22L9.15 14.85L2 12L9.15 9.15L12 2Z" />
    </svg>
  )
}

function ClaudeLogo(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
    </svg>
  )
}

export default function PerceptionAnalysis({
  brandName,
  domainName = 'Your Brand',
  jobId,
  customerRootDomain,
}: {
  brandName?: string
  domainName?: string
  jobId?: string
  customerRootDomain?: string
}) {
  const [expandedRowId, setExpandedRowId] = useState<number | null>(1)
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('6w')
  const [selectedInsight, setSelectedInsight] = useState<{
    property: string
    prompt: string
    model: string
    status: string
  } | null>(null)
  const canQuery = Boolean(jobId)
  const { data, isLoading, isFetching, refetch } = useGetPerceptionAnalysisQuery(jobId ?? '', { skip: !canQuery })
  const [runPerception, { isLoading: isRunning }] = useRunPerceptionAnalysisMutation()
  const apiBrandName = data?.data?.data?.brand_name
  const preferredBrandName =
    (typeof apiBrandName === 'string' && apiBrandName.trim().length > 0 ? apiBrandName : undefined) ??
    (typeof brandName === 'string' && brandName.trim().length > 0 ? brandName : undefined) ??
    domainName
  const safeDomainName = typeof preferredBrandName === 'string' && preferredBrandName.trim().length > 0
    ? preferredBrandName.trim()
    : 'Your Brand'
  const safeDomainNameLower = safeDomainName.toLowerCase()

  const rows: PerceptionRow[] = useMemo(() => {
    const cells = data?.data?.data?.cells ?? []
    const byProperty = new Map<string, PerceptionRow>()

    cells.forEach((cell, idx) => {
      const modelKey = toModelKey(cell.model_version || cell.model)
      if (!modelKey) return
      if (!byProperty.has(cell.property)) {
        byProperty.set(cell.property, {
          id: byProperty.size + 1,
          property: cell.property,
          prompt: cell.prompt,
          chatgpt: { status: 'Unavailable', score: 0 },
          gemini: { status: 'Unavailable', score: 0 },
          claude: { status: 'Unavailable', score: 0 },
          added: data?.data?.data?.market ? new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : `Item ${idx + 1}`,
        })
      }
      const row = byProperty.get(cell.property)!
      row[modelKey] = {
        status: cell.rating,
        score: Number(cell.rating_score ?? 0),
        response: cell.raw_response_text,
        citations: cell.citations ?? [],
      }
    })

    return Array.from(byProperty.values())
  }, [data])

  const trendByProperty = useMemo(() => {
    const history = data?.data?.data?.history ?? []
    const range = TIME_RANGE_OPTIONS.find((option) => option.value === timeRange) ?? TIME_RANGE_OPTIONS[0]
    const cutoff = Date.now() - range.days * 24 * 60 * 60 * 1000
    const filteredHistory = history.filter((runPoint) => {
      const runAt = new Date(runPoint.run_at).getTime()
      return Number.isFinite(runAt) && runAt >= cutoff
    })
    const rangeHistory = filteredHistory.length > 0 ? filteredHistory : history
    const byProperty = new Map<string, {
      labels: string[]
      chatgpt: number[]
      gemini: number[]
      claude: number[]
    }>()

    rows.forEach((row) => {
      byProperty.set(row.property, { labels: [], chatgpt: [], gemini: [], claude: [] })
    })

    rangeHistory.forEach((runPoint) => {
      const runLabel = formatTrendLabel(runPoint.run_at)
      const scoreMap = new Map<string, Partial<Record<ModelKey, number>>>()
      runPoint.scores?.forEach((scoreRow) => {
        const modelKey = toModelKey(scoreRow.model_version || scoreRow.model)
        if (!modelKey) return
        if (!scoreMap.has(scoreRow.property)) scoreMap.set(scoreRow.property, {})
        scoreMap.get(scoreRow.property)![modelKey] = Number(scoreRow.rating_score ?? 0)
      })

      byProperty.forEach((series, propertyName) => {
        const point = scoreMap.get(propertyName)
        series.labels.push(runLabel)
        series.chatgpt.push(point?.chatgpt ?? 0)
        series.gemini.push(point?.gemini ?? 0)
        series.claude.push(point?.claude ?? 0)
      })
    })

    byProperty.forEach((series, propertyName) => {
      if (series.labels.length > 0) return
      const row = rows.find((r) => r.property === propertyName)
      if (!row) return
      series.labels.push(formatTrendLabel(new Date().toISOString()))
      series.chatgpt.push(row.chatgpt.score)
      series.gemini.push(row.gemini.score)
      series.claude.push(row.claude.score)
    })

    return byProperty
  }, [data, rows, timeRange])

  const promptsTracked = rows.length
  const averageScore =
    rows.length > 0
      ? Math.round(
          rows.reduce((acc, row) => acc + row.chatgpt.score + row.gemini.score + row.claude.score, 0) /
            (rows.length * 3)
        )
      : 0
  const overallPerception = averageScore >= 85 ? 'Exceptional' : averageScore >= 65 ? 'Great' : averageScore >= 40 ? 'Good' : 'Unavailable'
  const modelAverages = [
    { name: 'ChatGPT', value: rows.reduce((s, r) => s + r.chatgpt.score, 0) / Math.max(1, rows.length) },
    { name: 'Gemini', value: rows.reduce((s, r) => s + r.gemini.score, 0) / Math.max(1, rows.length) },
    { name: 'Claude', value: rows.reduce((s, r) => s + r.claude.score, 0) / Math.max(1, rows.length) },
  ]
  const topModel = modelAverages.sort((a, b) => b.value - a.value)[0]?.name ?? '-'

  const buildTrendChartData = (row: PerceptionRow) => {
    const trend = trendByProperty.get(row.property)
    const labels = trend?.labels?.length ? trend.labels : [formatTrendLabel(new Date().toISOString())]
    const chatgptScores = trend?.chatgpt?.length ? trend.chatgpt : [row.chatgpt.score]
    const geminiScores = trend?.gemini?.length ? trend.gemini : [row.gemini.score]
    const claudeScores = trend?.claude?.length ? trend.claude : [row.claude.score]

    return labels.map((label, idx) => ({
      date: label,
      chatgpt: chatgptScores[idx] ?? 0,
      gemini: geminiScores[idx] ?? 0,
      claude: claudeScores[idx] ?? 0,
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 min-w-0">
        <div className="shrink-0 p-2 rounded-xl bg-(--nd-purple-subtle) border border-(--nd-purple)/20">
          <Glasses className="w-5 h-5 text-(--nd-purple)" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-(--nd-text-primary) truncate">
            What AI chatbots think about {safeDomainName}
          </h3>
          <p className="text-xs text-(--nd-text-muted) mt-0.5">
            This analysis shows how AI perceives your brand when users ask questions about it directly. Monitor sentiment, accuracy, and positioning across major LLM models.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-(--nd-border) bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-(--nd-text-muted)">Overall Perception</p>
          <p className="mt-2 text-2xl font-semibold text-(--nd-text-primary)">{overallPerception}</p>
          <p className="mt-1 text-xs text-(--nd-text-muted)">Based on live perception responses</p>
        </div>
        <div className="rounded-2xl border border-(--nd-border) bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-(--nd-text-muted)">Top Performing Model</p>
          <p className="mt-2 text-2xl font-semibold text-(--nd-text-primary)">{topModel}</p>
          <p className="mt-1 text-xs text-(--nd-text-muted)">Highest average status across prompts</p>
        </div>
        <div className="rounded-2xl border border-(--nd-border) bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-(--nd-text-muted)">Prompts Tracked</p>
          <p className="mt-2 text-2xl font-semibold text-(--nd-text-primary)">{promptsTracked}</p>
          <p className="mt-1 text-xs text-(--nd-text-muted)">Live tracked prompts</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="border-(--nd-border) bg-white text-(--nd-text-secondary) hover:bg-(--nd-bg)"
          disabled={!jobId || !customerRootDomain || isRunning}
          onClick={async () => {
            if (!jobId || !customerRootDomain) return
            await runPerception({
              job_id: jobId,
              brand_name: safeDomainName,
              domain: customerRootDomain,
            }).unwrap()
            refetch()
          }}
        >
          {isRunning ? 'Running...' : 'Run Perception Analysis'}
        </Button>
        {(isLoading || isFetching) && <span className="text-xs text-(--nd-text-muted)">Loading analysis...</span>}
      </div>

      <div className="bg-white border border-(--nd-border) rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-250">
            <thead>
              <tr className="border-b border-(--nd-border) bg-(--nd-bg)">
                <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-widest text-(--nd-text-muted) w-37.5">Property</th>
                <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-widest text-(--nd-text-muted)">Prompt</th>
                <th className="py-4 px-4 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <ChatGPTLogo className="w-5 h-5 text-(--nd-text-primary)" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-(--nd-text-muted)">ChatGPT</span>
                  </div>
                </th>
                <th className="py-4 px-4 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <GeminiLogo className="w-5 h-5 text-blue-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-(--nd-text-muted)">Gemini</span>
                  </div>
                </th>
                <th className="py-4 px-4 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <ClaudeLogo className="w-5 h-5 text-orange-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-(--nd-text-muted)">Claude</span>
                  </div>
                </th>
                <th className="py-4 px-6 text-[11px] font-bold uppercase tracking-widest text-(--nd-text-muted) w-30">Added</th>
                <th className="py-4 px-6 w-15"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--nd-border)">
              {rows.map((row) => {
                const isExpanded = expandedRowId === row.id
                const trend = trendByProperty.get(row.property)
                const trendChartData = buildTrendChartData(row)
                return (
                  <Fragment key={row.id}>
                    <tr className="group hover:bg-(--nd-bg) transition-colors">
                      <td className="py-5 px-6">
                        <button
                          type="button"
                          onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                          className="flex items-center gap-3 cursor-pointer"
                        >
                          <ChevronRight
                            className={cn(
                              'w-3.5 h-3.5 text-(--nd-border) group-hover:text-(--nd-text-muted) transition-transform',
                              isExpanded && 'rotate-90'
                            )}
                          />
                          <span className="text-sm font-semibold text-(--nd-text-primary)">{row.property}</span>
                        </button>
                      </td>
                      <td className="py-5 px-6">
                        <p className="text-sm text-(--nd-text-muted) leading-relaxed max-w-md">
                          {row.prompt.replace('[Brand]', safeDomainName).replace('[brand]', safeDomainNameLower)}
                        </p>
                      </td>
                      <td className="py-5 px-4">
                        <button
                          type="button"
                          className="w-full cursor-pointer"
                          onClick={() =>
                            setSelectedInsight({
                              property: row.property,
                              prompt: row.prompt.replace('[Brand]', safeDomainName).replace('[brand]', safeDomainNameLower),
                              model: 'ChatGPT',
                              status: row.chatgpt.status,
                            })
                          }
                        >
                          <StatusBadge status={row.chatgpt.status} />
                        </button>
                      </td>
                      <td className="py-5 px-4">
                        <button
                          type="button"
                          className="w-full cursor-pointer"
                          onClick={() =>
                            setSelectedInsight({
                              property: row.property,
                              prompt: row.prompt.replace('[Brand]', safeDomainName).replace('[brand]', safeDomainNameLower),
                              model: 'Gemini',
                              status: row.gemini.status,
                            })
                          }
                        >
                          <StatusBadge status={row.gemini.status} />
                        </button>
                      </td>
                      <td className="py-5 px-4">
                        <button
                          type="button"
                          className="w-full cursor-pointer"
                          onClick={() =>
                            setSelectedInsight({
                              property: row.property,
                              prompt: row.prompt.replace('[Brand]', safeDomainName).replace('[brand]', safeDomainNameLower),
                              model: 'Claude',
                              status: row.claude.status,
                            })
                          }
                        >
                          <StatusBadge status={row.claude.status} />
                        </button>
                      </td>
                      <td className="py-5 px-6">
                        <span className="text-xs font-medium text-(--nd-text-muted)">{row.added}</span>
                      </td>
                      <td className="py-5 px-6">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-(--nd-text-muted) hover:text-(--nd-text-primary) hover:bg-(--nd-bg) rounded-lg">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-(--nd-bg) px-6 py-5">
                          <div className="rounded-xl border border-(--nd-border) bg-white p-4">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-sm font-semibold text-(--nd-text-primary)">Historical Score Trends</p>
                              <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRangeKey)}>
                                <SelectTrigger className="h-8 w-37.5 border-(--nd-border) bg-white text-xs text-(--nd-text-secondary)">
                                  <SelectValue placeholder="Select range" />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-(--nd-border) text-(--nd-text-primary)">
                                  {TIME_RANGE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value} className="text-xs">
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="w-full h-56 border border-(--nd-border) rounded-lg p-3 bg-(--nd-bg)">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendChartData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E9EF" vertical={false} />
                                  <XAxis
                                    dataKey="date"
                                    stroke="#737890"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                  />
                                  <YAxis
                                    stroke="#737890"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[0, 100]}
                                  />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: '#ffffff',
                                      border: '1px solid #E8E9EF',
                                      borderRadius: '10px',
                                      color: '#1A1D2B',
                                    }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="chatgpt"
                                    name="ChatGPT"
                                    stroke="#60a5fa"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: '#60a5fa' }}
                                    activeDot={{ r: 5 }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="gemini"
                                    name="Gemini"
                                    stroke="#22c55e"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: '#22c55e' }}
                                    activeDot={{ r: 5 }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="claude"
                                    name="Claude"
                                    stroke="#fb923c"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: '#fb923c' }}
                                    activeDot={{ r: 5 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[10px] text-(--nd-text-muted)">
                              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#60a5fa]" />ChatGPT</span>
                              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#22c55e]" />Gemini</span>
                              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#fb923c]" />Claude</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-(--nd-border) bg-white flex justify-center">
          <Button variant="ghost" className="text-(--nd-text-muted) hover:text-(--nd-text-primary) gap-2 text-sm font-medium py-6 px-8 rounded-xl border border-dashed border-(--nd-border) hover:border-(--nd-text-muted) transition-all">
            <Plus className="w-4 h-4" />
            Add Perception Prompts
          </Button>
        </div>
      </div>

      {selectedInsight && (
        <div className="fixed inset-0 z-80 bg-black/65 backdrop-blur-sm flex items-start justify-center p-4 sm:p-6">
          <div className="w-full max-w-3xl max-h-[90vh] rounded-xl border border-(--nd-border) bg-white overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-(--nd-border) flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-(--nd-text-primary)">
                  {selectedInsight.property} as perceived by {selectedInsight.model}
                </h3>
                <p className="text-xs text-(--nd-text-muted) mt-0.5">
                  View the AI response and scoring for this perception prompt
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInsight(null)}
                className="text-(--nd-text-muted) hover:text-(--nd-text-primary) cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto max-h-[82vh]">
              <div className="rounded-lg border border-(--nd-border) bg-(--nd-bg) p-3 flex items-center justify-between">
                <div className="text-sm text-(--nd-text-secondary) flex items-center gap-2">
                  <span className="text-(--nd-text-muted)">Score:</span>
                  <span
                    className={cn(
                      'font-semibold',
                      selectedInsight.status === 'Exceptional' && 'text-emerald-400',
                      selectedInsight.status === 'Great' && 'text-blue-400',
                      selectedInsight.status === 'Good' && 'text-amber-400'
                    )}
                  >
                    {selectedInsight.status}
                  </span>
                  <span className="text-xs text-(--nd-text-muted)">Score Reasoning</span>
                </div>
                <Pencil className="w-4 h-4 text-(--nd-text-muted)" />
              </div>

              <div className="rounded-lg border border-(--nd-border) bg-(--nd-bg) p-4 space-y-3">
                <h4 className="text-sm font-semibold text-(--nd-text-primary)">Prompt &amp; Response</h4>
                <div>
                  <p className="text-xs text-(--nd-text-muted) mb-1">Prompt</p>
                  <p className="text-sm text-(--nd-text-secondary)">{selectedInsight.prompt}</p>
                </div>
                <div>
                  <p className="text-xs text-(--nd-text-muted) mb-1">Response</p>
                  <ResponseContent
                    text={
                      rows.find((r) => r.property === selectedInsight.property)?.[
                        selectedInsight.model === 'ChatGPT'
                          ? 'chatgpt'
                          : selectedInsight.model === 'Gemini'
                            ? 'gemini'
                            : 'claude'
                      ]?.response || ''
                    }
                  />
                </div>
              </div>

              <div className="rounded-lg border border-(--nd-border) bg-(--nd-bg) p-4">
                <h4 className="text-sm font-semibold text-(--nd-text-primary) mb-2">Sources and Citations</h4>
                <div className="space-y-1">
                  {(rows
                    .find((r) => r.property === selectedInsight.property)
                    ?.[selectedInsight.model === 'ChatGPT' ? 'chatgpt' : selectedInsight.model === 'Gemini' ? 'gemini' : 'claude']
                    ?.citations?.map((c) => c.source)
                    .filter(Boolean) as string[] | undefined)?.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-xs text-sky-300 hover:text-sky-200 truncate"
                      title={url}
                    >
                      {url}
                    </a>
                  )) || <p className="text-xs text-(--nd-text-muted)">No citations available.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
