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
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FieldTooltip } from '../FieldTooltip'
import { useContentAuditMetricRunner } from './useContentAuditMetricRunner'

export interface PerformanceMetric {
  id?: string | number
  url: string
  fields?: Record<string, any>
  currentRanking?: number | string | null
  ga30DaysTraffic?: number | null
  overallKeywords?: number | null
  firstPageKeywords?: number | null
  timestamp?: string
}

interface PerformanceMetricsTableProps {
  data: PerformanceMetric[]
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
  jobId?: string | null
}

type SortField = keyof PerformanceMetric
type SortDirection = 'asc' | 'desc'

type ColumnCategory = {
  name: string
  columns: (keyof PerformanceMetric)[]
}

const COLUMN_CATEGORIES: ColumnCategory[] = [
  {
    name: 'Ranking & Traffic',
    columns: ['url', 'currentRanking', 'ga30DaysTraffic', 'overallKeywords', 'firstPageKeywords']
  }
]

const FIELD_DESCRIPTIONS: Partial<Record<keyof PerformanceMetric, string>> = {
  url: 'Full web address of the analyzed page. Click to open in a new tab.',
  currentRanking: 'Current SERP ranking position for the primary keyword.',
  ga30DaysTraffic: 'Google Analytics 4 sessions for this page in the last 30 days.',
  overallKeywords: 'Total number of keywords this page ranks for across all positions.',
  firstPageKeywords: 'Number of keywords ranking on the first page of search results.',
  timestamp: 'Date and time when this data was collected.',
}

const DEFAULT_VISIBLE_COLUMNS: Set<keyof PerformanceMetric> = new Set([
  'url', 
  'currentRanking',
  'ga30DaysTraffic', 
  'overallKeywords', 
  'firstPageKeywords'
] as (keyof PerformanceMetric)[])

export function PerformanceMetrics({ 
  data = [], 
  isLoading = false,
  onRefresh,
  onExport,
  jobId
}: PerformanceMetricsTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [urlFilter, setUrlFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('url')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [visibleColumns, setVisibleColumns] = useState<Set<keyof PerformanceMetric>>(DEFAULT_VISIBLE_COLUMNS)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const itemsPerPage = 20

  const uniqueData = useMemo(() => {
    const seen = new Set<string>()
    const result: PerformanceMetric[] = []

    data.forEach((page) => {
      const key = page.url || ''
      if (key && seen.has(key)) {
        return
      }
      if (key) {
        seen.add(key)
      }
      result.push({
        ...page,
        fields: (page as any).fields ?? {},
      })
    })

    return result
  }, [data])

  const metricRunner = useContentAuditMetricRunner({
    jobId,
    metric: 'performance-metrics',
    data: uniqueData,
    onRefresh,
    getLastRunAt: (row) => row.fields?.performance_metrics_last_run_at,
    persistLoading: true,
  })

  // Filter data based on search and URL filter
  const filteredData = useMemo(() => {
    let filtered = uniqueData

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(page => 
        page.url.toLowerCase().includes(query)
      )
    }

    if (urlFilter.trim()) {
      const query = urlFilter.toLowerCase()
      filtered = filtered.filter(page => 
        page.url.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [uniqueData, searchQuery, urlFilter])

  // Sort data
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      
      return 0
    })
  }, [filteredData, sortField, sortDirection])

  // Paginate data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return sortedData.slice(startIndex, startIndex + itemsPerPage)
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

  const toggleColumn = (column: keyof PerformanceMetric) => {
    const newVisibleColumns = new Set(visibleColumns)
    const isAdding = !newVisibleColumns.has(column)
    if (newVisibleColumns.has(column)) {
      newVisibleColumns.delete(column)
    } else {
      newVisibleColumns.add(column)
    }
    setVisibleColumns(newVisibleColumns)
    
    // Scroll to end when adding a new column
    if (isAdding && tableContainerRef.current) {
      setTimeout(() => {
        tableContainerRef.current?.scrollTo({
          left: tableContainerRef.current.scrollWidth,
          behavior: 'smooth'
        })
      }, 100)
    }
  }

  const toggleCategoryColumns = (category: ColumnCategory) => {
    const newVisibleColumns = new Set(visibleColumns)
    const visibleInCategory = category.columns.filter(col => visibleColumns.has(col)).length
    const shouldShowAll = visibleInCategory < category.columns.length

    category.columns.forEach(col => {
      if (shouldShowAll) {
        newVisibleColumns.add(col)
      } else {
        newVisibleColumns.delete(col)
      }
    })
    setVisibleColumns(newVisibleColumns)
  }

  const getCategoryVisibleCount = (category: ColumnCategory) => {
    const visible = category.columns.filter(col => visibleColumns.has(col)).length
    return { visible, total: category.columns.length }
  }

  // Get visible columns in correct order based on COLUMN_CATEGORIES
  const getOrderedVisibleColumns = (): (keyof PerformanceMetric)[] => {
    const ordered: (keyof PerformanceMetric)[] = []
    for (const category of COLUMN_CATEGORIES) {
      for (const column of category.columns) {
        if (visibleColumns.has(column)) {
          ordered.push(column)
        }
      }
    }
    return ordered
  }

  const orderedVisibleColumns = useMemo(() => getOrderedVisibleColumns(), [visibleColumns])

  const getColumnLabel = (column: keyof PerformanceMetric): string => {
    const labels: Record<string, string> = {
      url: 'URL',
      currentRanking: 'Current Ranking',
      ga30DaysTraffic: '30 Days GA Traffic',
      overallKeywords: 'Overall Keywords',
      firstPageKeywords: '1st Page Keywords',
      timestamp: 'Timestamp'
    }
    return labels[column] || column
  }

  // Columns that support sorting
  const sortableColumns: Set<keyof PerformanceMetric> = new Set([
    'url', 'currentRanking', 'ga30DaysTraffic', 'overallKeywords', 'firstPageKeywords', 'timestamp'
  ] as (keyof PerformanceMetric)[])

  const renderTableHeader = (column: keyof PerformanceMetric) => {
    const isSortable = sortableColumns.has(column)
    const label = getColumnLabel(column)

    return (
      <th
        key={String(column)}
        className={`px-3 py-2 text-center text-xs font-semibold text-zinc-200 whitespace-nowrap ${
          isSortable ? 'cursor-pointer hover:bg-zinc-800/50' : ''
        }`}
        onClick={isSortable ? () => handleSort(column as SortField) : undefined}
      >
        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
          {label}
          {isSortable && <SortIcon field={column as SortField} />}
          <FieldTooltip description={FIELD_DESCRIPTIONS[column] ?? ''} />
        </div>
      </th>
    )
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  const renderCellContent = (page: PerformanceMetric, column: keyof PerformanceMetric) => {
    const value = page[column]

    if (value === undefined || value === null || value === '') {
      return <span className="text-zinc-600 text-xs select-none">—</span>
    }

    switch (column) {
      case 'url':
        return (
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1"
          >
            <span className="truncate max-w-xs">{page.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )

      case 'currentRanking': {
        if (value === '100+') {
          return <Badge className="bg-zinc-700/40 text-zinc-300 border-zinc-600/30">100+</Badge>
        }

        const v = Number(value)
        if (!Number.isFinite(v)) {
          return <span className="text-zinc-600 text-xs select-none">—</span>
        }

        const color = v <= 3  ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                      v <= 10 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                                'bg-zinc-700/40 text-zinc-300 border-zinc-600/30'
        return <Badge className={color}>{v}</Badge>
      }

      case 'ga30DaysTraffic': {
        const v = Number(value)
        const color = v >= 1000 ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                      v >= 100  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
                                  'bg-zinc-700/40 text-zinc-300 border-zinc-600/30'
        return <Badge className={color}>{v.toLocaleString()}</Badge>
      }

      case 'overallKeywords':
      case 'firstPageKeywords':
        return <span className="font-mono text-zinc-300">{Number(value).toLocaleString()}</span>

      case 'timestamp':
        return <span className="text-zinc-400 text-[10px]">{new Date(value as string).toLocaleString()}</span>

      default:
        return <span className="text-zinc-300">{String(value)}</span>
    }
  }

  const avgGA = uniqueData.length
    ? Math.round(uniqueData.reduce((sum, p) => sum + (p.ga30DaysTraffic ?? 0), 0) / uniqueData.length)
    : 0

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Option Bar: Header with Controls & Stats */}
      <div className="flex flex-col gap-3">
        {/* Header with Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex-1 w-full sm:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search by URL..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 text-sm rounded-xl"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => metricRunner.runAll()}
              variant="outline"
              size="sm"
              disabled={!jobId || uniqueData.length === 0 || metricRunner.isProcessing || metricRunner.isSubmitting}
              className="bg-white text-black border-white hover:bg-zinc-100 rounded-xl"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${metricRunner.isProcessing ? 'animate-spin' : ''}`} />
              {metricRunner.isProcessing ? `Running ${metricRunner.pendingCount}...` : 'Run All URLs'}
            </Button>
            {onRefresh && (
              <Button
                onClick={onRefresh}
                variant="outline"
                size="sm"
                className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl"
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
            {onExport && (
              <Button
                onClick={onExport}
                variant="outline"
                size="sm"
                className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Total Pages</div>
            <div className="text-xl font-bold text-white mt-1">{uniqueData.length}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Filtered</div>
            <div className="text-xl font-bold text-white mt-1">{filteredData.length}</div>
          </div>
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">Avg GA Traffic (30d)</div>
            <div className="text-xl font-bold text-white mt-1">{avgGA.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Sidebar Filter Panel */}
        <div className={`${sidebarOpen ? 'w-68' : 'w-0'} transition-all duration-300 overflow-hidden shrink-0`}>
          {sidebarOpen && (
            <div className="bg-[#0D0D10] border border-zinc-800 rounded-xl p-4 h-full overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Column Filters</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(false)}
                  className="text-zinc-500 hover:text-white p-1 h-auto hover:bg-zinc-800/60"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* URL Filter */}
              <div className="mb-4">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Filter by URL</label>
                <Input
                  placeholder="URL path..."
                  value={urlFilter}
                  onChange={(e) => {
                    setUrlFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 text-xs h-8 rounded-lg"
                />
              </div>

              {/* Column Visibility by Category */}
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
                          <label
                            key={String(column)}
                            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white cursor-pointer"
                          >
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

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col h-full">
          {/* Open Sidebar Button */}
          {!sidebarOpen && (
            <div className="mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <ChevronRight className="h-4 w-4 mr-2" />
                Show Filters
              </Button>
            </div>
          )}

          {/* Table */}
          <div className="rounded-xl border border-zinc-800 bg-[#111113] overflow-hidden flex-1 min-h-0">
            <div
              ref={tableContainerRef}
              className="overflow-x-auto overflow-y-auto max-w-full h-full custom-scrollbar"
            >
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-10">
                  <tr>
                    {orderedVisibleColumns.map(column => renderTableHeader(column))}
                    <th className="px-3 py-2 text-center text-xs font-semibold text-zinc-200 whitespace-nowrap sticky right-0 z-20 bg-zinc-900/80 border-l border-zinc-800">
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
                    paginatedData.map((page, index) => (
                      <tr
                        key={page.id ?? page.url ?? index}
                        className="group hover:bg-zinc-800/50 transition-colors"
                      >
                        {orderedVisibleColumns.map((column) => (
                          <td key={String(column)} className="px-3 py-2 text-zinc-200 text-center whitespace-normal overflow-wrap-break-word">
                            {renderCellContent(page, column)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center sticky right-0 z-10 bg-[#111113] group-hover:bg-zinc-800/50 border-l border-zinc-800 transition-colors">
                          {(metricRunner.isRunning(page.url) || !page.fields?.performance_metrics_last_run_at) && (
                            <Button
                              onClick={() => metricRunner.runOne(page.url)}
                              variant="outline"
                              size="sm"
                              disabled={!jobId || metricRunner.isRunning(page.url)}
                              className="bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl min-w-24"
                            >
                              <RefreshCw className={`h-4 w-4 mr-2 ${metricRunner.isRunning(page.url) ? 'animate-spin' : ''}`} />
                              {metricRunner.isRunning(page.url) ? 'Running' : 'Run'}
                            </Button>
                          )}
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
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40 rounded-xl"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
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
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
