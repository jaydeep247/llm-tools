'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetPerceptionSourcesOverviewQuery } from '@/store/api/module_E/moduleEApi'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const COLORS = ['#3b82f6', '#f97316', '#22c55e', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

export default function SourcesOverview({ jobId, customerRootDomain }: { jobId?: string; customerRootDomain?: string }) {
  const [llmFilter, setLlmFilter] = useState('All Models')
  const [topicFilter, setTopicFilter] = useState('All Topics')
  const canQuery = Boolean(jobId && customerRootDomain)
  const { data, isLoading, isFetching } = useGetPerceptionSourcesOverviewQuery(
    {
      job_id: jobId ?? '',
      customer_root_domain: customerRootDomain ?? '',
      llm: llmFilter,
      property: topicFilter,
      type: 'all',
    },
    { skip: !canQuery }
  )
  const overview = data?.data
  const domainShare = (overview?.domain_share ?? []).slice(0, 7).map((d, idx) => ({
    name: d.domain,
    percent: d.share_pct,
    color: COLORS[idx % COLORS.length],
  }))
  const topSeries = (overview?.trend?.series ?? []).slice(0, 4).map((series, idx) => ({
    domain: series.domain,
    color: COLORS[idx % COLORS.length],
    points: series.points ?? [],
  }))
  const chartData = useMemo(() => {
    const timeline = overview?.trend?.timeline ?? []
    if (timeline.length === 0) return []
    return timeline.map((week) => {
      const row: Record<string, string | number> = { week }
      topSeries.forEach((series) => {
        const point = series.points.find((p) => p.week_start === week)
        row[series.domain] = point?.share_pct ?? 0
      })
      return row
    })
  }, [overview, topSeries])
  const formatWeekLabel = (value: string) => {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FilterSelect
            label="Filter by LLM"
            value={llmFilter}
            onChange={setLlmFilter}
            options={['All Models', 'ChatGPT', 'Gemini', 'Claude']}
          />
          <FilterSelect
            label="Filter by Topic"
            value={topicFilter}
            onChange={setTopicFilter}
            options={['All Topics', 'Functionality', 'Pricing', 'Data Security', 'Integrations', 'Customer Support', 'Customization', 'User Experience', 'Other']}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <KpiCard label="Total Sources" value={String(overview?.kpis?.total_sources ?? 0)} />
          <KpiCard label="Unique Domains" value={String(overview?.kpis?.unique_domains ?? 0)} />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-100">Most Cited Domains Over Time</h3>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-zinc-300 border border-zinc-700 rounded-md px-2 py-1 bg-zinc-900/50"
          >
            Over time
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="week"
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatWeekLabel}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  labelFormatter={(label) => formatWeekLabel(String(label))}
                  contentStyle={{
                    backgroundColor: '#0b0b0f',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '10px',
                    color: '#e4e4e7',
                  }}
                  formatter={(value: number, name: string) => [`${Number(value).toFixed(1)}%`, name]}
                />
                {topSeries.map((series) => (
                  <Line
                    key={series.domain}
                    type="monotone"
                    dataKey={series.domain}
                    name={series.domain}
                    stroke={series.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2">
              Domains Shown
            </div>
            <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1">
              {domainShare.map((domain) => (
                <div
                  key={domain.name}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: domain.color }}
                    />
                    <span className="text-xs text-zinc-300 truncate">{domain.name}</span>
                  </div>
                  <span className="text-xs text-zinc-400 shrink-0">{domain.percent.toFixed(1)}%</span>
                </div>
              ))}
              {domainShare.length === 0 && !isLoading && !isFetching && (
                <p className="text-xs text-zinc-500 px-2 py-1.5">No domain data found.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      {(isLoading || isFetching) && <p className="text-xs text-zinc-500">Loading sources overview...</p>}
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 py-6 text-center">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-3xl font-semibold text-white mt-2">{value}</p>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full h-10 appearance-none rounded-lg border border-zinc-700 bg-zinc-900/50',
            'px-3 pr-8 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600'
          )}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  )
}
