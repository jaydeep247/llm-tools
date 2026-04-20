'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronDown, Download, ExternalLink, Search, X } from 'lucide-react'
import {
  useGetPerceptionSourceResponsesQuery,
  useGetPerceptionSourcesQuery,
} from '@/store/api/module_E/moduleEApi'

type SourceUrl = {
  url: string
  responses: number
}

type SourceDomain = {
  domain: string
  totalUrls: number
  responses: number
  urls: SourceUrl[]
}

type ResponseRow = {
  prompt: string
  property: string
  llm: string
  score: 'Good' | 'Great' | 'Exceptional'
}

const LLM_OPTIONS = ['All Models', 'ChatGPT', 'Gemini', 'Claude']
const PROPERTY_OPTIONS = [
  'All Properties',
  'Functionality',
  'Pricing',
  'Data Security',
  'Integrations',
  'Customer Support',
  'Customization',
  'User Experience',
  'Other',
]
const TYPE_OPTIONS: Array<{ label: string; value: 'all' | 'owned' | 'third-party' }> = [
  { label: 'All Types', value: 'all' },
  { label: 'Owned', value: 'owned' },
  { label: 'Third-party', value: 'third-party' },
]

export default function PerceptionSources({
  jobId,
  customerRootDomain,
}: {
  jobId?: string
  customerRootDomain?: string
}) {
  const [search, setSearch] = useState('')
  const [llmFilter, setLlmFilter] = useState('All Models')
  const [propertyFilter, setPropertyFilter] = useState('All Properties')
  const [typeFilter, setTypeFilter] = useState<'all' | 'owned' | 'third-party'>('all')
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)
  const [responsesPanelDomain, setResponsesPanelDomain] = useState<string | null>(null)

  const canQuery = Boolean(jobId && customerRootDomain)
  const { data, isLoading, isFetching, error } = useGetPerceptionSourcesQuery(
    {
      job_id: jobId ?? '',
      customer_root_domain: customerRootDomain ?? '',
      search,
      llm: llmFilter,
      property: propertyFilter,
      type: typeFilter,
    },
    { skip: !canQuery }
  )

  const filteredData: SourceDomain[] = useMemo(() => data?.data?.domains ?? [], [data])
  const totalResponses = data?.data?.totals?.responses ?? 0
  const totalUrls = data?.data?.totals?.unique_urls ?? 0

  const { data: responsesData, isFetching: isResponsesFetching } = useGetPerceptionSourceResponsesQuery(
    {
      job_id: jobId ?? '',
      domain: responsesPanelDomain ?? '',
      customer_root_domain: customerRootDomain ?? '',
      llm: llmFilter,
      property: propertyFilter,
      type: typeFilter,
    },
    { skip: !canQuery || !responsesPanelDomain }
  )

  const toLlmLabel = (value: string) => {
    const v = value.toLowerCase()
    if (v.includes('gpt')) return 'ChatGPT'
    if (v.includes('gemini')) return 'Gemini'
    if (v.includes('claude')) return 'Claude'
    return value || 'Unknown'
  }

  const toScore = (property: string): ResponseRow['score'] => {
    if (property === 'Functionality' || property === 'Integrations') return 'Exceptional'
    if (property === 'Pricing' || property === 'Data Security') return 'Great'
    return 'Good'
  }

  const responseRows = useMemo(() => {
    const rows = responsesData?.data?.rows ?? []
    return rows.map((row) => ({
      prompt: row.prompt,
      property: row.property,
      llm: toLlmLabel(row.llm),
      score: toScore(row.property),
    }))
  }, [responsesData])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-center w-full">
          <h2 className="text-xl font-semibold text-white">Perception Sources</h2>
          <p className="text-sm text-zinc-400 mt-1">Websites cited in perception analysis responses</p>
        </div>
        <Button
          variant="outline"
          className="shrink-0 border-zinc-700 bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#111113] overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-zinc-400">Search domains</p>
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sources..."
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-zinc-700 bg-zinc-900/50 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>
            </div>

            <FilterSelect
              label="Filter by LLM"
              value={llmFilter}
              onChange={setLlmFilter}
              options={LLM_OPTIONS}
            />
            <FilterSelect
              label="Filter by Property"
              value={propertyFilter}
              onChange={setPropertyFilter}
              options={PROPERTY_OPTIONS}
            />
            <FilterSelect
              label="Filter by Type"
              value={TYPE_OPTIONS.find((option) => option.value === typeFilter)?.label ?? 'All Types'}
              onChange={(value) =>
                setTypeFilter(TYPE_OPTIONS.find((option) => option.label === value)?.value ?? 'all')
              }
              options={TYPE_OPTIONS.map((option) => option.label)}
            />
          </div>
        </div>

        <div className="px-4 py-3 text-sm text-zinc-400 border-b border-zinc-800">
          {filteredData.length} domains ({totalUrls} URLs) found
          <span className="ml-2 text-zinc-500">• {totalResponses} responses</span>
        </div>

        <div className="p-3 space-y-2 max-h-[520px] overflow-y-auto">
          {!canQuery && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              Perception sources require a valid job and domain context.
            </div>
          )}
          {canQuery && (isLoading || isFetching) && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              Loading sources...
            </div>
          )}
          {canQuery && error && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-300">
              Failed to load perception sources.
            </div>
          )}
          {canQuery && !isLoading && !isFetching && filteredData.length === 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              No source citations found for the selected filters.
            </div>
          )}
          {filteredData.map((item) => {
            const isExpanded = expandedDomain === item.domain
            return (
              <div key={item.domain} className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedDomain(isExpanded ? null : item.domain)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-800/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown
                      className={cn('w-4 h-4 text-zinc-500 transition-transform', isExpanded && 'rotate-180')}
                    />
                    <span className="text-sm font-medium text-zinc-100">{item.domain}</span>
                    <span className="text-xs text-zinc-500">({item.totalUrls} URLs)</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setResponsesPanelDomain(item.domain)
                    }}
                    className="text-xs font-medium text-zinc-300 hover:text-white underline-offset-2 hover:underline cursor-pointer"
                  >
                    {item.responses} responses
                  </button>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 space-y-1">
                    {item.urls.map((source) => (
                      <div
                        key={source.url}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-zinc-800/40"
                      >
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-sky-300 hover:text-sky-200 inline-flex items-center gap-1 truncate"
                          title={source.url}
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{source.url}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setResponsesPanelDomain(item.domain)}
                          className="text-[11px] text-zinc-400 shrink-0 hover:text-zinc-200 cursor-pointer"
                        >
                          ({source.responses} responses)
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {responsesPanelDomain && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-start justify-center p-6">
          <div className="w-full max-w-5xl max-h-[88vh] rounded-xl border border-zinc-700 bg-[#111113] overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                Perception responses that cited {responsesPanelDomain}
              </h3>
              <button
                type="button"
                onClick={() => setResponsesPanelDomain(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-auto max-h-[76vh]">
              <table className="w-full min-w-[920px]">
                <thead className="bg-zinc-900/60 border-b border-zinc-800">
                  <tr>
                    <th className="text-left text-xs font-semibold text-zinc-400 px-4 py-3">Prompt</th>
                    <th className="text-left text-xs font-semibold text-zinc-400 px-4 py-3 w-[170px]">Property</th>
                    <th className="text-left text-xs font-semibold text-zinc-400 px-4 py-3 w-[140px]">LLM</th>
                    <th className="text-left text-xs font-semibold text-zinc-400 px-4 py-3 w-[120px]">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {isResponsesFetching && (
                    <tr>
                      <td className="px-4 py-3 text-xs text-zinc-400" colSpan={4}>
                        Loading responses...
                      </td>
                    </tr>
                  )}
                  {!isResponsesFetching && responseRows.length === 0 && (
                    <tr>
                      <td className="px-4 py-3 text-xs text-zinc-400" colSpan={4}>
                        No responses found for this source.
                      </td>
                    </tr>
                  )}
                  {responseRows.map((row, idx) => (
                    <tr key={`${row.llm}-${idx}`} className="hover:bg-zinc-800/30">
                      <td className="px-4 py-3 text-xs text-zinc-300">{row.prompt}</td>
                      <td className="px-4 py-3 text-xs text-zinc-300">{row.property}</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] px-2 py-1 rounded bg-zinc-800 text-zinc-300">{row.llm}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'text-xs font-medium',
                            row.score === 'Exceptional' && 'text-emerald-400',
                            row.score === 'Great' && 'text-blue-400',
                            row.score === 'Good' && 'text-amber-400'
                          )}
                        >
                          {row.score}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
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
          className="w-full h-10 appearance-none rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 pr-8 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
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
