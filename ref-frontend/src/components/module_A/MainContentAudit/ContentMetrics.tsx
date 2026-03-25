'use client'

import { useState, useMemo, useRef } from 'react'
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Search,
  Download,
  RefreshCw,
  X,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FieldTooltip } from '../FieldTooltip'
import { useContentAuditMetricRunner } from './useContentAuditMetricRunner'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ContentMetric {
  id?: string | number
  url: string
  fields?: Record<string, any>
  currentWordCount?: number | null
  serpIntentWordCount?: number | null
  needToAddWordCount?: number | null
  publishedDate?: string | null
  upgradeDate?: string | null
}

interface ContentMetricsTableProps {
  data: ContentMetric[]
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
  jobId?: string | null
}

type SortField = keyof ContentMetric
type SortDirection = 'asc' | 'desc'

type ColumnCategory = {
  name: string
  columns: (keyof ContentMetric)[]
}

// ── Column categories ──────────────────────────────────────────────────────────

const COLUMN_CATEGORIES: ColumnCategory[] = [
  {
    name: 'Basic Info',
    columns: ['url'],
  },
  {
    name: 'Word Count & Dates',
    columns: ['currentWordCount', 'serpIntentWordCount', 'needToAddWordCount', 'publishedDate', 'upgradeDate'],
  },
]

// ── Tooltips ───────────────────────────────────────────────────────────────────

const FIELD_DESCRIPTIONS: Partial<Record<keyof ContentMetric, string>> = {
  url: 'Full web address of the analyzed page. Click to open in a new tab.',
  currentWordCount: 'Total word count of the page content extracted from HTML.',
  serpIntentWordCount: 'Median word count of the top-ranking SERP pages for the target keyword.',
  needToAddWordCount: 'Difference between SERP intent word count and current word count. Negative means content is longer.',
  publishedDate: 'Date the page was first published.',
  upgradeDate: 'Date the page was last updated/modified.',
}

// ── Default columns shown ──────────────────────────────────────────────────────

const DEFAULT_VISIBLE_COLUMNS: Set<keyof ContentMetric> = new Set([
  'url',
  'currentWordCount',
  'serpIntentWordCount',
  'needToAddWordCount',
  'publishedDate',
  'upgradeDate',
])

// ── Column labels ──────────────────────────────────────────────────────────────

const COLUMN_LABELS: Record<string, string> = {
  url: 'URL',
  currentWordCount: 'Current Word Count',
  serpIntentWordCount: 'SERP Intent Word Count',
  needToAddWordCount: 'Need to Add Words',
  publishedDate: 'Published Date',
  upgradeDate: 'Upgrade Date',
}

const sortableColumns: Set<keyof ContentMetric> = new Set([
  'url',
  'currentWordCount',
  'serpIntentWordCount',
  'needToAddWordCount',
  'publishedDate',
  'upgradeDate',
])

// ── Component ──────────────────────────────────────────────────────────────────

export function ContentMetrics({
  data = [],
  isLoading = false,
  onRefresh,
  onExport,
  jobId,
}: ContentMetricsTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('url')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [visibleColumns, setVisibleColumns] = useState<Set<keyof ContentMetric>>(DEFAULT_VISIBLE_COLUMNS)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const itemsPerPage = 20

  const uniqueData = useMemo(() => {
    const seen = new Set<string>()
    const result: ContentMetric[] = []
    data.forEach((row) => {
      const key = row.url || ''
      if (key && seen.has(key)) return
      if (key) seen.add(key)
      result.push({
        ...row,
        fields: row.fields ?? {},
      })
    })
    return result
  }, [data])

  const metricRunner = useContentAuditMetricRunner({
    jobId,
    metric: 'content-metrics',
    data: uniqueData,
    onRefresh,
    getLastRunAt: (row) => row.fields?.content_metrics_last_run_at,
  })

  const filteredData = useMemo(() => {
    let filtered = uniqueData
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (row) => row.url.toLowerCase().includes(q),
      )
    }
    if (urlFilter.trim()) {
      const q = urlFilter.toLowerCase()
      filtered = filtered.filter((row) => row.url.toLowerCase().includes(q))
    }
    return filtered
  }, [uniqueData, searchQuery, urlFilter])

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (typeof aVal === 'string' && typeof bVal === 'string')
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      if (typeof aVal === 'number' && typeof bVal === 'number')
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      return 0
    })
  }, [filteredData, sortField, sortDirection])

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return sortedData.slice(start, start + itemsPerPage)
  }, [sortedData, currentPage])

  const totalPages = Math.ceil(sortedData.length / itemsPerPage)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const toggleColumn = (column: keyof ContentMetric) => {
    const next = new Set(visibleColumns)
    const isAdding = !next.has(column)
    isAdding ? next.add(column) : next.delete(column)
    setVisibleColumns(next)
    if (isAdding && tableContainerRef.current) {
      setTimeout(() => {
        tableContainerRef.current?.scrollTo({ left: tableContainerRef.current.scrollWidth, behavior: 'smooth' })
      }, 100)
    }
  }

  const toggleCategoryColumns = (category: ColumnCategory) => {
    const next = new Set(visibleColumns)
    const visibleCount = category.columns.filter((c) => visibleColumns.has(c)).length
    const showAll = visibleCount < category.columns.length
    category.columns.forEach((c) => (showAll ? next.add(c) : next.delete(c)))
    setVisibleColumns(next)
  }

  const getCategoryVisibleCount = (category: ColumnCategory) => ({
    visible: category.columns.filter((c) => visibleColumns.has(c)).length,
    total: category.columns.length,
  })

  const orderedVisibleColumns = useMemo(() => {
    const ordered: (keyof ContentMetric)[] = []
    for (const cat of COLUMN_CATEGORIES)
      for (const col of cat.columns)
        if (visibleColumns.has(col)) ordered.push(col)
    return ordered
  }, [visibleColumns])

  const getColumnLabel = (col: keyof ContentMetric) => COLUMN_LABELS[col as string] || (col as string)

  // ── Stats ──────────────────────────────────────────────────────────────────

  const avgWordCount = uniqueData.length > 0
    ? Math.round(uniqueData.reduce((sum, r) => sum + (r.currentWordCount ?? 0), 0) / uniqueData.length)
    : 0
  const needsMoreContent = uniqueData.filter((r) => (r.needToAddWordCount ?? 0) > 0).length
  const hasPublishedDate = uniqueData.filter((r) => r.publishedDate).length

  // ── Cell renderers ─────────────────────────────────────────────────────────

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  const renderTableHeader = (column: keyof ContentMetric) => {
    const isSortable = sortableColumns.has(column)
    return (
      <th
        key={String(column)}
        className={`px-3 py-2 text-center text-xs font-semibold text-zinc-200 whitespace-nowrap ${isSortable ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
        onClick={isSortable ? () => handleSort(column as SortField) : undefined}
      >
        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
          {getColumnLabel(column)}
          {isSortable && <SortIcon field={column as SortField} />}
          <FieldTooltip description={FIELD_DESCRIPTIONS[column] ?? ''} />
        </div>
      </th>
    )
  }

  const renderCellContent = (row: ContentMetric, column: keyof ContentMetric) => {
    const value = row[column]

    switch (column) {
      case 'url':
        if (!value) return 'N/A'
        return (
          <a
            href={String(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1"
          >
            <span className="truncate max-w-xs">{String(value)}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )

      case 'currentWordCount':
      case 'serpIntentWordCount':
        if (value == null) return 'N/A'
        return Number(value).toLocaleString()

      case 'needToAddWordCount': {
        if (value == null) return 'N/A'
        const n = Number(value)
        const color =
          n <= 0 ? 'bg-green-500/20 text-green-300 border-green-500/30' :
          n <= 500 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
          'bg-red-500/20 text-red-300 border-red-500/30'
        return <Badge className={color}>{n > 0 ? '+' : ''}{n.toLocaleString()}</Badge>
      }

      case 'publishedDate':
      case 'upgradeDate': {
        if (!value) return 'N/A'
        try {
          return new Date(String(value)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        } catch {
          return String(value)
        }
      }

      default:
        return value !== null && value !== undefined ? String(value) : 'N/A'
    }
  }

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex-1 w-full sm:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search by URL..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 text-sm rounded-xl"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => metricRunner.runAll()}
              variant="outline"
              size="sm"
              disabled={!jobId || uniqueData.length === 0 || metricRunner.hasPendingRuns || metricRunner.isSubmitting}
              className="bg-blue-600/20 text-blue-400 border-blue-500/30 hover:bg-blue-600/30 rounded-xl"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${metricRunner.hasPendingRuns ? 'animate-spin' : ''}`} />
              {metricRunner.hasPendingRuns ? `Running ${metricRunner.pendingCount}...` : 'Run All URLs'}
            </Button>
            {onRefresh && (
              <Button onClick={onRefresh} variant="outline" size="sm" className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl" disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
            {onExport && (
              <Button onClick={onExport} variant="outline" size="sm" className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Total Pages</div>
            <div className="text-xl font-bold text-white mt-1">{uniqueData.length}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Avg Word Count</div>
            <div className="text-xl font-bold text-white mt-1">{avgWordCount.toLocaleString()}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Needs More Content</div>
            <div className="text-xl font-bold text-white mt-1">{needsMoreContent}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Has Published Date</div>
            <div className="text-xl font-bold text-white mt-1">{hasPublishedDate}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Column filter sidebar */}
        <div className={`${sidebarOpen ? 'w-68' : 'w-0'} transition-all duration-300 overflow-hidden shrink-0`}>
          {sidebarOpen && (
            <div className="bg-[#0D0D10] border border-zinc-800 rounded-xl p-4 h-full overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Column Filters</h3>
                <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)} className="text-zinc-500 hover:text-white p-1 h-auto hover:bg-zinc-800/60">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mb-4">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Filter by URL</label>
                <Input
                  placeholder="URL filter..."
                  value={urlFilter}
                  onChange={(e) => { setUrlFilter(e.target.value); setCurrentPage(1) }}
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 text-xs h-8 rounded-lg"
                />
              </div>

              <div className="space-y-3">
                {COLUMN_CATEGORIES.map((category) => {
                  const { visible, total } = getCategoryVisibleCount(category)
                  return (
                    <div key={category.name} className="space-y-2">
                      <button
                        onClick={() => toggleCategoryColumns(category)}
                        className="flex items-center justify-between w-full text-xs font-medium text-zinc-200 hover:text-white"
                      >
                        <span>{category.name}</span>
                        <span className="text-zinc-500">{visible}/{total}</span>
                      </button>
                      <div className="space-y-1 pl-2">
                        {category.columns.map((column) => (
                          <label key={String(column)} className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={visibleColumns.has(column)}
                              onChange={() => toggleColumn(column)}
                              className="rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-0"
                            />
                            <span className="truncate">{getColumnLabel(column)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Main table */}
        <div className="flex-1 min-w-0 flex flex-col h-full">
          {!sidebarOpen && (
            <div className="mb-3">
              <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)} className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                <ChevronRight className="h-4 w-4 mr-2" />
                Show Filters
              </Button>
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 bg-[#111113] overflow-hidden flex-1 min-h-0">
            <div ref={tableContainerRef} className="overflow-x-auto overflow-y-auto max-w-full h-full custom-scrollbar">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-10">
                  <tr>
                    {orderedVisibleColumns.map((col) => renderTableHeader(col))}
                    <th className="px-3 py-2 text-center text-xs font-semibold text-zinc-200 whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {isLoading ? (
                    <tr>
                      <td colSpan={visibleColumns.size + 1} className="px-4 py-12 text-center">
                        <div className="flex items-center justify-center gap-2 text-zinc-400">
                          <RefreshCw className="h-5 w-5 animate-spin" />
                          <span>Loading data...</span>
                        </div>
                      </td>
                    </tr>
                  ) : paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.size + 1} className="px-4 py-12 text-center text-zinc-400">
                        No pages found. {(searchQuery || urlFilter) && 'Try adjusting your filters.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((row, index) => (
                      <tr key={row.id ?? row.url ?? index} className="hover:bg-zinc-800/50 transition-colors">
                        {orderedVisibleColumns.map((column) => (
                          <td key={String(column)} className="px-3 py-2 text-zinc-200 text-center whitespace-normal overflow-wrap-break-word">
                            {renderCellContent(row, column)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center">
                          <Button
                            onClick={() => metricRunner.runOne(row.url)}
                            variant="outline"
                            size="sm"
                            disabled={!jobId || metricRunner.isRunning(row.url)}
                            className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl min-w-24"
                          >
                            <RefreshCw className={`h-4 w-4 mr-2 ${metricRunner.isRunning(row.url) ? 'animate-spin' : ''}`} />
                            {metricRunner.isRunning(row.url) ? 'Running' : 'Run'}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-2">
              <div className="text-sm text-zinc-500">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} results
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 rounded-xl"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) pageNum = i + 1
                    else if (currentPage <= 3) pageNum = i + 1
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                    else pageNum = currentPage - 2 + i
                    return (
                      <Button
                        key={pageNum} variant="outline" size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`rounded-xl ${currentPage === pageNum ? 'bg-white text-black border-white' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 rounded-xl"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
